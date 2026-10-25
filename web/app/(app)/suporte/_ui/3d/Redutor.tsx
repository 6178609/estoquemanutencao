import { RolamentoMini } from "./Comuns";
import { anel, circulo, Mat, NoEixo, Peca, Torneado } from "./Peca";
import type { ModeloProps } from "./Peca";
import { formaEngrenagem } from "./geometria";

/**
 * Redutor de engrenagens de um estágio, eixos no Z (para a câmera). A tampa da frente foi retirada para mostrar o
 * engrenamento; os rolamentos e os retentores ficam na parede de trás, por onde os eixos saem.
 * Vista explodida: engrenagens e eixos saem pela frente; rolamentos e retentores saem por trás.
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

/** Pinhão (12 dentes) e coroa (22 dentes) com o mesmo módulo: a razão de redução é 22/12. */
const PINHAO = { x: -0.62, y: -0.05, rp: 0.38, dentes: 12 };
const COROA = { x: 0.46, y: -0.05, rp: 0.7, dentes: 22 };
const ESPESSURA_ENGRENAGEM = 0.26;
const LARGURA = 2.8;
const ALTURA = 2.0;
const PAREDE = 0.08;
const Z_FUNDO = -0.55; // face interna da parede de trás
const PROFUNDIDADE = 1.0; // da parede de trás até a borda da frente

const PINHAO_FORMA = formaEngrenagem(PINHAO.dentes, PINHAO.rp, 0.07);
const COROA_FORMA = formaEngrenagem(COROA.dentes, COROA.rp, 0.07, 0.08, 0.1);
const EXTRUSAO = { depth: ESPESSURA_ENGRENAGEM, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 1 };
/** Eixos (Y local = Z da cena): da ponta de trás até a frente da engrenagem. */
const EIXO = anel(0, 0.07, -1.25, 0.25);
const CUBO = anel(0.07, 0.17, -0.23, 0.1);
const Y_ROLAMENTO = Z_FUNDO - PAREDE / 2;
const ALOJAMENTO = anel(0.2, 0.28, Z_FUNDO - PAREDE - 0.16, Z_FUNDO - PAREDE);
const RETENTOR = [anel(0.07, 0.19, Z_FUNDO - PAREDE - 0.15, Z_FUNDO - PAREDE - 0.09), circulo(0.1, Z_FUNDO - PAREDE - 0.12, 0.025, 12)];
const VISOR_ARO = anel(0.1, 0.16, 0, 0.05);
const VISOR_VIDRO = anel(0, 0.1, 0.005, 0.035);
const Z_CENTRO = Z_FUNDO + PROFUNDIDADE / 2;

export function Redutor({ explodir }: ModeloProps) {
  const paredes: { p: [number, number, number]; t: [number, number, number] }[] = [
    { p: [0, 0, Z_FUNDO - PAREDE / 2], t: [LARGURA, ALTURA, PAREDE] }, // fundo
    { p: [0, ALTURA / 2 - PAREDE / 2, Z_CENTRO], t: [LARGURA, PAREDE, PROFUNDIDADE] }, // teto
    { p: [0, -ALTURA / 2 + PAREDE / 2, Z_CENTRO], t: [LARGURA, PAREDE, PROFUNDIDADE] }, // piso
    { p: [-LARGURA / 2 + PAREDE / 2, 0, Z_CENTRO], t: [PAREDE, ALTURA, PROFUNDIDADE] },
    { p: [LARGURA / 2 - PAREDE / 2, 0, Z_CENTRO], t: [PAREDE, ALTURA, PROFUNDIDADE] },
  ];
  const zFrente = Z_FUNDO + PROFUNDIDADE;
  return (
    <group>
      <Peca id={PECA.carcaca} explodir={explodir}>
        {paredes.map(({ p, t }) => (
          <mesh key={p.join(",")} position={p}>
            <boxGeometry args={t} />
            <Mat cor="azul" />
          </mesh>
        ))}
        {/* flange da frente (onde a tampa é parafusada) */}
        {[
          { p: [0, ALTURA / 2 + 0.02, zFrente - 0.04], t: [LARGURA + 0.12, 0.12, 0.08] },
          { p: [0, -ALTURA / 2 - 0.02, zFrente - 0.04], t: [LARGURA + 0.12, 0.12, 0.08] },
          { p: [-LARGURA / 2 - 0.02, 0, zFrente - 0.04], t: [0.12, ALTURA + 0.12, 0.08] },
          { p: [LARGURA / 2 + 0.02, 0, zFrente - 0.04], t: [0.12, ALTURA + 0.12, 0.08] },
        ].map(({ p, t }) => (
          <mesh key={p.join(",")} position={p as [number, number, number]}>
            <boxGeometry args={t as [number, number, number]} />
            <Mat cor="azul" />
          </mesh>
        ))}
        {/* alojamentos dos rolamentos, por fora da parede de trás */}
        {[PINHAO, COROA].map((g) => (
          <NoEixo key={g.x} eixo="z" posicao={[g.x, g.y, 0]}><Torneado perfil={ALOJAMENTO} cor="azul" corte /></NoEixo>
        ))}
        {/* pés de fixação */}
        {[-0.95, 0.95].map((x) => (
          <mesh key={x} position={[x, -ALTURA / 2 - 0.1, Z_CENTRO]}>
            <boxGeometry args={[0.6, 0.12, PROFUNDIDADE + 0.3]} />
            <Mat cor="azul" />
          </mesh>
        ))}
      </Peca>

      <Peca id={PECA.pinhao} explodir={explodir} afastamento={[0, 0, 0.9]}>
        <mesh position={[PINHAO.x, PINHAO.y, -ESPESSURA_ENGRENAGEM / 2]}>
          <extrudeGeometry args={[PINHAO_FORMA, EXTRUSAO]} />
          <Mat cor="acoClaro" />
        </mesh>
        <NoEixo eixo="z" posicao={[PINHAO.x, PINHAO.y, 0]}><Torneado perfil={CUBO} cor="aco" segmentos={32} /></NoEixo>
      </Peca>

      <Peca id={PECA.coroa} explodir={explodir} afastamento={[0, 0, 0.9]}>
        <mesh position={[COROA.x, COROA.y, -ESPESSURA_ENGRENAGEM / 2]}>
          <extrudeGeometry args={[COROA_FORMA, EXTRUSAO]} />
          <Mat cor="aco" />
        </mesh>
        <NoEixo eixo="z" posicao={[COROA.x, COROA.y, 0]}><Torneado perfil={CUBO} cor="aco" segmentos={32} /></NoEixo>
      </Peca>

      <Peca id={PECA.eixoEntrada} explodir={explodir} afastamento={[0, 0, 1.4]}>
        <NoEixo eixo="z" posicao={[PINHAO.x, PINHAO.y, 0]}><Torneado perfil={EIXO} cor="acoClaro" segmentos={24} /></NoEixo>
      </Peca>

      <Peca id={PECA.eixoSaida} explodir={explodir} afastamento={[0, 0, 1.4]}>
        <NoEixo eixo="z" posicao={[COROA.x, COROA.y, 0]}><Torneado perfil={EIXO} cor="acoClaro" segmentos={24} /></NoEixo>
      </Peca>

      <Peca id={PECA.rolamentos} explodir={explodir} afastamento={[0, 0, -0.55]}>
        {[PINHAO, COROA].map((g) => (
          <NoEixo key={g.x} eixo="z" posicao={[g.x, g.y, 0]}>
            <RolamentoMini y={Y_ROLAMENTO - 0.03} rInt={0.07} rExt={0.2} largura={0.12} />
          </NoEixo>
        ))}
      </Peca>

      <Peca id={PECA.retentores} explodir={explodir} afastamento={[0, 0, -0.95]}>
        {[PINHAO, COROA].map((g) => (
          <NoEixo key={g.x} eixo="z" posicao={[g.x, g.y, 0]}>
            {RETENTOR.map((p, k) => <Torneado key={k} perfil={p} cor="borracha" corte segmentos={40} />)}
          </NoEixo>
        ))}
      </Peca>

      <Peca id={PECA.nivelOleo} explodir={explodir} afastamento={[0.45, 0, 0]}>
        {/* visor de nível na lateral direita */}
        <NoEixo eixo="x" posicao={[LARGURA / 2, -0.45, Z_CENTRO]}>
          <Torneado perfil={VISOR_ARO} cor="acoEscuro" segmentos={32} />
          <Torneado perfil={VISOR_VIDRO} cor="acoClaro" segmentos={32} />
        </NoEixo>
      </Peca>
    </group>
  );
}
