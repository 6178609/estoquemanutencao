import { Vector2 } from "three";

import { Mat, Peca } from "./Peca";
import type { ModeloProps } from "./Peca";

/** Rolamento esquemático, eixo vertical (Y). Cada peça é um grupo `name` = id de MODELOS.rolamento. */
const METADE_ALTURA = 0.22;
const RAIO_PASSO = 0.84;
const RAIO_GOLA = 0.1;
const RAIO_ESFERA = 0.085;
const RAIO_INTERNO = 0.5;
const ESFERAS = 9;
const SEGMENTOS = 56;

/** Arco da gola de pista: sinal +1 para a pista externa (para fora), -1 para a interna (para dentro). */
function arco(raio: number, sinal: 1 | -1, passos = 24): Vector2[] {
  const pontos: Vector2[] = [];
  for (let i = 0; i <= passos; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / passos;
    pontos.push(new Vector2(RAIO_PASSO + sinal * raio * Math.cos(t), raio * Math.sin(t)));
  }
  return pontos;
}

/** Anel externo: retângulo com a gola da pista voltada para dentro. Perfil fechado (primeiro ponto repetido no fim). */
const PERFIL_EXTERNO: Vector2[] = [
  new Vector2(1.1, METADE_ALTURA),
  new Vector2(1.1, -METADE_ALTURA),
  new Vector2(RAIO_PASSO, -METADE_ALTURA),
  new Vector2(RAIO_PASSO, -RAIO_GOLA),
  ...arco(RAIO_GOLA, 1),
  new Vector2(RAIO_PASSO, METADE_ALTURA),
  new Vector2(1.1, METADE_ALTURA),
];

/** Anel interno: retângulo com a gola da pista voltada para fora. */
const PERFIL_INTERNO: Vector2[] = [
  new Vector2(RAIO_INTERNO, -METADE_ALTURA),
  new Vector2(RAIO_PASSO, -METADE_ALTURA),
  new Vector2(RAIO_PASSO, -RAIO_GOLA),
  ...arco(RAIO_GOLA, -1),
  new Vector2(RAIO_PASSO, METADE_ALTURA),
  new Vector2(RAIO_INTERNO, METADE_ALTURA),
  new Vector2(RAIO_INTERNO, -METADE_ALTURA),
];

/** Faixa da pista (superfície da gola), 0,012 de espessura, visível em cor própria. */
function faixaPista(sinal: 1 | -1): Vector2[] {
  const externo = arco(RAIO_GOLA, sinal);
  const interno = arco(RAIO_GOLA - 0.012, sinal).reverse();
  return [...externo, ...interno, externo[0]];
}

const FAIXA_EXTERNA = faixaPista(1);
const FAIXA_INTERNA = faixaPista(-1);

/** Escudo de vedação (um em cada face), anel fino acima e abaixo do rolamento. */
const ESCUDO_SUPERIOR: Vector2[] = [
  new Vector2(0.52, METADE_ALTURA),
  new Vector2(0.9, METADE_ALTURA),
  new Vector2(0.9, METADE_ALTURA + 0.03),
  new Vector2(0.52, METADE_ALTURA + 0.03),
  new Vector2(0.52, METADE_ALTURA),
];
const ESCUDO_INFERIOR: Vector2[] = ESCUDO_SUPERIOR.map((p) => new Vector2(p.x, -p.y));

const ANGULO_ESFERA = (2 * Math.PI) / ESFERAS;

export function Rolamento({ explodir }: ModeloProps) {
  return (
    <group>
      <Peca id="anel_externo" explodir={explodir} afastamento={[0.45, 0, 0]}>
        <mesh>
          <latheGeometry args={[PERFIL_EXTERNO, SEGMENTOS]} />
          <Mat cor="aco" />
        </mesh>
      </Peca>

      <Peca id="pista_externa" explodir={explodir} afastamento={[0.45, 0, 0]}>
        <mesh>
          <latheGeometry args={[FAIXA_EXTERNA, SEGMENTOS]} />
          <Mat cor="acoClaro" />
        </mesh>
      </Peca>

      <Peca id="anel_interno" explodir={explodir} afastamento={[-0.45, 0, 0]}>
        <mesh>
          <latheGeometry args={[PERFIL_INTERNO, SEGMENTOS]} />
          <Mat cor="aco" />
        </mesh>
      </Peca>

      <Peca id="pista_interna" explodir={explodir} afastamento={[-0.45, 0, 0]}>
        <mesh>
          <latheGeometry args={[FAIXA_INTERNA, SEGMENTOS]} />
          <Mat cor="acoClaro" />
        </mesh>
      </Peca>

      <Peca id="esferas">
        {Array.from({ length: ESFERAS }, (_, k) => {
          const a = k * ANGULO_ESFERA;
          return (
            <mesh key={k} position={[RAIO_PASSO * Math.cos(a), 0, RAIO_PASSO * Math.sin(a)]}>
              <sphereGeometry args={[RAIO_ESFERA, 20, 16]} />
              <Mat cor="acoClaro" />
            </mesh>
          );
        })}
      </Peca>

      <Peca id="gaiola">
        {Array.from({ length: ESFERAS }, (_, k) => {
          // bolsos entre as esferas: um pilar de gaiola no meio de cada intervalo
          const a = (k + 0.5) * ANGULO_ESFERA;
          return (
            <mesh key={k} position={[RAIO_PASSO * Math.cos(a), 0, RAIO_PASSO * Math.sin(a)]} rotation={[0, -a, 0]}>
              <boxGeometry args={[0.07, 0.16, 0.05]} />
              <Mat cor="cobre" />
            </mesh>
          );
        })}
        {[-0.095, 0.095].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[RAIO_PASSO, 0.02, 10, 56]} />
            <Mat cor="cobre" />
          </mesh>
        ))}
      </Peca>

      <Peca id="vedacao">
        <mesh>
          <latheGeometry args={[ESCUDO_SUPERIOR, 48]} />
          <Mat cor="acoEscuro" />
        </mesh>
        <mesh>
          <latheGeometry args={[ESCUDO_INFERIOR, 48]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>
    </group>
  );
}
