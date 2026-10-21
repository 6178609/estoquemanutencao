import { Vector2 } from "three";

import { Mat, Parte, Peca } from "./Peca";
import type { ModeloProps } from "./Peca";

/**
 * Cilindro pneumático esquemático. O eixo do cilindro é o Y local; o grupo raiz deita tudo no X
 * (por isso os afastamentos da vista explodida estão no sistema local, como no motor).
 * A camisa é um tubo de 270° (um quarto de corte): o êmbolo, a haste e as vedações aparecem pelo corte.
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

const RAIO_INTERNO = 0.36;
const RAIO_EXTERNO = 0.42;
const METADE_CURSO = 1.0;
const CABECOTE_ALTURA = 0.14;
const Y_EMBOLO = 0.2;
const RAIO_EMBOLO = 0.34;

/** Parede da camisa (perfil fechado: r, y) girada em 270°. A abertura fica no quadrante +X +Z (voltada para a câmera). */
const PERFIL_CAMISA: Vector2[] = [
  new Vector2(RAIO_INTERNO, -METADE_CURSO),
  new Vector2(RAIO_EXTERNO, -METADE_CURSO),
  new Vector2(RAIO_EXTERNO, METADE_CURSO),
  new Vector2(RAIO_INTERNO, METADE_CURSO),
  new Vector2(RAIO_INTERNO, -METADE_CURSO),
];
const PASSOS_CAMISA = 56;
const INICIO_CAMISA = Math.PI / 2;
const SWEEP_CAMISA = Math.PI * 1.5;

/** Gira o cilindro do three.js (eixo Y) para o eixo X, usado nos bocais. */
const GIRO_X: [number, number, number] = [0, 0, Math.PI / 2];
/** Anel (torus) deitado no plano XZ: o eixo do anel fica em Y, o eixo do cilindro local. */
const ANEL_EM_Y: [number, number, number] = [Math.PI / 2, 0, 0];

export function Cilindro({ explodir }: ModeloProps) {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <Peca id={PECA.camisa} explodir={explodir} afastamento={[0, 0, -0.6]}>
        <mesh>
          <latheGeometry args={[PERFIL_CAMISA, PASSOS_CAMISA, INICIO_CAMISA, SWEEP_CAMISA]} />
          <Mat cor="acoClaro" />
        </mesh>
      </Peca>

      <Peca id={PECA.haste} explodir={explodir} afastamento={[0, 0.5, 0]}>
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 2.2, 24]} />
          <Mat cor="aco" />
        </mesh>
      </Peca>

      <Peca id={PECA.embolo} explodir={explodir} afastamento={[0, -0.5, 0]}>
        <mesh position={[0, Y_EMBOLO, 0]}>
          <cylinderGeometry args={[RAIO_EMBOLO, RAIO_EMBOLO, 0.16, 40]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>

      <Peca id={PECA.vedacaoEmbolo} explodir={explodir} afastamento={[0, -0.5, 0]}>
        <mesh position={[0, Y_EMBOLO, 0]} rotation={ANEL_EM_Y}>
          <torusGeometry args={[RAIO_EMBOLO + 0.01, 0.03, 12, 48]} />
          <Mat cor="borracha" />
        </mesh>
      </Peca>

      <Peca id={PECA.vedacaoHaste} explodir={explodir} afastamento={[0, 0.5, 0]}>
        <mesh position={[0, METADE_CURSO + 0.12, 0]} rotation={ANEL_EM_Y}>
          <torusGeometry args={[0.11, 0.03, 12, 32]} />
          <Mat cor="borracha" />
        </mesh>
      </Peca>

      <Peca id={PECA.cabecotes}>
        {/* cada cabeçote sai para o seu lado, em direções diferentes */}
        <Parte explodir={explodir} afastamento={[-0.5, 0, 0.4]}>
          <mesh position={[0, METADE_CURSO + CABECOTE_ALTURA / 2, 0]}>
            <cylinderGeometry args={[RAIO_EXTERNO + 0.08, RAIO_EXTERNO + 0.08, CABECOTE_ALTURA, 48]} />
            <Mat cor="aco" />
          </mesh>
        </Parte>
        <Parte explodir={explodir} afastamento={[-0.5, 0, -0.4]}>
          <mesh position={[0, -(METADE_CURSO + CABECOTE_ALTURA / 2), 0]}>
            <cylinderGeometry args={[RAIO_EXTERNO + 0.08, RAIO_EXTERNO + 0.08, CABECOTE_ALTURA, 48]} />
            <Mat cor="aco" />
          </mesh>
        </Parte>
      </Peca>

      <Peca id={PECA.amortecimento} explodir={explodir} afastamento={[0, 0, 0.5]}>
        {[-1, 1].map((sinal) => (
          <mesh key={sinal} position={[0.2, sinal * 1.22, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.14, 20]} />
            <Mat cor="acoEscuro" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.conexoes} explodir={explodir} afastamento={[0, 0, 0.6]}>
        {[-1, 1].map((sinal) => (
          <mesh key={sinal} position={[0.61, sinal * (METADE_CURSO + 0.07), 0]} rotation={GIRO_X}>
            <cylinderGeometry args={[0.07, 0.07, 0.22, 20]} />
            <Mat cor="azul" />
          </mesh>
        ))}
      </Peca>
    </group>
  );
}
