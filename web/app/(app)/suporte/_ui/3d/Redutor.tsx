import { Mat, Peca } from "./Peca";
import type { ModeloProps } from "./Peca";
import { formaEngrenagem } from "./geometria";

/**
 * Redutor de engrenagens esquemático, eixos em Z (vista de frente, carcaça aberta na frente para ver o engrenamento).
 * Cada peça é um grupo `name` = id de MODELOS.redutor.
 */
const PECA = {
  carcaca: "carcaca",
  pinhao: "pinhao",
  coroa: "coroa",
  eixoEntrada: "eixo_entrada",
  eixoSaida: "eixo_saida",
  rolamentos: "rolamentos",
  retentores: "retentores",
  nivelOleo: "nivel_oleo",
} as const;

/** Ids das peças desenhadas (testados contra MODELOS em testes/modelos3d.test.ts). */
export const PECAS_REDUTOR: readonly string[] = Object.values(PECA);

/** Pinhão (12 dentes) e coroa (22 dentes) com o mesmo passo: a razão de redução é 22/12. */
const PINHAO = { x: -0.64, rp: 0.38, dentes: 12 };
const COROA = { x: 0.44, rp: 0.7, dentes: 22 };
const ESPESSURA_ENGRENAGEM = 0.3;
const RAIO_EIXO = 0.07;
const COMPRIMENTO_EIXO = 2.3;
/** Eixos no Z: do lado de trás da carcaça (z -1.3) até a ponta na frente (z 1.0). */
const Z_EIXO = -0.15;

const PINHAO_FORMA = formaEngrenagem(PINHAO.dentes, PINHAO.rp, 0.075);
const COROA_FORMA = formaEngrenagem(COROA.dentes, COROA.rp, 0.075);
const EXTRUSAO = { depth: ESPESSURA_ENGRENAGEM, bevelEnabled: false, curveSegments: 1 };

/** Cilindro com o eixo no Z: o cilindro do three.js tem o eixo em Y, então gira 90° em X. */
const GIRO_Z: [number, number, number] = [Math.PI / 2, 0, 0];

export function Redutor({ explodir }: ModeloProps) {
  return (
    <group>
      <Peca id={PECA.carcaca} explodir={explodir} afastamento={[0, 0, -0.9]}>
        {/* fundo (por onde saem os eixos) e quatro paredes; a frente fica aberta para ver o engrenamento */}
        <mesh position={[0, 0, -0.6]}>
          <boxGeometry args={[2.7, 1.9, 0.1]} />
          <Mat cor="aco" />
        </mesh>
        <mesh position={[0, 0.9, 0]}>
          <boxGeometry args={[2.7, 0.12, 1.1]} />
          <Mat cor="aco" />
        </mesh>
        <mesh position={[0, -0.9, 0]}>
          <boxGeometry args={[2.7, 0.12, 1.1]} />
          <Mat cor="aco" />
        </mesh>
        <mesh position={[-1.29, 0, 0]}>
          <boxGeometry args={[0.12, 1.8, 1.1]} />
          <Mat cor="aco" />
        </mesh>
        <mesh position={[1.29, 0, 0]}>
          <boxGeometry args={[0.12, 1.8, 1.1]} />
          <Mat cor="aco" />
        </mesh>
        {/* pés de fixação */}
        <mesh position={[-0.9, -1.05, 0]}>
          <boxGeometry args={[0.5, 0.1, 0.9]} />
          <Mat cor="acoEscuro" />
        </mesh>
        <mesh position={[0.9, -1.05, 0]}>
          <boxGeometry args={[0.5, 0.1, 0.9]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>

      <Peca id={PECA.pinhao} explodir={explodir} afastamento={[0, 0, 0.8]}>
        <mesh position={[PINHAO.x, 0, -ESPESSURA_ENGRENAGEM / 2]}>
          <extrudeGeometry args={[PINHAO_FORMA, EXTRUSAO]} />
          <Mat cor="azul" />
        </mesh>
      </Peca>

      <Peca id={PECA.coroa} explodir={explodir} afastamento={[0, 0, 0.8]}>
        <mesh position={[COROA.x, 0, -ESPESSURA_ENGRENAGEM / 2]}>
          <extrudeGeometry args={[COROA_FORMA, EXTRUSAO]} />
          <Mat cor="azul" />
        </mesh>
      </Peca>

      <Peca id={PECA.eixoEntrada} explodir={explodir} afastamento={[0, 0, -0.35]}>
        <mesh position={[PINHAO.x, 0, Z_EIXO]} rotation={GIRO_Z}>
          <cylinderGeometry args={[RAIO_EIXO, RAIO_EIXO, COMPRIMENTO_EIXO, 20]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>

      <Peca id={PECA.eixoSaida} explodir={explodir} afastamento={[0, 0, -0.35]}>
        <mesh position={[COROA.x, 0, Z_EIXO]} rotation={GIRO_Z}>
          <cylinderGeometry args={[RAIO_EIXO, RAIO_EIXO, COMPRIMENTO_EIXO, 20]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>

      <Peca id={PECA.rolamentos} explodir={explodir} afastamento={[0, 0, -0.45]}>
        {[PINHAO.x, COROA.x].map((x) => (
          <group key={x}>
            <mesh position={[x, 0, -0.46]} rotation={GIRO_Z}>
              <cylinderGeometry args={[0.16, 0.16, 0.2, 32]} />
              <Mat cor="acoClaro" />
            </mesh>
            <mesh position={[x, 0, -0.36]}>
              <torusGeometry args={[0.16, 0.03, 12, 40]} />
              <Mat cor="acoClaro" />
            </mesh>
          </group>
        ))}
      </Peca>

      <Peca id={PECA.retentores} explodir={explodir} afastamento={[0, 0, -0.6]}>
        {[PINHAO.x, COROA.x].map((x) => (
          <mesh key={x} position={[x, 0, -0.8]}>
            <torusGeometry args={[0.1, 0.035, 12, 32]} />
            <Mat cor="borracha" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.nivelOleo} explodir={explodir} afastamento={[-0.5, 0, 0]}>
        <mesh position={[-1.41, -0.35, 0.2]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.13, 0.13, 0.12, 32]} />
          <Mat cor="acoClaro" />
        </mesh>
        <mesh position={[-1.47, -0.35, 0.2]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.14, 0.03, 12, 32]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>
    </group>
  );
}
