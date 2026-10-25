import { Vector2 } from "three";

import { Mat, naAbertura, Parte, Peca, Torneado } from "./Peca";
import type { ModeloProps } from "./Peca";

/**
 * Rolamento rígido de esferas em corte (eixo vertical Y): um quadrante aberto mostra as esferas, a gaiola e as pistas.
 * Na vista explodida as peças se separam ao longo do eixo, como numa desmontagem real.
 * Cada peça é um grupo `name` = id de MODELOS.rolamento.
 */
const H = 0.24; // meia largura do rolamento
const R_EXT = 1.1; // raio externo
const R_INT = 0.48; // furo
const R_PASSO = 0.79; // raio do centro das esferas
const R_ESFERA = 0.13;
const GOLA = R_ESFERA * 1.04; // raio da gola da pista (um pouco maior que a esfera)
const OMBRO_EXT = R_PASSO + GOLA * 0.75; // raio interno do anel externo (ombro)
const OMBRO_INT = R_PASSO - GOLA * 0.75; // raio externo do anel interno (ombro)
const ESFERAS = 10;
const CHANFRO = 0.025;

const PECA = {
  anelExterno: "anel_externo",
  pistaExterna: "pista_externa",
  anelInterno: "anel_interno",
  pistaInterna: "pista_interna",
  esferas: "esferas",
  gaiola: "gaiola",
  vedacao: "vedacao",
} as const;

/** Ids das peças desenhadas (testados contra MODELOS em testes/modelos3d.test.ts). */
export const PECAS_ROLAMENTO: readonly string[] = Object.values(PECA);

/** Arco da gola centrado no passo das esferas; `sinal` +1 = gola no anel externo (côncava para dentro). */
function gola(raio: number, sinal: 1 | -1, passos = 20): Vector2[] {
  // a gola encontra o ombro onde R_PASSO ± raio·cos(t) = ombro
  const meio = Math.acos(Math.min(0.999, (sinal > 0 ? OMBRO_EXT - R_PASSO : R_PASSO - OMBRO_INT) / raio));
  const pts: Vector2[] = [];
  for (let i = 0; i <= passos; i++) {
    const t = -meio + ((2 * meio) * i) / passos; // de baixo para cima
    const y = raio * Math.sin(t);
    const x = R_PASSO + sinal * raio * Math.cos(t);
    pts.push(new Vector2(x, y));
  }
  return pts;
}

/** Anel externo: chanfros nos cantos, gola de pista no diâmetro interno. Perfil fechado, sentido anti-horário. */
const PERFIL_EXTERNO: Vector2[] = (() => {
  const g = gola(GOLA, 1); // de y negativo para positivo, x ≈ OMBRO_EXT nas pontas
  return [
    new Vector2(OMBRO_EXT, -H + CHANFRO), new Vector2(OMBRO_EXT + CHANFRO, -H),
    new Vector2(R_EXT - CHANFRO, -H), new Vector2(R_EXT, -H + CHANFRO),
    new Vector2(R_EXT, H - CHANFRO), new Vector2(R_EXT - CHANFRO, H),
    new Vector2(OMBRO_EXT + CHANFRO, H), new Vector2(OMBRO_EXT, H - CHANFRO),
    new Vector2(OMBRO_EXT, g[g.length - 1].y),
    ...[...g].reverse(),
    new Vector2(OMBRO_EXT, g[0].y),
    new Vector2(OMBRO_EXT, -H + CHANFRO),
  ];
})();

/** Anel interno: furo, chanfros e gola de pista no diâmetro externo. */
const PERFIL_INTERNO: Vector2[] = (() => {
  const g = gola(GOLA, -1);
  return [
    new Vector2(R_INT + CHANFRO, -H), new Vector2(OMBRO_INT - CHANFRO, -H), new Vector2(OMBRO_INT, -H + CHANFRO),
    new Vector2(OMBRO_INT, g[0].y),
    ...g,
    new Vector2(OMBRO_INT, g[g.length - 1].y),
    new Vector2(OMBRO_INT, H - CHANFRO), new Vector2(OMBRO_INT - CHANFRO, H),
    new Vector2(R_INT + CHANFRO, H), new Vector2(R_INT, H - CHANFRO),
    new Vector2(R_INT, -H + CHANFRO), new Vector2(R_INT + CHANFRO, -H),
  ];
})();

/** Faixa polida da pista (superfície de rolagem), fina, por dentro da gola: dá para destacar só a pista. */
function faixa(sinal: 1 | -1): Vector2[] {
  const fora = gola(GOLA + 0.004, sinal, 16);
  const dentro = gola(GOLA - 0.012, sinal, 16).reverse();
  return [...fora, ...dentro, fora[0]];
}
const FAIXA_EXTERNA = faixa(1);
const FAIXA_INTERNA = faixa(-1);

/** Gaiola de chapa: dois anéis finos acima e abaixo do plano das esferas (o corte mostra o perfil). */
function anelGaiola(y: number): Vector2[] {
  const e = 0.022, l = 0.05;
  return [
    new Vector2(R_PASSO - l, y - e), new Vector2(R_PASSO + l, y - e),
    new Vector2(R_PASSO + l, y + e), new Vector2(R_PASSO - l, y + e), new Vector2(R_PASSO - l, y - e),
  ];
}
const GAIOLA_SUP = anelGaiola(R_ESFERA + 0.02);
const GAIOLA_INF = anelGaiola(-(R_ESFERA + 0.02));

/** Blindagem (2Z): disco fino que fecha o vão entre os anéis, preso no anel externo. */
function escudo(sinal: 1 | -1): Vector2[] {
  const y0 = sinal * (H - 0.035), y1 = sinal * (H - 0.012);
  const [a, b] = sinal > 0 ? [y0, y1] : [y1, y0];
  return [
    new Vector2(OMBRO_INT + 0.02, a), new Vector2(OMBRO_EXT + 0.035, a),
    new Vector2(OMBRO_EXT + 0.035, b), new Vector2(OMBRO_INT + 0.02, b), new Vector2(OMBRO_INT + 0.02, a),
  ];
}
const ESCUDO_SUP = escudo(1);
const ESCUDO_INF = escudo(-1);

const PASSO_ANGULAR = (2 * Math.PI) / ESFERAS;
/** Posição da esfera k no plano XZ. */
const posEsfera = (k: number): [number, number, number] => [
  R_PASSO * Math.sin(k * PASSO_ANGULAR), 0, R_PASSO * Math.cos(k * PASSO_ANGULAR),
];

export function Rolamento({ explodir }: ModeloProps) {
  return (
    <group>
      <Peca id={PECA.anelExterno} explodir={explodir}>
        <Torneado perfil={PERFIL_EXTERNO} cor="aco" corte />
      </Peca>
      <Peca id={PECA.pistaExterna} explodir={explodir}>
        <Torneado perfil={FAIXA_EXTERNA} cor="acoClaro" corte />
      </Peca>

      <Peca id={PECA.anelInterno} explodir={explodir} afastamento={[0, -0.95, 0]}>
        <Torneado perfil={PERFIL_INTERNO} cor="aco" corte />
      </Peca>
      <Peca id={PECA.pistaInterna} explodir={explodir} afastamento={[0, -0.95, 0]}>
        <Torneado perfil={FAIXA_INTERNA} cor="acoClaro" corte />
      </Peca>

      <Peca id={PECA.esferas} explodir={explodir} afastamento={[0, 0.55, 0]}>
        {Array.from({ length: ESFERAS }, (_, k) => (
          <mesh key={k} position={posEsfera(k)}>
            <sphereGeometry args={[R_ESFERA, 32, 24]} />
            <Mat cor="acoClaro" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.gaiola} explodir={explodir} afastamento={[0, 0.95, 0]}>
        <Torneado perfil={GAIOLA_SUP} cor="cobre" corte />
        <Torneado perfil={GAIOLA_INF} cor="cobre" corte />
        {/* pontes da gaiola entre as esferas (só fora da abertura do corte) */}
        {Array.from({ length: ESFERAS }, (_, k) => {
          const a = (k + 0.5) * PASSO_ANGULAR;
          const x = R_PASSO * Math.sin(a), z = R_PASSO * Math.cos(a);
          if (naAbertura(x, z)) return null;
          return (
            <mesh key={k} position={[x, 0, z]} rotation={[0, a, 0]}>
              <boxGeometry args={[0.035, (R_ESFERA + 0.02) * 2, 0.09]} />
              <Mat cor="cobre" />
            </mesh>
          );
        })}
      </Peca>

      <Peca id={PECA.vedacao} explodir={explodir}>
        <Parte explodir={explodir} afastamento={[0, 1.4, 0]}>
          <Torneado perfil={ESCUDO_SUP} cor="borracha" corte />
        </Parte>
        <Parte explodir={explodir} afastamento={[0, -1.6, 0]}>
          <Torneado perfil={ESCUDO_INF} cor="borracha" corte />
        </Parte>
      </Peca>
    </group>
  );
}
