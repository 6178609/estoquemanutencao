import { createContext, useContext, useMemo, useRef } from "react";
import type { RefObject } from "react";
import type { ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { DoubleSide, Shape, Vector2, Vector3 } from "three";
import type { Group } from "three";

import { mapasDe } from "./texturas";

/** Cores da cena, lidas dos tokens do site (CSS vars) em tempo de execução. Sem hex fixo aqui. */
export interface Paleta {
  aco: string;
  acoClaro: string;
  acoEscuro: string;
  cobre: string;
  borracha: string;
  azul: string;
  destaque: string;
}

/**
 * Nomes CSS usados pela paleta: aço (texto-3, borda-forte, texto-2), cobre (serie-2), borracha (texto, quase preto),
 * azul (serie-1) e destaque (st-critico).
 */
const VARIAVEIS: Record<keyof Paleta, string> = {
  aco: "--texto-3",
  acoClaro: "--borda-forte",
  acoEscuro: "--texto-2",
  cobre: "--serie-2",
  borracha: "--texto",
  azul: "--serie-1",
  destaque: "--st-critico",
};

/** Só para o caso de a variável não existir: cores nomeadas do CSS, sem hex. */
const RESERVA: Paleta = {
  aco: "gray",
  acoClaro: "silver",
  acoEscuro: "dimgray",
  cobre: "chocolate",
  borracha: "black",
  azul: "steelblue",
  destaque: "red",
};

/** Lê a paleta dos tokens do site. Só no cliente. */
export function lerPaleta(): Paleta {
  const pal = { ...RESERVA };
  if (typeof window === "undefined") return pal;
  const estilo = getComputedStyle(document.documentElement);
  for (const chave of Object.keys(VARIAVEIS) as (keyof Paleta)[]) {
    const valor = estilo.getPropertyValue(VARIAVEIS[chave]).trim();
    if (valor) pal[chave] = valor;
  }
  return pal;
}

export type CorBase = Exclude<keyof Paleta, "destaque">;

interface EstadoCena {
  destaque: string | null;
  paleta: Paleta;
  reduzir: boolean;
  aoClicarPeca: (id: string) => void;
}

export const ContextoCena = createContext<EstadoCena>({
  destaque: null,
  paleta: RESERVA,
  reduzir: false,
  aoClicarPeca: () => {},
});

const ContextoPeca = createContext<string>("");

/** Props comuns a todos os modelos: só o estado de montagem vem de fora. */
export interface ModeloProps {
  explodir: boolean;
}

const ORIGEM = new Vector3();

/**
 * Anima um grupo até a vista explodida (`afastamento`, no sistema local do modelo) ou de volta à origem. Com movimento
 * reduzido, muda de uma vez. O alvo é calculado uma vez por valor de `afastamento`, não a cada quadro.
 */
function useAfastar(grupo: RefObject<Group | null>, explodir: boolean, afastamento?: [number, number, number]) {
  const { reduzir } = useContext(ContextoCena);
  const chave = (afastamento ?? [0, 0, 0]).join(",");
  const alvo = useMemo(() => new Vector3(...chave.split(",").map(Number)), [chave]);

  useFrame((estado, delta) => {
    const g = grupo.current;
    if (!g) return;
    const destino = explodir ? alvo : ORIGEM;
    if (reduzir) {
      g.position.copy(destino);
      return;
    }
    g.position.lerp(destino, 1 - Math.exp(-8 * delta));
    if (g.position.distanceTo(destino) > 0.0005) estado.invalidate();
    else g.position.copy(destino);
  });
}

/**
 * Peça nomeada do modelo: um grupo com `name` = id da peça (o mesmo id de MODELOS). Anima a vista explodida
 * até o `afastamento` (no sistema local do modelo); com movimento reduzido, muda de uma vez.
 */
export function Peca({
  id,
  explodir = false,
  afastamento,
  children,
}: {
  id: string;
  explodir?: boolean;
  afastamento?: [number, number, number];
  children: ReactNode;
}) {
  const { aoClicarPeca } = useContext(ContextoCena);
  const grupo = useRef<Group>(null);
  useAfastar(grupo, explodir, afastamento);

  return (
    <ContextoPeca.Provider value={id}>
      <group
        name={id}
        ref={grupo}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          aoClicarPeca(id);
        }}
      >
        {children}
      </group>
    </ContextoPeca.Provider>
  );
}

/**
 * Parte de uma peça com vista explodida própria (ex.: cada cabeçote do cilindro vai para um lado). Não tem nome nem
 * clique: a peça (`Peca`) continua sendo a unidade de destaque e de foco.
 */
export function Parte({
  explodir = false,
  afastamento,
  children,
}: {
  explodir?: boolean;
  afastamento?: [number, number, number];
  children: ReactNode;
}) {
  const grupo = useRef<Group>(null);
  useAfastar(grupo, explodir, afastamento);
  return <group ref={grupo}>{children}</group>;
}

/**
 * Material da malha dentro de uma peça. A peça em destaque fica em vermelho (`--st-critico`); com um destaque ativo,
 * as demais ficam semitransparentes (opacidade 0,25).
 */
export function Mat({ cor }: { cor: CorBase }) {
  const { destaque, paleta } = useContext(ContextoCena);
  const id = useContext(ContextoPeca);
  const realce = destaque === id;
  const aberta = destaque === null || realce;
  const m = MATERIAIS[cor];
  // textura do material (usinado, fundido, fio de cobre, borracha, pintura); o mapa de rugosidade já traz a faixa real
  const t = mapasDe(cor);
  return (
    <meshStandardMaterial
      color={realce ? paleta.destaque : m.cor}
      map={t?.map ?? null}
      roughnessMap={realce ? null : t?.roughnessMap ?? null}
      bumpMap={t?.bumpMap ?? null}
      bumpScale={t?.relevo ?? 0}
      emissive={realce ? paleta.destaque : "black"}
      emissiveIntensity={realce ? 0.35 : 0}
      roughness={realce ? 0.45 : t ? 1 : m.rugosidade}
      metalness={realce ? 0.1 : m.metal}
      side={DoubleSide}
      transparent={!aberta}
      opacity={aberta ? 1 : 0.22}
      depthWrite={aberta}
    />
  );
}

/**
 * Materiais físicos da cena (cor base, metal, rugosidade). Ficam aqui, e não nos tokens de texto do site: o aço
 * precisa de cinza claro e reflexo do ambiente (sem isso, metal renderiza quase preto). O destaque continua sendo o
 * `--st-critico` do site.
 */
const MATERIAIS: Record<CorBase, { cor: string; metal: number; rugosidade: number }> = {
  aco: { cor: "#c3c9cf", metal: 0.7, rugosidade: 0.36 },        // aço usinado (anéis, eixos, cubos)
  acoClaro: { cor: "#e8ecef", metal: 0.85, rugosidade: 0.2 },   // aço polido/retificado (esferas, pistas, hastes)
  acoEscuro: { cor: "#8f979e", metal: 0.4, rugosidade: 0.55 },  // ferro fundido / chapa (núcleos, bases, polias)
  cobre: { cor: "#c8783a", metal: 0.8, rugosidade: 0.32 },      // cobre/latão (bobinas, gaiola de latão)
  borracha: { cor: "#474d53", metal: 0, rugosidade: 0.85 },     // borracha/plástico (vedações, correias)
  azul: { cor: "#2f6fb0", metal: 0.2, rugosidade: 0.45 },       // pintura industrial (carcaças, voluta)
};

/** Posição inicial da câmera (vista de 3/4, de cima): o corte das peças fica voltado para ela. */
export const CAMERA_INICIAL: [number, number, number] = [2.4, 2.3, 3.2];

/**
 * Eixo de uma peça torneada: "y" (de pé, padrão), "x" (deitada ao longo da tela) ou "z" (apontando para a câmera).
 * Dentro de `NoEixo`, o Y local vira o eixo pedido; o corte de cada `Torneado` continua voltado para a câmera.
 */
type Eixo = "x" | "y" | "z";
const ROTACAO_EIXO: Record<Eixo, [number, number, number]> = {
  y: [0, 0, 0],
  x: [0, 0, -Math.PI / 2], // Y local → +X; X local → -Y
  z: [Math.PI / 2, 0, 0], // Y local → +Z; Z local → -Y
};
const [CAM_X, CAM_Y, CAM_Z] = CAMERA_INICIAL;
/** Ângulo φ da lathe (ponto = (r·sen φ, y, r·cos φ)) que aponta para a câmera, em cada eixo. */
const CENTRO_CORTE: Record<Eixo, number> = {
  y: Math.atan2(CAM_X, CAM_Z),
  x: Math.atan2(-CAM_Y, CAM_Z),
  z: Math.atan2(CAM_X, -CAM_Y),
};
/** O corte abre 90° (um quadrante) centrado na câmera: a peça é desenhada em 270°. */
const CORTE_ABERTO = Math.PI * 1.5;
const inicioCorte = (eixo: Eixo) => CENTRO_CORTE[eixo] + Math.PI / 4;

const ContextoEixo = createContext<Eixo>("y");
/** Eixo do grupo `NoEixo` mais próximo (para posicionar peças fora do corte). */
export const useEixo = () => useContext(ContextoEixo);

/** Grupo cujo Y local é o `eixo` pedido, na `posicao` dada (no sistema do pai). */
export function NoEixo({ eixo, posicao, children }: {
  eixo: Eixo; posicao?: [number, number, number]; children: ReactNode;
}) {
  return (
    <ContextoEixo.Provider value={eixo}>
      <group position={posicao} rotation={ROTACAO_EIXO[eixo]}>{children}</group>
    </ContextoEixo.Provider>
  );
}

/** Perfil fechado (x = raio, y = posição no eixo) a partir de pares; repete o primeiro ponto no fim. */
export function perfil(pares: [number, number][]): Vector2[] {
  const pts = pares.map(([x, y]) => new Vector2(x, y));
  return [...pts, pts[0].clone()];
}

/** Anel retangular (tubo, disco ou bucha): raios r0..r1, de y0 a y1. */
export const anel = (r0: number, r1: number, y0: number, y1: number) =>
  perfil([[r0, y0], [r1, y0], [r1, y1], [r0, y1]]);

/** Seção circular (para anéis de vedação e espiras em corte): centro (raio, y) e raio da seção. */
export function circulo(raio: number, y: number, r: number, passos = 20): Vector2[] {
  return perfil(Array.from({ length: passos }, (_, i): [number, number] => {
    const a = (2 * Math.PI * i) / passos;
    return [raio + r * Math.cos(a), y + r * Math.sin(a)];
  }));
}

/**
 * Peça de revolução em torno do Y local, a partir de um perfil fechado (x = raio, y = altura). Com `corte`, gira só
 * 270° e fecha as duas faces do corte com o próprio perfil, como num desenho em corte: o interior fica visível e sólido.
 * Passe perfis constantes (fora do componente): a geometria é refeita quando o array muda.
 */
export function Torneado({ perfil, cor, corte = false, segmentos = 64 }: {
  perfil: Vector2[]; cor: CorBase; corte?: boolean; segmentos?: number;
}) {
  const eixo = useEixo();
  const forma = useMemo(() => new Shape(perfil), [perfil]);
  if (!corte) {
    return (
      <mesh>
        <latheGeometry args={[perfil, segmentos]} />
        <Mat cor={cor} />
      </mesh>
    );
  }
  const inicio = inicioCorte(eixo);
  const segs = Math.round(segmentos * 0.75);
  return (
    <group>
      <mesh>
        <latheGeometry args={[perfil, segs, inicio, CORTE_ABERTO]} />
        <Mat cor={cor} />
      </mesh>
      {/* faces do corte: o perfil (plano XY, raio em +X) girado para o início e o fim do arco */}
      {[inicio, inicio + CORTE_ABERTO].map((phi) => (
        <mesh key={phi} rotation={[0, phi - Math.PI / 2, 0]}>
          <shapeGeometry args={[forma]} />
          <Mat cor={cor} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Se o ponto (x, z) do sistema da lathe (φ = atan2(x, z)) cai no quadrante aberto pelo corte do `eixo`: peças soltas
 * (esferas, aletas, pás) que ficariam ali não são desenhadas, como num desenho em corte.
 */
export function naAbertura(x: number, z: number, eixo: Eixo = "y"): boolean {
  const volta = Math.PI * 2;
  const rel = (((Math.atan2(x, z) - inicioCorte(eixo)) % volta) + volta) % volta; // ângulo a partir do início do arco
  return rel > CORTE_ABERTO + 0.05 && rel < volta - 0.05;
}

/** Posição e giro de uma peça radial (aleta, pá) no ângulo φ e raio r, com o X dela apontando para fora. */
export function radial(phi: number, r: number, y = 0): { position: [number, number, number]; rotation: [number, number, number] } {
  return { position: [r * Math.sin(phi), y, r * Math.cos(phi)], rotation: [0, phi - Math.PI / 2, 0] };
}
