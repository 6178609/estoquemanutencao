import { createContext, useContext, useMemo, useRef } from "react";
import type { RefObject } from "react";
import type { ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { DoubleSide, Vector3 } from "three";
import type { Group } from "three";

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

export interface EstadoCena {
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
  return (
    <meshStandardMaterial
      color={realce ? paleta.destaque : paleta[cor]}
      roughness={0.55}
      metalness={0.25}
      side={DoubleSide}
      transparent={!aberta}
      opacity={aberta ? 1 : 0.25}
      depthWrite={aberta}
    />
  );
}
