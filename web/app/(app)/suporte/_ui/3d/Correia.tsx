import { anel, Mat, NoEixo, Peca, perfil, Torneado } from "./Peca";
import type { ModeloProps } from "./Peca";
import { formaCorreia } from "./geometria";

/**
 * Transmissão por correia em V, vista de frente: polia motora (pequena, à esquerda) e polia movida (grande, à direita)
 * com canal em V, correia assentada no canal e o tensor encostado por fora no
 * ramo frouxo (embaixo). Os eixos estão no Z, apoiados em mancais de pedestal.
 * Vista explodida: as polias saem pela frente dos eixos, a correia sobe e o tensor desce.
 * Cada peça é um grupo `name` = id de MODELOS.correia.
 */
const PECA = {
  poliaMotora: "polia_motora",
  poliaMovida: "polia_movida",
  correia: "correia",
  eixos: "eixos",
  tensor: "tensor",
} as const;

/** Ids das peças desenhadas (testados contra MODELOS em testes/modelos3d.test.ts). */
export const PECAS_CORREIA: readonly string[] = Object.values(PECA);

const MOTORA = { x: -0.9, raio: 0.5 };
const MOVIDA = { x: 0.9, raio: 0.8 };
/** A correia assenta no canal: o raio interno dela fica 0,06 abaixo do diâmetro externo da polia. */
const ASSENTO = 0.06;
const ESPESSURA_CORREIA = 0.1;
const LARGURA_CORREIA = 0.12;
const Y_BASE = -1.45;

/** Polia com canal em V (perfil: cubo, alma e aro), largura 0,36 no eixo. */
function perfilPolia(R: number) {
  return perfil([
    [0.07, -0.2], [0.17, -0.2], [0.17, -0.05], [R - 0.13, -0.05], [R - 0.13, -0.17], [R, -0.17], [R, -0.1],
    [R - 0.09, -0.035], [R - 0.09, 0.035], [R, 0.1], [R, 0.17], [R - 0.13, 0.17], [R - 0.13, 0.05], [0.17, 0.05],
    [0.17, 0.2], [0.07, 0.2],
  ]);
}
const POLIA_MOTORA = perfilPolia(MOTORA.raio);
const POLIA_MOVIDA = perfilPolia(MOVIDA.raio);
const CORREIA_FORMA = formaCorreia(
  MOTORA.x, MOTORA.raio - ASSENTO, MOVIDA.x, MOVIDA.raio - ASSENTO, ESPESSURA_CORREIA,
);
const EXTRUSAO_CORREIA = {
  depth: LARGURA_CORREIA, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2,
  curveSegments: 1,
};

/** Altura da face de fora do ramo de baixo da correia em x (tangente externa entre as duas polias). */
function yRamoInferior(x: number): number {
  const r1 = MOTORA.raio - ASSENTO + ESPESSURA_CORREIA;
  const r2 = MOVIDA.raio - ASSENTO + ESPESSURA_CORREIA;
  const t = Math.acos((r1 - r2) / (MOVIDA.x - MOTORA.x));
  const [x1, y1] = [MOTORA.x + r1 * Math.cos(t), -r1 * Math.sin(t)];
  const [x2, y2] = [MOVIDA.x + r2 * Math.cos(t), -r2 * Math.sin(t)];
  return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
}
const TENSOR = { x: 0.05, raio: 0.15 };
const Y_TENSOR = yRamoInferior(TENSOR.x) - TENSOR.raio - 0.005;
const PIVO = { x: 0.55, y: Y_BASE + 0.25 };
const BRACO = {
  comprimento: Math.hypot(PIVO.x - TENSOR.x, PIVO.y - Y_TENSOR),
  angulo: Math.atan2(PIVO.y - Y_TENSOR, PIVO.x - TENSOR.x),
};
const ROLETE_TENSOR = perfil([
  [0.05, -0.1], [TENSOR.raio, -0.1], [TENSOR.raio, 0.1], [0.05, 0.1],
]);

const EIXO = anel(0, 0.07, -0.65, 0.32);
const MANCAL = anel(0.07, 0.17, -0.56, -0.38);
const Z_MANCAL = -0.47;

export function Correia({ explodir }: ModeloProps) {
  return (
    <group position={[0, 0.25, 0]}>
      <Peca id={PECA.poliaMotora} explodir={explodir} afastamento={[0, 0, 0.75]}>
        <NoEixo eixo="z" posicao={[MOTORA.x, 0, 0]}><Torneado perfil={POLIA_MOTORA} cor="acoEscuro" /></NoEixo>
      </Peca>

      <Peca id={PECA.poliaMovida} explodir={explodir} afastamento={[0, 0, 0.75]}>
        <NoEixo eixo="z" posicao={[MOVIDA.x, 0, 0]}><Torneado perfil={POLIA_MOVIDA} cor="acoEscuro" segmentos={80} /></NoEixo>
      </Peca>

      <Peca id={PECA.correia} explodir={explodir} afastamento={[0, 0.8, 0]}>
        <mesh position={[0, 0, -LARGURA_CORREIA / 2]}>
          <extrudeGeometry args={[CORREIA_FORMA, EXTRUSAO_CORREIA]} />
          <Mat cor="borracha" />
        </mesh>
      </Peca>

      <Peca id={PECA.eixos} explodir={explodir}>
        {[MOTORA.x, MOVIDA.x].map((x) => (
          <group key={x}>
            <NoEixo eixo="z" posicao={[x, 0, 0]}>
              <Torneado perfil={EIXO} cor="acoClaro" segmentos={24} />
              <Torneado perfil={MANCAL} cor="azul" segmentos={40} />
            </NoEixo>
            {/* pedestal do mancal */}
            <mesh position={[x, Y_BASE / 2 - 0.04, Z_MANCAL]}>
              <boxGeometry args={[0.24, -Y_BASE - 0.1, 0.16]} />
              <Mat cor="azul" />
            </mesh>
          </group>
        ))}
        <mesh position={[0, Y_BASE, -0.1]}>
          <boxGeometry args={[2.9, 0.08, 1.0]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>

      <Peca id={PECA.tensor} explodir={explodir} afastamento={[0, -0.45, 0.3]}>
        <NoEixo eixo="z" posicao={[TENSOR.x, Y_TENSOR, 0]}>
          <Torneado perfil={ROLETE_TENSOR} cor="aco" segmentos={40} />
        </NoEixo>
        {/* braço do tensor até o pivô, atrás do rolete */}
        <mesh
          position={[(TENSOR.x + PIVO.x) / 2, (Y_TENSOR + PIVO.y) / 2, -0.14]}
          rotation={[0, 0, BRACO.angulo]}
        >
          <boxGeometry args={[BRACO.comprimento + 0.1, 0.08, 0.05]} />
          <Mat cor="azul" />
        </mesh>
        <mesh position={[PIVO.x, (PIVO.y + Y_BASE) / 2, -0.14]}>
          <boxGeometry args={[0.1, PIVO.y - Y_BASE, 0.08]} />
          <Mat cor="azul" />
        </mesh>
        {/* mola do tensor, do braço até a base */}
        <mesh position={[TENSOR.x - 0.05, (Y_TENSOR + Y_BASE) / 2, -0.14]}>
          <cylinderGeometry args={[0.03, 0.03, Y_TENSOR - Y_BASE, 12]} />
          <Mat cor="acoClaro" />
        </mesh>
      </Peca>
    </group>
  );
}
