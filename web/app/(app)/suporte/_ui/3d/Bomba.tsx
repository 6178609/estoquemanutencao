import { Path, Shape, Vector2 } from "three";

import { Mat, Peca } from "./Peca";
import type { ModeloProps } from "./Peca";

/**
 * Bomba centrífuga esquemática, eixo no Z: voluta em espiral (com furo para o rotor), rotor com seis pás, sucção
 * axial pela frente, recalque tangencial pela direita e, atrás, selo, rolamentos e acoplamento.
 * Cada peça é um grupo `name` = id de MODELOS.bomba.
 */
const PECA = {
  voluta: "voluta",
  rotor: "rotor",
  eixo: "eixo",
  seloMecanico: "selo_mecanico",
  rolamentos: "rolamentos",
  acoplamento: "acoplamento",
  succao: "succao",
  recalque: "recalque",
} as const;

/** Ids das peças desenhadas (testados contra MODELOS em testes/modelos3d.test.ts). */
export const PECAS_BOMBA: readonly string[] = Object.values(PECA);

const RAIO_ROTOR = 0.58;
const RAIO_CAMARA = 0.62;
const ESPESSURA_VOLUTA = 0.22;
const PAS = 6;
const COMPRIMENTO_PA = 0.4;

/** Cilindro com o eixo no Z: o cilindro do three.js tem o eixo em Y, então gira 90° em X. */
const GIRO_Z: [number, number, number] = [Math.PI / 2, 0, 0];
/** Cilindro com o eixo no X (bocal de recalque). */
const GIRO_X: [number, number, number] = [0, 0, Math.PI / 2];

/**
 * Contorno da voluta vista de frente: o raio cresce de 0,95 a 1,20 ao longo de uma volta (a espiral), e um furo
 * central (câmara do rotor) fica vazado na chapa.
 */
function formaVoluta(): Shape {
  const passos = 72;
  const pontos: Vector2[] = [];
  for (let i = 0; i < passos; i++) {
    const t = i / passos;
    const a = 2 * Math.PI * t;
    const r = 0.95 + 0.25 * t;
    pontos.push(new Vector2(r * Math.cos(a), r * Math.sin(a)));
  }
  const forma = new Shape(pontos);
  const camara = new Path();
  camara.absarc(0, 0, RAIO_CAMARA, 0, 2 * Math.PI, true);
  forma.holes.push(camara);
  return forma;
}

const VOLUTA_FORMA = formaVoluta();
const EXTRUSAO_VOLUTA = { depth: ESPESSURA_VOLUTA, bevelEnabled: false, curveSegments: 1 };

export function Bomba({ explodir }: ModeloProps) {
  // o eixo (Z local) fica horizontal na tela: a sucção à esquerda e o recalque virado para a câmera
  return (
    <group rotation={[0, -Math.PI / 2, 0]}>
      <Peca id={PECA.voluta} explodir={explodir} afastamento={[0, 0.9, 0]}>
        <mesh position={[0, 0, -ESPESSURA_VOLUTA / 2]}>
          <extrudeGeometry args={[VOLUTA_FORMA, EXTRUSAO_VOLUTA]} />
          <Mat cor="acoClaro" />
        </mesh>
      </Peca>

      <Peca id={PECA.rotor} explodir={explodir} afastamento={[0, 0, 0.9]}>
        <mesh rotation={GIRO_Z}>
          <cylinderGeometry args={[RAIO_ROTOR, RAIO_ROTOR, 0.06, 48]} />
          <Mat cor="acoClaro" />
        </mesh>
        {Array.from({ length: PAS }, (_, k) => {
          const a = (k * 2 * Math.PI) / PAS;
          const raioMedio = 0.15 + COMPRIMENTO_PA / 2;
          return (
            <mesh
              key={k}
              position={[raioMedio * Math.cos(a), raioMedio * Math.sin(a), 0]}
              rotation={[0, 0, a]}
            >
              <boxGeometry args={[COMPRIMENTO_PA, 0.05, 0.14]} />
              <Mat cor="acoEscuro" />
            </mesh>
          );
        })}
        <mesh position={[0, 0, 0.1]} rotation={GIRO_Z}>
          <cylinderGeometry args={[0.14, 0.14, 0.2, 24]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>

      <Peca id={PECA.eixo} explodir={explodir} afastamento={[0, 0, -0.5]}>
        <mesh position={[0, 0, -0.35]} rotation={GIRO_Z}>
          <cylinderGeometry args={[0.07, 0.07, 2.5, 20]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>

      <Peca id={PECA.seloMecanico} explodir={explodir} afastamento={[0, 0, -0.6]}>
        <mesh position={[0, 0, -0.2]} rotation={GIRO_Z}>
          <cylinderGeometry args={[0.24, 0.24, 0.18, 32]} />
          <Mat cor="aco" />
        </mesh>
        <mesh position={[0, 0, -0.3]}>
          <torusGeometry args={[0.14, 0.03, 12, 32]} />
          <Mat cor="borracha" />
        </mesh>
      </Peca>

      <Peca id={PECA.rolamentos} explodir={explodir} afastamento={[0, 0, -1.1]}>
        <mesh position={[0, 0, -0.8]} rotation={GIRO_Z}>
          <cylinderGeometry args={[0.26, 0.26, 0.5, 40]} />
          <Mat cor="acoClaro" />
        </mesh>
        <mesh position={[0, 0, -0.55]}>
          <torusGeometry args={[0.2, 0.03, 12, 40]} />
          <Mat cor="acoClaro" />
        </mesh>
        <mesh position={[0, 0, -1.05]}>
          <torusGeometry args={[0.2, 0.03, 12, 40]} />
          <Mat cor="acoClaro" />
        </mesh>
      </Peca>

      <Peca id={PECA.acoplamento} explodir={explodir} afastamento={[0, 0, -1.7]}>
        <mesh position={[0, 0, -1.25]} rotation={GIRO_Z}>
          <cylinderGeometry args={[0.18, 0.18, 0.3, 32]} />
          <Mat cor="aco" />
        </mesh>
        <mesh position={[0, 0, -1.5]} rotation={GIRO_Z}>
          <cylinderGeometry args={[0.09, 0.09, 0.16, 24]} />
          <Mat cor="borracha" />
        </mesh>
        <mesh position={[0, 0, -1.7]} rotation={GIRO_Z}>
          <cylinderGeometry args={[0.18, 0.18, 0.22, 32]} />
          <Mat cor="aco" />
        </mesh>
      </Peca>

      <Peca id={PECA.succao} explodir={explodir} afastamento={[0, 0, 1.6]}>
        <mesh position={[0, 0, 0.5]} rotation={GIRO_Z}>
          <cylinderGeometry args={[0.22, 0.22, 0.8, 32]} />
          <Mat cor="azul" />
        </mesh>
        <mesh position={[0, 0, 0.94]} rotation={GIRO_Z}>
          <cylinderGeometry args={[0.32, 0.32, 0.08, 40]} />
          <Mat cor="azul" />
        </mesh>
      </Peca>

      <Peca id={PECA.recalque} explodir={explodir} afastamento={[0.4, 0, 0]}>
        <mesh position={[1.35, 0, 0]} rotation={GIRO_X}>
          <cylinderGeometry args={[0.2, 0.2, 0.75, 32]} />
          <Mat cor="azul" />
        </mesh>
        <mesh position={[1.75, 0, 0]} rotation={GIRO_X}>
          <cylinderGeometry args={[0.28, 0.28, 0.08, 40]} />
          <Mat cor="azul" />
        </mesh>
      </Peca>
    </group>
  );
}
