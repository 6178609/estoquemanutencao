import { Vector2 } from "three";

import { Mat, Parte, Peca } from "./Peca";
import type { ModeloProps } from "./Peca";

/**
 * Motor elétrico esquemático. Montado com o eixo em Y e deitado no X pelo grupo raiz; por isso os afastamentos da
 * vista explodida estão no sistema local (Y = ao longo do eixo; X = para cima no modelo deitado).
 * Cada peça é um grupo `name` = id de MODELOS.motor.
 */
const PECA = {
  carcaca: "carcaca",
  tampas: "tampas",
  estator: "estator",
  rotor: "rotor",
  eixo: "eixo",
  rolamentoDianteiro: "rolamento_dianteiro",
  rolamentoTraseiro: "rolamento_traseiro",
  ventilador: "ventilador",
  tampaVentilador: "tampa_ventilador",
  caixaLigacao: "caixa_ligacao",
} as const;

/** Ids das peças desenhadas (testados contra MODELOS em testes/modelos3d.test.ts). */
export const PECAS_MOTOR: readonly string[] = Object.values(PECA);

const SEGMENTOS = 48;
const ALETAS = 16;
const ANGULO_ALETA = (2 * Math.PI) / ALETAS;
const ANGULO_PA = (2 * Math.PI) / 8;

/** Retângulo (r, y) fechado, para tubos e discos girados em torno do eixo Y. */
function retangulo(r0: number, r1: number, y0: number, y1: number): Vector2[] {
  return [new Vector2(r0, y0), new Vector2(r1, y0), new Vector2(r1, y1), new Vector2(r0, y1), new Vector2(r0, y0)];
}

const CARCACA = retangulo(0.62, 0.7, -0.85, 0.85);
const TAMPA_FRONTAL = retangulo(0.22, 0.72, 0.84, 0.94);
const TAMPA_TRASEIRA = retangulo(0.22, 0.72, -0.94, -0.84);
const CUBO_FRONTAL = retangulo(0.22, 0.3, 0.84, 1.02);
const CUBO_TRASEIRO = retangulo(0.22, 0.3, -1.02, -0.84);
const NUCLEO = retangulo(0.46, 0.62, -0.7, 0.7);
const ROLAMENTO_PERFIL = retangulo(0.1, 0.2, -0.05, 0.05);
const TAMPA_VENTILADOR_FIM = retangulo(0.2, 0.46, -1.56, -1.53);

export function Motor({ explodir }: ModeloProps) {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <Peca id={PECA.carcaca} explodir={explodir} afastamento={[0.8, 0, 0]}>
        <mesh>
          <latheGeometry args={[CARCACA, SEGMENTOS]} />
          <Mat cor="aco" />
        </mesh>
        {Array.from({ length: ALETAS }, (_, k) => {
          const a = k * ANGULO_ALETA;
          return (
            <mesh key={k} position={[0.76 * Math.cos(a), 0, 0.76 * Math.sin(a)]} rotation={[0, -a, 0]}>
              <boxGeometry args={[0.12, 1.5, 0.05]} />
              <Mat cor="aco" />
            </mesh>
          );
        })}
      </Peca>

      <Peca id={PECA.tampas}>
        {/* cada tampa sai para o seu lado do eixo */}
        <Parte explodir={explodir} afastamento={[0, 0.5, 0]}>
          <mesh>
            <latheGeometry args={[TAMPA_FRONTAL, SEGMENTOS]} />
            <Mat cor="acoEscuro" />
          </mesh>
          <mesh>
            <latheGeometry args={[CUBO_FRONTAL, SEGMENTOS]} />
            <Mat cor="acoEscuro" />
          </mesh>
        </Parte>
        <Parte explodir={explodir} afastamento={[0, -0.5, 0]}>
          <mesh>
            <latheGeometry args={[TAMPA_TRASEIRA, SEGMENTOS]} />
            <Mat cor="acoEscuro" />
          </mesh>
          <mesh>
            <latheGeometry args={[CUBO_TRASEIRO, SEGMENTOS]} />
            <Mat cor="acoEscuro" />
          </mesh>
        </Parte>
      </Peca>

      <Peca id={PECA.estator} explodir={explodir} afastamento={[-0.5, 0, 0]}>
        <mesh>
          <latheGeometry args={[NUCLEO, SEGMENTOS]} />
          <Mat cor="acoEscuro" />
        </mesh>
        {[-0.8, -0.74, 0.74, 0.8].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.54, 0.07, 12, 48]} />
            <Mat cor="cobre" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.rotor} explodir={explodir} afastamento={[0, 0, 0.6]}>
        <mesh>
          <cylinderGeometry args={[0.42, 0.42, 1.3, 40]} />
          <Mat cor="aco" />
        </mesh>
      </Peca>

      <Peca id={PECA.eixo}>
        <mesh position={[0, 0.025, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 2.65, 20]} />
          <Mat cor="acoEscuro" />
        </mesh>
      </Peca>

      <Peca id={PECA.rolamentoDianteiro} explodir={explodir} afastamento={[0, 0.35, 0]}>
        <group position={[0, 0.93, 0]}>
          <mesh>
            <latheGeometry args={[ROLAMENTO_PERFIL, 32]} />
            <Mat cor="acoClaro" />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.15, 0.03, 10, 32]} />
            <Mat cor="acoClaro" />
          </mesh>
        </group>
      </Peca>

      <Peca id={PECA.rolamentoTraseiro} explodir={explodir} afastamento={[0, -0.35, 0]}>
        <group position={[0, -0.93, 0]}>
          <mesh>
            <latheGeometry args={[ROLAMENTO_PERFIL, 32]} />
            <Mat cor="acoClaro" />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.15, 0.03, 10, 32]} />
            <Mat cor="acoClaro" />
          </mesh>
        </group>
      </Peca>

      <Peca id={PECA.ventilador} explodir={explodir} afastamento={[0, -0.45, 0]}>
        <group position={[0, -1.25, 0]}>
          <mesh>
            <cylinderGeometry args={[0.1, 0.1, 0.14, 20]} />
            <Mat cor="acoEscuro" />
          </mesh>
          {Array.from({ length: 8 }, (_, k) => {
            const a = k * ANGULO_PA;
            return (
              <mesh key={k} position={[0.25 * Math.cos(a), 0, 0.25 * Math.sin(a)]} rotation={[0.35, -a, 0]}>
                <boxGeometry args={[0.24, 0.1, 0.05]} />
                <Mat cor="acoEscuro" />
              </mesh>
            );
          })}
        </group>
      </Peca>

      <Peca id={PECA.tampaVentilador} explodir={explodir} afastamento={[0, -0.3, 0]}>
        <mesh position={[0, -1.25, 0]}>
          <cylinderGeometry args={[0.46, 0.46, 0.6, 36, 1, true]} />
          <Mat cor="aco" />
        </mesh>
        <mesh>
          <latheGeometry args={[TAMPA_VENTILADOR_FIM, 36]} />
          <Mat cor="aco" />
        </mesh>
      </Peca>

      <Peca id={PECA.caixaLigacao} explodir={explodir} afastamento={[0.4, 0, 0]}>
        <mesh position={[0.82, 0.1, 0]}>
          <boxGeometry args={[0.34, 0.45, 0.36]} />
          <Mat cor="aco" />
        </mesh>
      </Peca>
    </group>
  );
}
