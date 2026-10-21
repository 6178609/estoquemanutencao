import { Mat, Peca } from "./Peca";
import type { ModeloProps } from "./Peca";
import { formaCorreia } from "./geometria";

/**
 * Correia e polias esquemáticas, vista de frente: polia motora (pequena, à esquerda) e polia movida (grande, à direita),
 * correia em loop nas duas e tensor embaixo do ramo frouxo. Os eixos estão no Z; a correia anda no plano XY.
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
/** Espessura radial da correia e largura (no eixo Z). A correia fica um pouco fora da polia (sem z-fighting). */
const ESPESSURA_CORREIA = 0.12;
const LARGURA_CORREIA = 0.16;
const LARGURA_POLIA = 0.36;
/** A polia fica 0,02 menor que o raio interno da correia, para as superfícies não coincidirem. */
const FOLGA_POLIA = 0.02;
const TENSOR = { x: 0, y: -1.0, raio: 0.22 };

const CORREIA_FORMA = formaCorreia(MOTORA.x, MOTORA.raio, MOVIDA.x, MOVIDA.raio, ESPESSURA_CORREIA);
const EXTRUSAO_CORREIA = { depth: LARGURA_CORREIA, bevelEnabled: false, curveSegments: 1 };

/** Cilindro com o eixo no Z: o cilindro do three.js tem o eixo em Y, então gira 90° em X. */
const GIRO_Z: [number, number, number] = [Math.PI / 2, 0, 0];

export function Correia({ explodir }: ModeloProps) {
  return (
    <group>
      <Peca id={PECA.poliaMotora} explodir={explodir} afastamento={[-0.3, 0, 0.6]}>
        <mesh position={[MOTORA.x, 0, 0]} rotation={GIRO_Z}>
          <cylinderGeometry args={[MOTORA.raio - FOLGA_POLIA, MOTORA.raio - FOLGA_POLIA, LARGURA_POLIA, 40]} />
          <Mat cor="aco" />
        </mesh>
        <mesh position={[MOTORA.x, 0, 0]} rotation={GIRO_Z}>
          <cylinderGeometry args={[0.14, 0.14, 0.5, 24]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>

      <Peca id={PECA.poliaMovida} explodir={explodir} afastamento={[0.3, 0, 0.6]}>
        <mesh position={[MOVIDA.x, 0, 0]} rotation={GIRO_Z}>
          <cylinderGeometry args={[MOVIDA.raio - FOLGA_POLIA, MOVIDA.raio - FOLGA_POLIA, LARGURA_POLIA, 56]} />
          <Mat cor="aco" />
        </mesh>
        <mesh position={[MOVIDA.x, 0, 0]} rotation={GIRO_Z}>
          <cylinderGeometry args={[0.16, 0.16, 0.5, 24]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>

      <Peca id={PECA.correia} explodir={explodir} afastamento={[0, 0.6, 0]}>
        <mesh position={[0, 0, -LARGURA_CORREIA / 2]}>
          <extrudeGeometry args={[CORREIA_FORMA, EXTRUSAO_CORREIA]} />
          <Mat cor="borracha" />
        </mesh>
      </Peca>

      <Peca id={PECA.eixos} explodir={explodir} afastamento={[0, -0.3, 0]}>
        {/* eixos das polias, atravessando o cubo */}
        {[MOTORA.x, MOVIDA.x].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={GIRO_Z}>
            <cylinderGeometry args={[0.07, 0.07, 1.6, 20]} />
            <Mat cor="acoEscuro" />
          </mesh>
        ))}
        {/* pedestais e base */}
        {[MOTORA.x, MOVIDA.x].map((x) => (
          <mesh key={`pe-${x}`} position={[x, -0.75, 0]}>
            <boxGeometry args={[0.14, 1.3, 0.5]} />
            <Mat cor="acoEscuro" />
          </mesh>
        ))}
        <mesh position={[0, -1.45, 0]}>
          <boxGeometry args={[2.6, 0.08, 0.9]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>

      <Peca id={PECA.tensor} explodir={explodir} afastamento={[0.5, 0, 0]}>
        <mesh position={[TENSOR.x, TENSOR.y, 0]} rotation={GIRO_Z}>
          <cylinderGeometry args={[TENSOR.raio, TENSOR.raio, 0.3, 32]} />
          <Mat cor="acoClaro" />
        </mesh>
        <mesh position={[TENSOR.x, -1.31, 0]}>
          <boxGeometry args={[0.12, 0.22, 0.5]} />
          <Mat cor="acoClaro" />
        </mesh>
      </Peca>
    </group>
  );
}
