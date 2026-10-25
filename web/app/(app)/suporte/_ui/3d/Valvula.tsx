import { Shape } from "three";

import { Mola } from "./Comuns";
import { anel, circulo, Mat, NoEixo, Parte, Peca, perfil, Torneado } from "./Peca";
import type { ModeloProps } from "./Peca";

/**
 * Válvula direcional 5/2 com solenoide, em corte, eixo do carretel no X. O canto de cima, voltado para a câmera, é
 * aberto: aparecem o carretel com os anéis de vedação, a mola de retorno (esquerda) e a bobina de cobre (direita).
 * Vista explodida: carretel e vedações sobem pelo corte, bobina e mola saem pelas pontas, escapes descem.
 * Cada peça é um grupo `name` = id de MODELOS.valvula.
 */
const PECA = {
  corpo: "corpo",
  carretel: "carretel",
  bobina: "bobina",
  molas: "molas",
  vedacoes: "vedacoes",
  escapes: "escapes",
  acionamentoManual: "acionamento_manual",
} as const;

/** Ids das peças desenhadas (testados contra MODELOS em testes/modelos3d.test.ts). */
export const PECAS_VALVULA: readonly string[] = Object.values(PECA);

const COMPRIMENTO = 1.5; // corpo, no X
const MEIA_SECAO = 0.3; // corpo: seção quadrada de 0,6 × 0,6
const R_FURO = 0.2;
const LANDS = [-0.5, 0, 0.5];

/**
 * Seção do corpo (plano u = Z, v = Y): quadrado com o furo do carretel e sem o quadrante de cima voltado para a
 * câmera (u > 0, v > 0). Extrudada no X.
 */
function secaoCorpo(): Shape {
  const h = MEIA_SECAO;
  const s = new Shape();
  s.moveTo(-h, -h);
  s.lineTo(h, -h);
  s.lineTo(h, 0);
  s.lineTo(R_FURO, 0);
  s.absarc(0, 0, R_FURO, 0, -1.5 * Math.PI, true); // contorna o furo por baixo até (0, R_FURO)
  s.lineTo(0, h);
  s.lineTo(-h, h);
  s.closePath();
  return s;
}
const SECAO = secaoCorpo();
const EXTRUSAO = { depth: COMPRIMENTO, bevelEnabled: false, curveSegments: 48 };

const CARRETEL = perfil([
  [0, -0.85], [0.08, -0.85],
  ...LANDS.flatMap((y): [number, number][] => [[0.08, y - 0.08], [0.19, y - 0.08], [0.19, y + 0.08], [0.08, y + 0.08]]),
  [0.08, 0.85], [0, 0.85],
]);
const ANEIS = LANDS.map((y) => circulo(0.188, y, 0.02, 16));
const JUNTAS = [-1, 1].map((s) => anel(0.2, 0.27, s * (COMPRIMENTO / 2) - 0.012, s * (COMPRIMENTO / 2) + 0.012));
/** Tampa da mola (esquerda) e assento da mola. */
const TAMPA_MOLA = perfil([[0, -1.1], [0.28, -1.1], [0.28, -0.76], [0.22, -0.76], [0.22, -1.04], [0, -1.04]]);
const ASSENTO_MOLA = anel(0, 0.15, -0.88, -0.86);
/** Solenoide (direita): carcaça em copo, bobina, tubo guia e êmbolo móvel. */
const CARCACA_BOBINA = perfil([
  [0.13, 0.8], [0.36, 0.8], [0.36, 1.45], [0.13, 1.45], [0.13, 1.4], [0.3, 1.4], [0.3, 0.85], [0.13, 0.85],
]);
const ENROLAMENTO = anel(0.14, 0.295, 0.86, 1.39);
const TUBO_GUIA = anel(0.095, 0.125, 0.76, 1.5);
const NUCLEO_MOVEL = anel(0, 0.09, 0.86, 1.3);

export function Valvula({ explodir }: ModeloProps) {
  return (
    <group>
      <Peca id={PECA.corpo} explodir={explodir}>
        <mesh position={[COMPRIMENTO / 2, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <extrudeGeometry args={[SECAO, EXTRUSAO]} />
          <Mat cor="aco" />
        </mesh>
        {/* conexões de trabalho (2 e 4) em cima, atrás do corte, e de pressão (1) embaixo */}
        {[[-0.25, 1], [0.25, 1], [0, -1]].map(([x, s]) => (
          <mesh key={`${x}${s}`} position={[x, s * (MEIA_SECAO + 0.09), s > 0 ? -0.15 : 0]}>
            <cylinderGeometry args={[0.075, 0.075, 0.18, 20]} />
            <Mat cor="acoEscuro" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.carretel} explodir={explodir} afastamento={[0, 0.75, 0]}>
        <NoEixo eixo="x"><Torneado perfil={CARRETEL} cor="acoClaro" segmentos={48} /></NoEixo>
      </Peca>

      <Peca id={PECA.vedacoes} explodir={explodir} afastamento={[0, 1.15, 0]}>
        <NoEixo eixo="x">
          {ANEIS.map((p, k) => <Torneado key={k} perfil={p} cor="borracha" segmentos={48} />)}
          {JUNTAS.map((p, k) => <Torneado key={`j${k}`} perfil={p} cor="borracha" corte segmentos={48} />)}
        </NoEixo>
      </Peca>

      <Peca id={PECA.molas} explodir={explodir} afastamento={[-0.6, 0, 0]}>
        <NoEixo eixo="x">
          <Mola y0={-1.03} y1={-0.88} raio={0.12} fio={0.018} espiras={5} />
          <Torneado perfil={ASSENTO_MOLA} cor="aco" segmentos={32} />
        </NoEixo>
      </Peca>
      {/* tampa da mola: sai junto, um pouco mais longe */}
      <Parte explodir={explodir} afastamento={[-0.95, 0, 0]}>
        <NoEixo eixo="x"><Torneado perfil={TAMPA_MOLA} cor="acoEscuro" corte /></NoEixo>
      </Parte>

      <Peca id={PECA.bobina} explodir={explodir} afastamento={[0.7, 0, 0]}>
        <NoEixo eixo="x">
          <Torneado perfil={CARCACA_BOBINA} cor="azul" corte />
          <Torneado perfil={ENROLAMENTO} cor="cobre" corte />
          <Torneado perfil={TUBO_GUIA} cor="aco" corte segmentos={32} />
          <Torneado perfil={NUCLEO_MOVEL} cor="acoClaro" segmentos={32} />
        </NoEixo>
        {/* conector elétrico */}
        <mesh position={[1.12, 0.44, -0.1]}>
          <boxGeometry args={[0.3, 0.18, 0.3]} />
          <Mat cor="borracha" />
        </mesh>
      </Peca>

      <Peca id={PECA.escapes} explodir={explodir} afastamento={[0, -0.45, 0]}>
        {/* silenciadores de bronze sinterizado nos escapes 3 e 5 */}
        {[-0.5, 0.5].map((x) => (
          <group key={x}>
            <mesh position={[x, -MEIA_SECAO - 0.06, 0]}>
              <cylinderGeometry args={[0.06, 0.06, 0.12, 20]} />
              <Mat cor="acoEscuro" />
            </mesh>
            <mesh position={[x, -MEIA_SECAO - 0.2, 0]}>
              <cylinderGeometry args={[0.08, 0.06, 0.18, 20]} />
              <Mat cor="cobre" />
            </mesh>
          </group>
        ))}
      </Peca>

      <Peca id={PECA.acionamentoManual} explodir={explodir} afastamento={[0, 0.45, 0]}>
        <mesh position={[0.6, MEIA_SECAO + 0.03, -0.15]}>
          <cylinderGeometry args={[0.09, 0.09, 0.06, 24]} />
          <Mat cor="acoEscuro" />
        </mesh>
        <mesh position={[0.6, MEIA_SECAO + 0.09, -0.15]}>
          <cylinderGeometry args={[0.055, 0.055, 0.08, 20]} />
          <Mat cor="azul" />
        </mesh>
      </Peca>
    </group>
  );
}
