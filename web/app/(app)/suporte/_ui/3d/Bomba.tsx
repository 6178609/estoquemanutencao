import { RolamentoMini } from "./Comuns";
import { anel, Mat, NoEixo, Parte, Peca, perfil, radial, Torneado } from "./Peca";
import type { ModeloProps } from "./Peca";

/**
 * Bomba centrífuga monoestágio em corte, eixo no X: sucção axial à esquerda, voluta com o rotor dentro, recalque
 * vertical, selo mecânico, mancal com dois rolamentos e o acoplamento à direita. Um quadrante aberto mostra o interior.
 * Vista explodida: as peças se afastam ao longo do eixo (a voluta e a sucção para a esquerda, o resto para a direita).
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

/** Carcaça (voluta) em casca: parede da frente com o bocal de sucção (olho), periferia e parede de trás com o furo do eixo. */
const PERFIL_VOLUTA = perfil([
  [0.26, -0.36], [0.33, -0.36], [0.33, -0.3], [0.8, -0.3], [1.05, -0.22], [1.13, 0], [1.05, 0.22], [0.8, 0.3],
  [0.22, 0.3], [0.22, 0.24], [0.78, 0.24], [0.98, 0.17], [1.06, 0], [0.98, -0.17], [0.78, -0.24], [0.26, -0.24],
]);
const R_VOLUTA = 1.13;
/** Rotor semiaberto: disco traseiro + cubo; as pás ficam entre o disco e a parede da frente. */
const DISCO_ROTOR = anel(0.07, 0.72, 0.1, 0.14);
const CUBO_ROTOR = perfil([[0.07, -0.16], [0.13, -0.18], [0.16, -0.1], [0.16, 0.1], [0.07, 0.1]]);
const PAS = Array.from({ length: 6 }, (_, k) => radial((2 * Math.PI * k) / 6, 0.44, -0.03));
const EIXO = anel(0, 0.07, -0.2, 1.8);
/** Selo mecânico: sobreposta (em corte) com a sede fixa e a face girante dentro. */
const SOBREPOSTA = perfil([[0.1, 0.3], [0.3, 0.3], [0.3, 0.52], [0.24, 0.52], [0.24, 0.36], [0.1, 0.36]]);
const SEDE = anel(0.075, 0.2, 0.36, 0.41);
const FACE = anel(0.075, 0.17, 0.41, 0.47);
/** Mancal (suporte dos rolamentos) em corte. */
const MANCAL = perfil([
  [0.2, 0.6], [0.34, 0.6], [0.34, 1.4], [0.2, 1.4], [0.2, 1.34], [0.29, 1.34], [0.29, 0.66], [0.2, 0.66],
]);
const Y_ROLAMENTOS = [0.74, 1.26];
const CUBO_ACOPLAMENTO = anel(0.07, 0.21, 1.5, 1.66);
const ELASTICO = anel(0.07, 0.19, 1.66, 1.73);
const CUBO_MOTOR = anel(0.07, 0.21, 1.73, 1.88);
/** Bocal de sucção com flange, à esquerda da voluta. */
const SUCCAO = perfil([[0.26, -1.25], [0.46, -1.25], [0.46, -1.19], [0.32, -1.19], [0.32, -0.36], [0.26, -0.36]]);
/** Bocal de recalque vertical (eixo Y), tangente à voluta, na parte de trás (fora do corte). */
const Z_RECALQUE = -0.6;
const RECALQUE = perfil([[0.18, 0.85], [0.23, 0.85], [0.23, 1.5], [0.36, 1.5], [0.36, 1.56], [0.18, 1.56]]);

export function Bomba({ explodir }: ModeloProps) {
  return (
    <group position={[-0.3, 0, 0]}>
      <Peca id={PECA.voluta} explodir={explodir} afastamento={[-0.55, 0, 0]}>
        <NoEixo eixo="x"><Torneado perfil={PERFIL_VOLUTA} cor="azul" corte /></NoEixo>
        {/* pé da voluta */}
        <mesh position={[0, -R_VOLUTA - 0.08, 0]}>
          <boxGeometry args={[0.5, 0.2, 0.9]} />
          <Mat cor="azul" />
        </mesh>
      </Peca>

      <Peca id={PECA.succao} explodir={explodir} afastamento={[-1.1, 0, 0]}>
        <NoEixo eixo="x"><Torneado perfil={SUCCAO} cor="azul" corte /></NoEixo>
      </Peca>

      <Peca id={PECA.recalque} explodir={explodir} afastamento={[-0.55, 0.55, 0]}>
        <group position={[0, 0, Z_RECALQUE]}><Torneado perfil={RECALQUE} cor="azul" corte /></group>
      </Peca>

      <Peca id={PECA.rotor} explodir={explodir}>
        <NoEixo eixo="x">
          <Torneado perfil={DISCO_ROTOR} cor="aco" />
          <Torneado perfil={CUBO_ROTOR} cor="aco" segmentos={32} />
          {PAS.map((p, k) => (
            <mesh key={k} position={p.position} rotation={[0, p.rotation[1] + 0.45, 0]}>
              <boxGeometry args={[0.52, 0.26, 0.035]} />
              <Mat cor="aco" />
            </mesh>
          ))}
        </NoEixo>
      </Peca>

      <Peca id={PECA.eixo} explodir={explodir} afastamento={[0.2, 0, 0]}>
        <NoEixo eixo="x"><Torneado perfil={EIXO} cor="acoClaro" segmentos={32} /></NoEixo>
      </Peca>

      <Peca id={PECA.seloMecanico} explodir={explodir} afastamento={[0.45, 0, 0]}>
        <NoEixo eixo="x">
          <Torneado perfil={SOBREPOSTA} cor="aco" corte />
          <Torneado perfil={SEDE} cor="acoClaro" corte />
          <Torneado perfil={FACE} cor="borracha" corte />
        </NoEixo>
      </Peca>

      {/* mancal: não é uma peça do diagnóstico, só o suporte dos rolamentos */}
      <NoEixo eixo="x"><Torneado perfil={MANCAL} cor="azul" corte /></NoEixo>
      {/* pé do mancal: alma e sapata */}
      <mesh position={[1.0, -0.825, 0]}>
        <boxGeometry args={[0.5, 0.97, 0.12]} />
        <Mat cor="azul" />
      </mesh>
      <mesh position={[1.0, -1.28, 0]}>
        <boxGeometry args={[0.6, 0.06, 0.5]} />
        <Mat cor="azul" />
      </mesh>
      {/* base */}
      <mesh position={[0.45, -R_VOLUTA - 0.22, 0]}>
        <boxGeometry args={[3.1, 0.08, 1.1]} />
        <Mat cor="acoEscuro" />
      </mesh>

      <Peca id={PECA.rolamentos} explodir={explodir}>
        {Y_ROLAMENTOS.map((y, k) => (
          <Parte key={y} explodir={explodir} afastamento={[0.55 + k * 0.35, 0, 0]}>
            <NoEixo eixo="x"><RolamentoMini y={y} rInt={0.07} rExt={0.2} largura={0.12} /></NoEixo>
          </Parte>
        ))}
      </Peca>

      <Peca id={PECA.acoplamento} explodir={explodir} afastamento={[1.1, 0, 0]}>
        <NoEixo eixo="x">
          <Torneado perfil={CUBO_ACOPLAMENTO} cor="aco" corte />
          <Torneado perfil={ELASTICO} cor="borracha" corte />
          <Torneado perfil={CUBO_MOTOR} cor="aco" corte />
        </NoEixo>
      </Peca>
    </group>
  );
}
