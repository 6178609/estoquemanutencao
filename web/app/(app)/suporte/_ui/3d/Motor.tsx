import { RolamentoMini } from "./Comuns";
import { anel, circulo, Mat, naAbertura, NoEixo, Parte, Peca, perfil, radial, Torneado } from "./Peca";
import type { ModeloProps } from "./Peca";

/**
 * Motor elétrico de indução em corte, deitado no X (eixo do motor = X; ponta de eixo à direita, ventilador à
 * esquerda). Um quadrante aberto mostra estator com bobinas, rotor, rolamentos e o ventilador dentro da tampa.
 * Vista explodida: tampas, rolamentos, ventilador e tampa do ventilador saem ao longo do eixo; a caixa de ligação sobe.
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

const R_CARCACA = 0.62;
const METADE = 0.85; // meio comprimento da carcaça
const Y_ROLAMENTO = 0.97;
const ALETAS = 20;

/** Carcaça: tubo com reforço nas pontas (encaixe das tampas). */
const PERFIL_CARCACA = perfil([
  [R_CARCACA - 0.06, -METADE], [R_CARCACA + 0.04, -METADE], [R_CARCACA + 0.04, -METADE + 0.08],
  [R_CARCACA, -METADE + 0.1], [R_CARCACA, METADE - 0.1], [R_CARCACA + 0.04, METADE - 0.08],
  [R_CARCACA + 0.04, METADE], [R_CARCACA - 0.06, METADE],
]);
/** Tampa dianteira (y > 0): disco com cubo onde fica o rolamento. A traseira é o espelho. */
const pares = (s: 1 | -1): [number, number][] => [
  [0.2, s * 0.86], [R_CARCACA + 0.04, s * 0.86], [R_CARCACA + 0.04, s * 0.94], [0.36, s * 1.0],
  [0.27, s * 1.07], [0.2, s * 1.07],
];
const PERFIL_TAMPA_DIANT = perfil(pares(1));
const PERFIL_TAMPA_TRAS = perfil(pares(-1).reverse());
const NUCLEO_ESTATOR = anel(0.45, R_CARCACA, -0.6, 0.6);
const CABECAS_BOBINA = [circulo(0.52, 0.66, 0.065), circulo(0.52, -0.66, 0.065)];
const NUCLEO_ROTOR = anel(0.07, 0.43, -0.6, 0.6);
const ANEIS_ROTOR = [anel(0.3, 0.43, 0.6, 0.66), anel(0.3, 0.43, -0.66, -0.6)];
const EIXO = anel(0, 0.07, -1.35, 1.65);
const CHAVETA = anel(0, 0.072, 1.3, 1.55); // marca da ponta de eixo (rasgo de chaveta, só visual)
/** Tampa do ventilador: chapa cilíndrica com fundo, a grade é sugerida pelo fundo vazado. */
const PERFIL_TAMPA_VENT = perfil([
  [R_CARCACA, -0.94], [R_CARCACA + 0.03, -0.94], [R_CARCACA + 0.03, -1.52], [0.14, -1.52], [0.14, -1.49],
  [R_CARCACA, -1.49],
]);
const CUBO_VENT = anel(0.07, 0.12, -1.32, -1.16);

/** Aletas da carcaça, fora do quadrante aberto. */
const ALETAS_POS = Array.from({ length: ALETAS }, (_, k) => (2 * Math.PI * k) / ALETAS + 0.08)
  .map((phi) => radial(phi, R_CARCACA + 0.06))
  .filter((p) => !naAbertura(p.position[0], p.position[2], "x"));
const PAS_VENT = Array.from({ length: 8 }, (_, k) => radial((2 * Math.PI * k) / 8, 0.33, -1.24));

export function Motor({ explodir }: ModeloProps) {
  return (
    <group>
      <Peca id={PECA.carcaca} explodir={explodir}>
        <NoEixo eixo="x">
          <Torneado perfil={PERFIL_CARCACA} cor="azul" corte />
          {ALETAS_POS.map((p, k) => (
            <mesh key={k} {...p}>
              <boxGeometry args={[0.12, 1.5, 0.035]} />
              <Mat cor="azul" />
            </mesh>
          ))}
        </NoEixo>
        {/* pés de fixação */}
        {[-0.5, 0.5].map((x) => (
          <mesh key={x} position={[x, -R_CARCACA - 0.06, 0]}>
            <boxGeometry args={[0.32, 0.16, 1.3]} />
            <Mat cor="azul" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.tampas}>
        <Parte explodir={explodir} afastamento={[0.85, 0, 0]}>
          <NoEixo eixo="x"><Torneado perfil={PERFIL_TAMPA_DIANT} cor="acoEscuro" corte /></NoEixo>
        </Parte>
        <Parte explodir={explodir} afastamento={[-0.85, 0, 0]}>
          <NoEixo eixo="x"><Torneado perfil={PERFIL_TAMPA_TRAS} cor="acoEscuro" corte /></NoEixo>
        </Parte>
      </Peca>

      <Peca id={PECA.estator} explodir={explodir}>
        <NoEixo eixo="x">
          <Torneado perfil={NUCLEO_ESTATOR} cor="acoEscuro" corte />
          {CABECAS_BOBINA.map((p, k) => <Torneado key={k} perfil={p} cor="cobre" corte />)}
        </NoEixo>
      </Peca>

      <Peca id={PECA.rotor} explodir={explodir}>
        <NoEixo eixo="x">
          <Torneado perfil={NUCLEO_ROTOR} cor="aco" />
          {ANEIS_ROTOR.map((p, k) => <Torneado key={k} perfil={p} cor="acoEscuro" />)}
        </NoEixo>
      </Peca>

      <Peca id={PECA.eixo}>
        <NoEixo eixo="x">
          <Torneado perfil={EIXO} cor="acoClaro" segmentos={32} />
          <Torneado perfil={CHAVETA} cor="aco" segmentos={32} />
        </NoEixo>
      </Peca>

      <Peca id={PECA.rolamentoDianteiro} explodir={explodir} afastamento={[0.5, 0, 0]}>
        <NoEixo eixo="x"><RolamentoMini y={Y_ROLAMENTO} rInt={0.07} rExt={0.2} largura={0.12} /></NoEixo>
      </Peca>

      <Peca id={PECA.rolamentoTraseiro} explodir={explodir} afastamento={[-0.5, 0, 0]}>
        <NoEixo eixo="x"><RolamentoMini y={-Y_ROLAMENTO} rInt={0.07} rExt={0.2} largura={0.12} /></NoEixo>
      </Peca>

      <Peca id={PECA.ventilador} explodir={explodir} afastamento={[-1.0, 0, 0]}>
        <NoEixo eixo="x">
          <Torneado perfil={CUBO_VENT} cor="acoEscuro" segmentos={24} />
          {PAS_VENT.map((p, k) => (
            <mesh key={k} {...p}>
              <boxGeometry args={[0.42, 0.14, 0.03]} />
              <Mat cor="acoEscuro" />
            </mesh>
          ))}
        </NoEixo>
      </Peca>

      <Peca id={PECA.tampaVentilador} explodir={explodir} afastamento={[-1.5, 0, 0]}>
        <NoEixo eixo="x"><Torneado perfil={PERFIL_TAMPA_VENT} cor="aco" corte /></NoEixo>
      </Peca>

      <Peca id={PECA.caixaLigacao} explodir={explodir} afastamento={[0, 0.55, 0]}>
        <mesh position={[0.15, R_CARCACA + 0.16, -0.12]}>
          <boxGeometry args={[0.46, 0.26, 0.42]} />
          <Mat cor="azul" />
        </mesh>
        <mesh position={[0.15, R_CARCACA + 0.31, -0.12]}>
          <boxGeometry args={[0.5, 0.05, 0.46]} />
          <Mat cor="acoEscuro" />
        </mesh>
        {/* prensa-cabo */}
        <mesh position={[0.15, R_CARCACA + 0.16, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.1, 16]} />
          <Mat cor="borracha" />
        </mesh>
      </Peca>
    </group>
  );
}
