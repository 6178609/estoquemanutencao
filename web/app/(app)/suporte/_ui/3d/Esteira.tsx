import { Mat, Peca } from "./Peca";
import type { ModeloProps } from "./Peca";
import { formaCorreia } from "./geometria";

/**
 * Esteira transportadora esquemática, vista lateral: tambor de acionamento (direita) e tambor de retorno (esquerda),
 * correia em loop nos dois, roletes de carga em cima e de retorno embaixo, mancais nas pontas, raspador no tambor
 * de acionamento e esticador no tambor de retorno. Os eixos dos tambores e roletes estão no Z (largura da correia).
 * Cada peça é um grupo `name` = id de MODELOS.esteira.
 */
const PECA = {
  tamborAcionamento: "tambor_acionamento",
  tamborRetorno: "tambor_retorno",
  roletes: "roletes",
  correia: "correia",
  raspador: "raspador",
  mancais: "mancais",
  esticador: "esticador",
} as const;

/** Ids das peças desenhadas (testados contra MODELOS em testes/modelos3d.test.ts). */
export const PECAS_ESTEIRA: readonly string[] = Object.values(PECA);

const TAMBOR = { x: 1.1, raio: 0.28 };
const TAMBOR_RETORNO_X = -1.1;
/** A correia fica 0,02 fora dos tambores (sem z-fighting). Espessura de 0,04 e largura 0,9. */
const RAIO_CORREIA = 0.3;
const ESPESSURA_CORREIA = 0.04;
const LARGURA_CORREIA = 0.9;
const RAIO_ROLETE = 0.07;
const COMPRIMENTO_ROLETE = 0.95;
const CORREIA_FORMA = formaCorreia(TAMBOR_RETORNO_X, RAIO_CORREIA, TAMBOR.x, RAIO_CORREIA, ESPESSURA_CORREIA);
const EXTRUSAO_CORREIA = { depth: LARGURA_CORREIA, bevelEnabled: false, curveSegments: 1 };

/** Posições dos roletes: em cima, por baixo do ramo de carga; embaixo, por baixo do ramo de retorno. */
const X_ROLETES = [-0.6, 0, 0.6];
const Y_ROLETE_CARGA = RAIO_CORREIA - RAIO_ROLETE;
const Y_ROLETE_RETORNO = -(RAIO_CORREIA + ESPESSURA_CORREIA) - RAIO_ROLETE;
/** Mancais nas pontas dos eixos, fora da largura da correia. */
const Z_MANCAL = 0.62;

/** Cilindro com o eixo no Z: o do three.js tem o eixo em Y, então gira 90° em X. */
const GIRO_Z: [number, number, number] = [Math.PI / 2, 0, 0];

export function Esteira({ explodir }: ModeloProps) {
  return (
    <group>
      <Peca id={PECA.tamborAcionamento} explodir={explodir} afastamento={[0.5, 0, 0]}>
        <mesh position={[TAMBOR.x, 0, 0]} rotation={GIRO_Z}>
          <cylinderGeometry args={[TAMBOR.raio, TAMBOR.raio, LARGURA_CORREIA, 48]} />
          <Mat cor="aco" />
        </mesh>
        <mesh position={[TAMBOR.x, 0, 0]} rotation={GIRO_Z}>
          <cylinderGeometry args={[0.05, 0.05, 1.5, 16]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>

      <Peca id={PECA.tamborRetorno} explodir={explodir} afastamento={[-0.5, 0, 0]}>
        <mesh position={[TAMBOR_RETORNO_X, 0, 0]} rotation={GIRO_Z}>
          <cylinderGeometry args={[TAMBOR.raio, TAMBOR.raio, LARGURA_CORREIA, 48]} />
          <Mat cor="aco" />
        </mesh>
        <mesh position={[TAMBOR_RETORNO_X, 0, 0]} rotation={GIRO_Z}>
          <cylinderGeometry args={[0.05, 0.05, 1.5, 16]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>

      <Peca id={PECA.roletes} explodir={explodir} afastamento={[0, 0, 0.7]}>
        {X_ROLETES.flatMap((x) => [
          <mesh key={`c-${x}`} position={[x, Y_ROLETE_CARGA, 0]} rotation={GIRO_Z}>
            <cylinderGeometry args={[RAIO_ROLETE, RAIO_ROLETE, COMPRIMENTO_ROLETE, 20]} />
            <Mat cor="acoClaro" />
          </mesh>,
          <mesh key={`r-${x}`} position={[x, Y_ROLETE_RETORNO, 0]} rotation={GIRO_Z}>
            <cylinderGeometry args={[RAIO_ROLETE, RAIO_ROLETE, COMPRIMENTO_ROLETE, 20]} />
            <Mat cor="acoClaro" />
          </mesh>,
        ])}
        {/* longarinas que seguram os roletes de retorno */}
        {[-0.55, 0.55].map((z) => (
          <mesh key={z} position={[0, Y_ROLETE_RETORNO - RAIO_ROLETE - 0.06, z]}>
            <boxGeometry args={[2.5, 0.06, 0.08]} />
            <Mat cor="acoEscuro" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.correia} explodir={explodir} afastamento={[0, 0.6, 0]}>
        <mesh position={[0, 0, -LARGURA_CORREIA / 2]}>
          <extrudeGeometry args={[CORREIA_FORMA, EXTRUSAO_CORREIA]} />
          <Mat cor="borracha" />
        </mesh>
      </Peca>

      <Peca id={PECA.raspador} explodir={explodir} afastamento={[0.4, -0.4, 0]}>
        {/* lâmina encostada na correia, no lado de fora do tambor de acionamento (ângulo de -45°) */}
        <mesh position={[TAMBOR.x + 0.36 * Math.cos(-Math.PI / 4), 0.36 * Math.sin(-Math.PI / 4), 0]} rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[0.04, 0.3, LARGURA_CORREIA]} />
          <Mat cor="azul" />
        </mesh>
      </Peca>

      <Peca id={PECA.mancais} explodir={explodir} afastamento={[0, 0.5, 0]}>
        {[TAMBOR.x, TAMBOR_RETORNO_X].flatMap((x) =>
          [-Z_MANCAL, Z_MANCAL].flatMap((z) => [
            <mesh key={`m-${x}-${z}`} position={[x, 0, z]} rotation={GIRO_Z}>
              <cylinderGeometry args={[0.11, 0.11, 0.12, 24]} />
              <Mat cor="acoClaro" />
            </mesh>,
            <mesh key={`p-${x}-${z}`} position={[x, -0.3, z]}>
              <boxGeometry args={[0.22, 0.44, 0.14]} />
              <Mat cor="acoEscuro" />
            </mesh>,
          ]),
        )}
      </Peca>

      <Peca id={PECA.esticador} explodir={explodir} afastamento={[-0.5, 0, 0]}>
        {[-Z_MANCAL, Z_MANCAL].map((z) => (
          <mesh key={z} position={[-1.415, 0, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.04, 0.04, 0.41, 16]} />
            <Mat cor="aco" />
          </mesh>
        ))}
        <mesh position={[-1.65, 0, 0]}>
          <boxGeometry args={[0.06, 0.4, 1.5]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>
    </group>
  );
}
