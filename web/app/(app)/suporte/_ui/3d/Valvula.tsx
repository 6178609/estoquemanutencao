import { Mat, Peca } from "./Peca";
import type { ModeloProps } from "./Peca";

/**
 * Válvula solenoide esquemática, eixo do carretel no X: corpo com três conexões embaixo e escapes laterais, carretel
 * que sai pelas duas pontas, bobina do lado direito (com espiras de cobre) e molas com a tampa do piloto à esquerda.
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

const METADE_CORPO = 0.75;
const METADE_ALTURA_CORPO = 0.3;
const RAIO_CARRETEL = 0.18;
const RAIO_BOBINA = 0.42;

/** Cilindro com o eixo no X: o do three.js tem o eixo em Y, então gira 90° em Z. */
const GIRO_X: [number, number, number] = [0, 0, Math.PI / 2];
/** Anel (torus) com o eixo no X: o do three.js tem o eixo em Z, então gira 90° em Y. */
const ANEL_EM_X: [number, number, number] = [0, Math.PI / 2, 0];

export function Valvula({ explodir }: ModeloProps) {
  return (
    <group>
      <Peca id={PECA.corpo} explodir={explodir} afastamento={[0, 0, -0.6]}>
        <mesh>
          <boxGeometry args={[METADE_CORPO * 2, METADE_ALTURA_CORPO * 2, 0.6]} />
          <Mat cor="aco" />
        </mesh>
        {/* conexões de pressão e de trabalho, embaixo do corpo */}
        {[-0.4, 0, 0.4].map((x) => (
          <mesh key={x} position={[x, -0.45, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.3, 24]} />
            <Mat cor="acoEscuro" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.carretel} explodir={explodir} afastamento={[0, 0.6, 0]}>
        <mesh rotation={GIRO_X}>
          <cylinderGeometry args={[RAIO_CARRETEL, RAIO_CARRETEL, 2.0, 32]} />
          <Mat cor="acoClaro" />
        </mesh>
        {/* dois batentes (lands) do carretel, dentro do corpo */}
        {[-0.3, 0.3].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={GIRO_X}>
            <cylinderGeometry args={[0.3, 0.3, 0.12, 32]} />
            <Mat cor="acoClaro" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.bobina} explodir={explodir} afastamento={[0.5, 0, 0]}>
        <mesh position={[1.2, 0, 0]} rotation={GIRO_X}>
          <cylinderGeometry args={[RAIO_BOBINA, RAIO_BOBINA, 0.7, 40]} />
          <Mat cor="borracha" />
        </mesh>
        {[0.87, 1.53].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={GIRO_X}>
            <cylinderGeometry args={[0.5, 0.5, 0.06, 40]} />
            <Mat cor="acoEscuro" />
          </mesh>
        ))}
        {/* espiras: anéis de cobre enrolados sobre o corpo da bobina */}
        {[0.95, 1.05, 1.15, 1.25, 1.35, 1.45].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={ANEL_EM_X}>
            <torusGeometry args={[RAIO_BOBINA - 0.02, 0.04, 10, 40]} />
            <Mat cor="cobre" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.molas} explodir={explodir} afastamento={[-0.5, 0, 0]}>
        <mesh position={[-1.05, 0, 0]} rotation={GIRO_X}>
          <cylinderGeometry args={[0.2, 0.2, 0.1, 32]} />
          <Mat cor="acoEscuro" />
        </mesh>
        {[-0.8, -0.86, -0.92, -0.98].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={ANEL_EM_X}>
            <torusGeometry args={[0.24, 0.03, 10, 32]} />
            <Mat cor="acoClaro" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.vedacoes} explodir={explodir} afastamento={[0, -0.5, 0]}>
        {[-METADE_CORPO - 0.01, METADE_CORPO + 0.01].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={ANEL_EM_X}>
            <torusGeometry args={[0.2, 0.03, 10, 32]} />
            <Mat cor="borracha" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.escapes} explodir={explodir} afastamento={[0, -0.5, 0]}>
        {[-0.62, 0.62].map((x) => (
          <mesh key={x} position={[x, -0.45, 0]}>
            <cylinderGeometry args={[0.09, 0.09, 0.3, 24]} />
            <Mat cor="azul" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.acionamentoManual} explodir={explodir} afastamento={[0, 0.5, 0]}>
        <mesh position={[-0.3, 0.42, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.25, 24]} />
          <Mat cor="azul" />
        </mesh>
        <mesh position={[-0.3, 0.3, 0]}>
          <boxGeometry args={[0.3, 0.05, 0.25]} />
          <Mat cor="azul" />
        </mesh>
      </Peca>
    </group>
  );
}
