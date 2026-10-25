import { anel, Mat, NoEixo, Parte, Peca, perfil, Torneado } from "./Peca";
import type { ModeloProps } from "./Peca";
import { formaCorreia } from "./geometria";

/**
 * Transportador de correia, vista lateral: tambor de acionamento (direita, com revestimento de borracha) e tambor de
 * retorno (esquerda), correia em loop, roletes de carga e de retorno nos suportes da estrutura, mancais de pedestal nas
 * pontas dos tambores, raspador sob o tambor de acionamento e esticador de fuso no tambor de retorno. Eixos no Z.
 * Vista explodida: tambores saem para as pontas, a correia sobe, os roletes saem para o lado e os mancais se afastam.
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

const X_ACIONAMENTO = 1.1;
const X_RETORNO = -1.1;
const R_TAMBOR = 0.28;
const R_CORREIA = 0.3; // raio interno da correia nos tambores (revestimento de 0,02 no acionamento)
const ESPESSURA_CORREIA = 0.04;
const LARGURA_CORREIA = 0.86;
const R_ROLETE = 0.07;
const Z_LONGARINA = 0.56;
const Z_MANCAL = 0.66;
const Y_PISO = -0.95;
const Y_LONGARINA = -0.62;

/** Tambor: casca, discos das pontas e cubo, girado em torno do eixo (Y local = Z da cena). */
const TAMBOR = perfil([
  [0.05, -0.5], [0.1, -0.5], [0.1, -0.44], [R_TAMBOR - 0.03, -0.44], [R_TAMBOR - 0.03, -0.46], [R_TAMBOR, -0.46],
  [R_TAMBOR, 0.46], [R_TAMBOR - 0.03, 0.46], [R_TAMBOR - 0.03, 0.44], [0.1, 0.44], [0.1, 0.5], [0.05, 0.5],
]);
const REVESTIMENTO = anel(R_TAMBOR, R_CORREIA, -0.44, 0.44);
const EIXO_TAMBOR = anel(0, 0.05, -0.78, 0.78);
const ROLETE = perfil([[0, -0.47], [R_ROLETE - 0.01, -0.47], [R_ROLETE, -0.45], [R_ROLETE, 0.45], [R_ROLETE - 0.01, 0.47], [0, 0.47]]);
const EIXO_ROLETE = anel(0, 0.02, -0.53, 0.53);
const CAIXA_MANCAL = anel(0.05, 0.11, -0.05, 0.05);
const FUSO = anel(0, 0.025, -0.25, 0.21);

const CORREIA_FORMA = formaCorreia(X_RETORNO, R_CORREIA, X_ACIONAMENTO, R_CORREIA, ESPESSURA_CORREIA);
const EXTRUSAO_CORREIA = { depth: LARGURA_CORREIA, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1, curveSegments: 1 };

const X_ROLETES = [-0.55, 0, 0.55];
const Y_CARGA = R_CORREIA - R_ROLETE;
const Y_RETORNO = -(R_CORREIA + ESPESSURA_CORREIA) - R_ROLETE;
/** Raspador: lâmina radial encostada na correia sob o tambor de acionamento. */
const ANG_RASPADOR = -0.95;
const R_RASPADOR = R_CORREIA + ESPESSURA_CORREIA;

export function Esteira({ explodir }: ModeloProps) {
  return (
    <group position={[0, 0.2, 0]}>
      <Peca id={PECA.tamborAcionamento} explodir={explodir} afastamento={[0.65, 0, 0]}>
        <NoEixo eixo="z" posicao={[X_ACIONAMENTO, 0, 0]}>
          <Torneado perfil={TAMBOR} cor="aco" />
          <Torneado perfil={REVESTIMENTO} cor="borracha" />
          <Torneado perfil={EIXO_TAMBOR} cor="acoClaro" segmentos={20} />
        </NoEixo>
      </Peca>

      <Peca id={PECA.tamborRetorno} explodir={explodir} afastamento={[-0.65, 0, 0]}>
        <NoEixo eixo="z" posicao={[X_RETORNO, 0, 0]}>
          <Torneado perfil={TAMBOR} cor="aco" />
          <Torneado perfil={EIXO_TAMBOR} cor="acoClaro" segmentos={20} />
        </NoEixo>
      </Peca>

      <Peca id={PECA.correia} explodir={explodir} afastamento={[0, 0.75, 0]}>
        <mesh position={[0, 0, -LARGURA_CORREIA / 2]}>
          <extrudeGeometry args={[CORREIA_FORMA, EXTRUSAO_CORREIA]} />
          <Mat cor="borracha" />
        </mesh>
      </Peca>

      <Peca id={PECA.roletes} explodir={explodir} afastamento={[0, 0, 1.0]}>
        {X_ROLETES.flatMap((x) => [Y_CARGA, Y_RETORNO].map((y) => (
          <NoEixo key={`${x}${y}`} eixo="z" posicao={[x, y, 0]}>
            <Torneado perfil={ROLETE} cor="acoClaro" segmentos={24} />
            <Torneado perfil={EIXO_ROLETE} cor="aco" segmentos={12} />
          </NoEixo>
        )))}
      </Peca>

      {/* estrutura (não é peça do diagnóstico): longarinas abaixo do ramo de retorno, suportes dos roletes e dos
          mancais, e pés. Fica baixa e cinza para não tampar a correia. */}
      {[-Z_LONGARINA, Z_LONGARINA].map((z) => (
        <group key={z}>
          <mesh position={[0, Y_LONGARINA, z]}>
            <boxGeometry args={[2.5, 0.1, 0.04]} />
            <Mat cor="acoEscuro" />
          </mesh>
          {X_ROLETES.flatMap((x) => [Y_CARGA, Y_RETORNO].map((y) => (
            <mesh key={`${x}${y}`} position={[x, (y + Y_LONGARINA) / 2, z * 0.96]}>
              <boxGeometry args={[0.035, y - Y_LONGARINA, 0.02]} />
              <Mat cor="acoEscuro" />
            </mesh>
          )))}
          {[X_ACIONAMENTO, X_RETORNO].map((x) => (
            <mesh key={x} position={[x, (Y_LONGARINA - 0.16) / 2, Z_MANCAL * Math.sign(z)]}>
              <boxGeometry args={[0.08, -0.16 - Y_LONGARINA, 0.06]} />
              <Mat cor="acoEscuro" />
            </mesh>
          ))}
          {[-0.85, 0.85].map((x) => (
            <mesh key={x} position={[x, (Y_PISO + Y_LONGARINA) / 2, z]}>
              <boxGeometry args={[0.07, Y_LONGARINA - Y_PISO, 0.07]} />
              <Mat cor="acoEscuro" />
            </mesh>
          ))}
        </group>
      ))}

      <Peca id={PECA.mancais} explodir={explodir}>
        {[-Z_MANCAL, Z_MANCAL].map((z) => (
          <Parte key={z} explodir={explodir} afastamento={[0, 0, Math.sign(z) * 0.45]}>
            {[X_ACIONAMENTO, X_RETORNO].map((x) => (
              <group key={x}>
                <NoEixo eixo="z" posicao={[x, 0, z]}><Torneado perfil={CAIXA_MANCAL} cor="acoEscuro" segmentos={32} /></NoEixo>
                <mesh position={[x, -0.12, z]}>
                  <boxGeometry args={[0.3, 0.08, 0.1]} />
                  <Mat cor="acoEscuro" />
                </mesh>
              </group>
            ))}
          </Parte>
        ))}
      </Peca>

      <Peca id={PECA.raspador} explodir={explodir} afastamento={[0.35, -0.35, 0]}>
        <mesh
          position={[X_ACIONAMENTO + (R_RASPADOR + 0.1) * Math.cos(ANG_RASPADOR), (R_RASPADOR + 0.1) * Math.sin(ANG_RASPADOR), 0]}
          rotation={[0, 0, ANG_RASPADOR]}
        >
          <boxGeometry args={[0.2, 0.03, LARGURA_CORREIA]} />
          <Mat cor="cobre" />
        </mesh>
        <NoEixo eixo="z" posicao={[X_ACIONAMENTO + (R_RASPADOR + 0.22) * Math.cos(ANG_RASPADOR), (R_RASPADOR + 0.22) * Math.sin(ANG_RASPADOR), 0]}>
          <Torneado perfil={EIXO_ROLETE} cor="acoEscuro" segmentos={12} />
        </NoEixo>
      </Peca>

      <Peca id={PECA.esticador} explodir={explodir} afastamento={[-0.95, 0, 0]}>
        {/* fusos do esticador: do mancal do tambor de retorno até a chapa de apoio */}
        {[-Z_MANCAL, Z_MANCAL].map((z) => (
          <NoEixo key={z} eixo="x" posicao={[X_RETORNO - 0.32, 0, z]}>
            <Torneado perfil={FUSO} cor="aco" segmentos={12} />
          </NoEixo>
        ))}
        {[-Z_MANCAL, Z_MANCAL].map((z) => (
          <mesh key={`c${z}`} position={[X_RETORNO - 0.5, -0.02, z]}>
            <boxGeometry args={[0.05, 0.28, 0.16]} />
            <Mat cor="azul" />
          </mesh>
        ))}
      </Peca>
    </group>
  );
}
