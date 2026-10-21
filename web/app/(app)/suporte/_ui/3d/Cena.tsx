"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ComponentRef, ComponentType } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Box3, Camera, MathUtils, Vector3 } from "three";
import type { Group, PerspectiveCamera } from "three";

import type { ModeloComCena } from "@/lib/suporte/modelos3d";

import { ContextoCena, lerPaleta } from "./Peca";
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
  aoClicarPeca: (id: string) => void;
}

type ControlesOrbita = ComponentRef<typeof OrbitControls>;

/** Canvas do three.js (WebGL). Carregado só no cliente, pelo Visualizador3D, quando o bloco entra na tela. */
export function Cena(props: CenaProps) {
  return (
    <Canvas
      frameloop={props.naTela ? "demand" : "never"}
      dpr={[1, 2]}
      camera={{ position: [2.6, 1.4, 3.4], fov: 35 }}
      gl={{ antialias: true, alpha: true }}
      style={{ position: "absolute", inset: 0 }}
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

function CenaInterna({ modelo, destaque, explodir, girar, reduzir, naTela, aoClicarPeca }: CenaProps) {
  const Modelo = COMPONENTES[modelo];
  const raiz = useRef<Group>(null);
  const controles = useRef<ControlesOrbita>(null);
  /** foco animado: para onde a câmera e o alvo devem ir */
  const foco = useRef<{ alvo: Vector3; posicao: Vector3 } | null>(null);
  const { camera, invalidate } = useThree();
  const paleta = useMemo<Paleta>(() => lerPaleta(), []);
  const estado = useMemo(
    () => ({ destaque, paleta, reduzir, aoClicarPeca }),
    [destaque, paleta, reduzir, aoClicarPeca],
  );

  // Ao trocar a peça (ou ao recentrar, que zera o destaque), prepara o enquadramento da peça ou do modelo inteiro.
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
    invalidate();
  }, [destaque, camera, invalidate]);

  // Quando parado, a cena só desenha ao pedido: os efeitos abaixo acordam o próximo quadro.
  useEffect(() => {
    invalidate();
  }, [destaque, explodir, girar, reduzir, naTela, invalidate]);

  useFrame((estadoQuadro, delta) => {
    const ctl = controles.current;
    const f = foco.current;
    if (ctl && f) {
      if (reduzir) {
        ctl.target.copy(f.alvo);
        camera.position.copy(f.posicao);
        foco.current = null;
      } else {
        // amortecimento independente da taxa de quadros
        const k = 1 - Math.exp(-6 * delta);
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
    }
    const g = raiz.current;
    if (g && girar) {
      g.rotation.y += delta * 0.3;
      estadoQuadro.invalidate();
    }
  });

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <directionalLight position={[-3, -2, -4]} intensity={0.35} />
      <OrbitControls ref={controles} makeDefault minDistance={DISTANCIA_MINIMA} maxDistance={DISTANCIA_MAXIMA} />
      <ContextoCena.Provider value={estado}>
        <group ref={raiz}>
          <Modelo explodir={explodir} />
        </group>
      </ContextoCena.Provider>
    </>
  );
}
