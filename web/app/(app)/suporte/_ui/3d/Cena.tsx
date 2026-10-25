"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentRef, ComponentType } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Box3, Camera, MathUtils, Object3D, TOUCH, Vector3 } from "three";
import type { Group, PerspectiveCamera } from "three";

import type { ModeloComCena } from "@/lib/suporte/modelos3d";

import { CAMERA_INICIAL, ContextoCena, lerPaleta } from "./Peca";
import type { ModeloProps, Paleta } from "./Peca";
import { Bomba } from "./Bomba";
import { Cilindro } from "./Cilindro";
import { Correia } from "./Correia";
import { Esteira } from "./Esteira";
import { Motor } from "./Motor";
import { Redutor } from "./Redutor";
import { Rolamento } from "./Rolamento";
import { Valvula } from "./Valvula";

/** Tipado pelo mesmo `MODELOS_COM_CENA` de modelos3d.ts: um modelo novo exige a cena aqui, e vice-versa. */
const COMPONENTES: Record<ModeloComCena, ComponentType<ModeloProps>> = {
  rolamento: Rolamento,
  motor: Motor,
  redutor: Redutor,
  correia: Correia,
  bomba: Bomba,
  cilindro: Cilindro,
  valvula: Valvula,
  esteira: Esteira,
};

const DISTANCIA_MINIMA = 0.5;
const DISTANCIA_MAXIMA = 9;

export interface CenaProps {
  modelo: ModeloComCena;
  /** id da peça em destaque (vermelho, com a câmera focada nela); null = modelo inteiro */
  destaque: string | null;
  explodir: boolean;
  /** giro automático lento do modelo */
  girar: boolean;
  reduzir: boolean;
  /** o bloco está na tela: sem isso o canvas fica parado ("never") */
  naTela: boolean;
  /** contador: cada clique em Recentrar aumenta; volta ao modelo inteiro mesmo sem peça em foco */
  recentrar: number;
  aoClicarPeca: (id: string) => void;
  /** o navegador perdeu o contexto WebGL: a página mostra a mensagem de indisponível */
  aoPerderContexto: () => void;
}

type ControlesOrbita = ComponentRef<typeof OrbitControls>;

/** Canvas do three.js (WebGL). Carregado só no cliente, pelo Visualizador3D, quando o bloco entra na tela. */
export function Cena(props: CenaProps) {
  return (
    <Canvas
      frameloop={props.naTela ? "demand" : "never"}
      dpr={[1, 2]}
      camera={{ position: CAMERA_INICIAL, fov: 35 }}
      gl={{ antialias: true, alpha: true }}
      style={{ position: "absolute", inset: 0 }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          props.aoPerderContexto();
        });
      }}
    >
      <CenaInterna {...props} />
    </Canvas>
  );
}

/** Folga em volta da caixa enquadrada (25%). */
const FOLGA = 1.25;
/** O foco numa peça pequena não se aproxima além disso: a distância é pelo menos esta fração da do modelo inteiro. */
const FRACAO_MINIMA_MODELO = 0.55;

/** Distância que faz a esfera envolvente da caixa caber na altura e na largura do campo de visão (sem folga). */
function distanciaAjuste(camera: Camera, caixa: Box3): number {
  const raio = caixa.getSize(new Vector3()).length() / 2;
  const cam = camera as PerspectiveCamera;
  const vFov = MathUtils.degToRad(cam.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect);
  return Math.max(raio / Math.sin(vFov / 2), raio / Math.sin(hFov / 2));
}

/**
 * Enquadramento: sem peça, a distância cabe o modelo inteiro. Com peça, a distância é
 * max(caber a peça * folga, 55% da distância do modelo inteiro), limitada aos limites dos controles.
 * Assim a peça pequena (pinhão, vedação) fica em foco sem a câmera entrar nela, e o entorno continua visível.
 */
function enquadrar(
  camera: Camera,
  caixaModelo: Box3,
  caixaPeca: Box3 | null,
): { centro: Vector3; distancia: number } {
  const fitModelo = distanciaAjuste(camera, caixaModelo) * FOLGA;
  const alvo = caixaPeca ?? caixaModelo;
  const distancia = caixaPeca
    ? Math.max(distanciaAjuste(camera, caixaPeca) * FOLGA, FRACAO_MINIMA_MODELO * fitModelo)
    : fitModelo;
  return {
    centro: alvo.getCenter(new Vector3()),
    distancia: MathUtils.clamp(distancia, DISTANCIA_MINIMA, DISTANCIA_MAXIMA),
  };
}

function CenaInterna({ modelo, destaque, explodir, girar, reduzir, naTela, recentrar, aoClicarPeca }: CenaProps) {
  const Modelo = COMPONENTES[modelo];
  const raiz = useRef<Group>(null);
  const fase = useRef(0);
  /** a sombra de contato fica logo abaixo do modelo montado (cada modelo tem um tamanho) */
  const [sombraY, setSombraY] = useState(-1.25);
  const controles = useRef<ControlesOrbita>(null);
  /** foco animado: para onde a câmera e o alvo devem ir */
  const foco = useRef<{ alvo: Vector3; posicao: Vector3 } | null>(null);
  /** objeto enquadrado (peça ou modelo inteiro) e o último centro dele: se o centro se mover (vista explodida), a câmera acompanha */
  const seguido = useRef<Object3D | null>(null);
  // objetos reutilizados em todo quadro: nada é criado por quadro
  const caixa = useMemo(() => new Box3(), []);
  const centroSeguido = useMemo(() => new Vector3(), []);
  const centroAtual = useMemo(() => new Vector3(), []);
  const deslocamento = useMemo(() => new Vector3(), []);
  const { camera, invalidate } = useThree();
  const paleta = useMemo<Paleta>(() => lerPaleta(), []);
  const estado = useMemo(
    () => ({ destaque, paleta, reduzir, aoClicarPeca }),
    [destaque, paleta, reduzir, aoClicarPeca],
  );

  useEffect(() => {
    const g = raiz.current;
    if (!g) return;
    const b = new Box3().setFromObject(g);
    if (!b.isEmpty()) setSombraY(b.min.y - 0.08);
  }, [modelo]);

  // Ao trocar a peça ou ao recentrar, prepara o enquadramento da peça ou do modelo inteiro.
  useEffect(() => {
    const grupo = raiz.current;
    const ctl = controles.current;
    if (!grupo || !ctl) return;
    const objeto = destaque ? grupo.getObjectByName(destaque) ?? null : null;
    const caixaModelo = new Box3().setFromObject(grupo);
    const caixaPeca = objeto ? new Box3().setFromObject(objeto) : null;
    if (caixaModelo.isEmpty() || (caixaPeca && caixaPeca.isEmpty())) return;
    const { centro, distancia } = enquadrar(camera, caixaModelo, caixaPeca);
    const direcao = camera.position.clone().sub(ctl.target);
    if (direcao.lengthSq() < 1e-6) direcao.set(0.6, 0.4, 1);
    direcao.normalize();
    foco.current = { alvo: centro, posicao: centro.clone().addScaledVector(direcao, distancia) };
    seguido.current = objeto ?? grupo;
    centroSeguido.copy(centro);
    invalidate();
  }, [destaque, recentrar, camera, invalidate, centroSeguido]);

  // Quando parado, a cena só desenha ao pedido: os efeitos abaixo acordam o próximo quadro.
  useEffect(() => {
    invalidate();
  }, [destaque, explodir, girar, reduzir, naTela, invalidate]);

  useFrame((estadoQuadro, dt) => {
    const ctl = controles.current;
    const f = foco.current;
    if (ctl && f) {
      if (reduzir) {
        ctl.target.copy(f.alvo);
        camera.position.copy(f.posicao);
        foco.current = null;
      } else {
        // amortecimento independente da taxa de quadros
        const k = 1 - Math.exp(-6 * dt);
        ctl.target.lerp(f.alvo, k);
        camera.position.lerp(f.posicao, k);
        const chegou =
          ctl.target.distanceTo(f.alvo) < 0.001 && camera.position.distanceTo(f.posicao) < 0.001;
        if (chegou) {
          ctl.target.copy(f.alvo);
          camera.position.copy(f.posicao);
          foco.current = null;
        } else {
          estadoQuadro.invalidate();
        }
      }
      ctl.update();
    } else if (ctl && seguido.current) {
      // com o foco assentado, o centro da peça pode ter mudado (vista explodida): a câmera anda junto
      caixa.setFromObject(seguido.current);
      if (!caixa.isEmpty()) {
        caixa.getCenter(centroAtual);
        if (centroAtual.distanceToSquared(centroSeguido) > 1e-10) {
          deslocamento.subVectors(centroAtual, centroSeguido);
          ctl.target.add(deslocamento);
          camera.position.add(deslocamento);
          centroSeguido.copy(centroAtual);
          ctl.update();
          estadoQuadro.invalidate();
        }
      }
    }
    const g = raiz.current;
    if (g && girar) {
      // oscila ±20° em vez de girar a volta inteira: o corte continua voltado para quem olha
      fase.current += dt * 0.6;
      g.rotation.y = 0.35 * Math.sin(fase.current);
      estadoQuadro.invalidate();
    }
  });

  return (
    <>
      {/* iluminação de estúdio: ambiente gerado no próprio navegador (sem baixar arquivos), para o metal refletir */}
      <Environment resolution={256} frames={1}>
        {/* fundo cinza de estúdio: sem ele, o metal polido reflete preto onde não há painel de luz */}
        <color attach="background" args={["#7d858c"]} />
        <Lightformer form="rect" intensity={2.2} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-5, 1, 2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[5, 1, -1]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="ring" intensity={0.8} position={[2, 2, 5]} scale={2} />
        <Lightformer form="rect" intensity={0.5} position={[0, -4, 0]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} />
      </Environment>
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 5, 4]} intensity={1.2} />
      <ContactShadows position={[0, sombraY, 0]} opacity={0.35} scale={8} blur={2.6} far={3} />
      {/* toque: um dedo gira (o gesto vertical rola a página, por touch-action no contêiner); dois dedos aproximam e giram; sem arrastar lateral */}
      <OrbitControls
        ref={controles}
        makeDefault
        minDistance={DISTANCIA_MINIMA}
        maxDistance={DISTANCIA_MAXIMA}
        enablePan={false}
        touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_ROTATE }}
      />
      <ContextoCena.Provider value={estado}>
        <group ref={raiz}>
          <Modelo explodir={explodir} />
        </group>
      </ContextoCena.Provider>
    </>
  );
}
