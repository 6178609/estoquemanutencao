import { anel, circulo, Mat, naAbertura, NoEixo, Parte, Peca, perfil, Torneado } from "./Peca";
import type { ModeloProps } from "./Peca";

/**
 * Cilindro pneumático de dupla ação em corte, eixo no X (haste saindo à direita). Um quadrante aberto mostra o
 * êmbolo com as vedações, a haste, a vedação da haste, as buchas de amortecimento e os cabeçotes com tirantes.
 * Vista explodida: cabeçotes saem para as pontas; êmbolo e haste saem pela frente; as vedações se soltam para cima.
 * Cada peça é um grupo `name` = id de MODELOS.cilindro.
 */
const PECA = {
  camisa: "camisa",
  haste: "haste",
  embolo: "embolo",
  vedacaoEmbolo: "vedacao_embolo",
  vedacaoHaste: "vedacao_haste",
  cabecotes: "cabecotes",
  amortecimento: "amortecimento",
  conexoes: "conexoes",
} as const;

/** Ids das peças desenhadas (testados contra MODELOS em testes/modelos3d.test.ts). */
export const PECAS_CILINDRO: readonly string[] = Object.values(PECA);

const R_INTERNO = 0.36;
const R_EXTERNO = 0.41;
const METADE = 1.0; // meio comprimento da camisa
const R_CABECOTE = 0.56;
const Y_EMBOLO = -0.15;
const R_HASTE = 0.09;

const CAMISA = anel(R_INTERNO, R_EXTERNO, -METADE, METADE);
/** Cabeçote traseiro (fechado), com encaixe da camisa e o furo de amortecimento. */
const CABECOTE_TRASEIRO = perfil([
  [0.13, -METADE - 0.2], [R_CABECOTE, -METADE - 0.2], [R_CABECOTE, -METADE + 0.04], [R_EXTERNO, -METADE + 0.04],
  [R_EXTERNO, -METADE], [R_INTERNO, -METADE], [R_INTERNO, -METADE + 0.04], [0.13, -METADE + 0.04],
]);
const TAMPA_TRASEIRA = anel(0, 0.13, -METADE - 0.2, -METADE - 0.12);
/** Cabeçote dianteiro, com a bucha guia da haste. */
const CABECOTE_DIANTEIRO = perfil([
  [R_HASTE + 0.005, METADE + 0.3], [0.2, METADE + 0.3], [0.2, METADE + 0.2], [R_CABECOTE, METADE + 0.2],
  [R_CABECOTE, METADE - 0.04], [R_EXTERNO, METADE - 0.04], [R_EXTERNO, METADE], [R_INTERNO, METADE],
  [R_INTERNO, METADE - 0.04], [0.16, METADE - 0.04], [0.16, METADE + 0.02], [R_HASTE + 0.005, METADE + 0.02],
]);
/** Tirantes nos quatro cantos, fora do quadrante aberto. */
const TIRANTES = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]
  .map((phi): [number, number, number] => [0.48 * Math.sin(phi), 0, 0.48 * Math.cos(phi)])
  .filter(([x, , z]) => !naAbertura(x, z, "x"));

const EMBOLO = perfil([
  [R_HASTE, Y_EMBOLO - 0.11], [0.33, Y_EMBOLO - 0.11], [0.33, Y_EMBOLO - 0.07], [0.3, Y_EMBOLO - 0.07],
  [0.3, Y_EMBOLO - 0.03], [0.35, Y_EMBOLO - 0.03], [0.35, Y_EMBOLO + 0.03], [0.3, Y_EMBOLO + 0.03],
  [0.3, Y_EMBOLO + 0.07], [0.33, Y_EMBOLO + 0.07], [0.33, Y_EMBOLO + 0.11], [R_HASTE, Y_EMBOLO + 0.11],
]);
/** Duas vedações de lábio nos canais do êmbolo. */
const VEDACOES_EMBOLO = [Y_EMBOLO - 0.07, Y_EMBOLO + 0.07].map((y) => anel(0.3, R_INTERNO, y - 0.02, y + 0.02));
const HASTE = anel(0, R_HASTE, Y_EMBOLO - 0.11, 2.05);
const PONTA_HASTE = anel(0, 0.06, 2.05, 2.25);
/** Vedação da haste e raspador, dentro do cabeçote dianteiro. */
const VEDACAO_HASTE = [anel(R_HASTE, 0.16, METADE + 0.02, METADE + 0.08), circulo(R_HASTE + 0.025, METADE + 0.25, 0.022)];
/** Amortecimento: bucha na haste (entra no cabeçote dianteiro) e espiga atrás do êmbolo (entra no traseiro). */
const BUCHA_AMORT = anel(R_HASTE, 0.14, Y_EMBOLO + 0.11, Y_EMBOLO + 0.33);
const ESPIGA_AMORT = anel(0, 0.11, Y_EMBOLO - 0.33, Y_EMBOLO - 0.11);

export function Cilindro({ explodir }: ModeloProps) {
  return (
    <group>
      <Peca id={PECA.camisa} explodir={explodir}>
        <NoEixo eixo="x"><Torneado perfil={CAMISA} cor="aco" corte /></NoEixo>
      </Peca>

      <Peca id={PECA.cabecotes}>
        <Parte explodir={explodir} afastamento={[-0.6, 0, 0]}>
          <NoEixo eixo="x">
            <Torneado perfil={CABECOTE_TRASEIRO} cor="azul" corte />
            <Torneado perfil={TAMPA_TRASEIRA} cor="azul" />
          </NoEixo>
        </Parte>
        <Parte explodir={explodir} afastamento={[0.6, 0, 0]}>
          <NoEixo eixo="x"><Torneado perfil={CABECOTE_DIANTEIRO} cor="azul" corte /></NoEixo>
        </Parte>
        {/* tirantes (ficam com a camisa na vista explodida) */}
        <NoEixo eixo="x">
          {TIRANTES.map((p) => (
            <mesh key={p.join(",")} position={p}>
              <cylinderGeometry args={[0.025, 0.025, 2 * METADE + 0.5, 12]} />
              <Mat cor="acoClaro" />
            </mesh>
          ))}
        </NoEixo>
      </Peca>

      <Peca id={PECA.embolo} explodir={explodir} afastamento={[1.0, 0, 0]}>
        <NoEixo eixo="x"><Torneado perfil={EMBOLO} cor="acoEscuro" /></NoEixo>
      </Peca>

      <Peca id={PECA.vedacaoEmbolo} explodir={explodir} afastamento={[1.0, 0.6, 0]}>
        <NoEixo eixo="x">{VEDACOES_EMBOLO.map((p, k) => <Torneado key={k} perfil={p} cor="borracha" />)}</NoEixo>
      </Peca>

      <Peca id={PECA.haste} explodir={explodir} afastamento={[1.0, 0, 0]}>
        <NoEixo eixo="x">
          <Torneado perfil={HASTE} cor="acoClaro" segmentos={32} />
          <Torneado perfil={PONTA_HASTE} cor="aco" segmentos={24} />
        </NoEixo>
      </Peca>

      <Peca id={PECA.vedacaoHaste} explodir={explodir} afastamento={[0.6, 0.5, 0]}>
        <NoEixo eixo="x">{VEDACAO_HASTE.map((p, k) => <Torneado key={k} perfil={p} cor="borracha" corte />)}</NoEixo>
      </Peca>

      <Peca id={PECA.amortecimento} explodir={explodir} afastamento={[1.0, 0, 0]}>
        <NoEixo eixo="x">
          <Torneado perfil={BUCHA_AMORT} cor="cobre" segmentos={32} />
          <Torneado perfil={ESPIGA_AMORT} cor="cobre" segmentos={32} />
        </NoEixo>
      </Peca>

      <Peca id={PECA.conexoes} explodir={explodir}>
        {/* conexões de ar no topo de cada cabeçote */}
        {[-METADE - 0.08, METADE + 0.1].map((x) => (
          <Parte key={x} explodir={explodir} afastamento={[x < 0 ? -0.6 : 0.6, 0.35, 0]}>
            <mesh position={[x, R_CABECOTE + 0.08, -0.12]}>
              <cylinderGeometry args={[0.07, 0.07, 0.18, 20]} />
              <Mat cor="azul" />
            </mesh>
            <mesh position={[x, R_CABECOTE + 0.19, -0.12]}>
              <cylinderGeometry args={[0.05, 0.05, 0.06, 20]} />
              <Mat cor="acoClaro" />
            </mesh>
          </Parte>
        ))}
      </Peca>
    </group>
  );
}
