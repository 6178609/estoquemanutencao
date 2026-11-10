import type { Metadata } from "next";

import { AbasVisao, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho, Cartao } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { NOME_DIA } from "@/lib/paradas/calendario";
import { programacaoParadas } from "@/lib/paradas/dados";
import { semanaIso } from "@/lib/wcm/planos";
import { barra, contexto } from "@/lib/wcm/contexto";
import { dataBr, partes } from "@/lib/wcm/util";

import { param } from "../execucao/_ui/memo";
import { TabelaProgramacao, type LinhaTela } from "./TabelaProgramacao";
import { Verificacao } from "./Verificacao";

export const metadata: Metadata = { title: "Programação de paradas" };
export const dynamic = "force-dynamic";

const VISOES = ["Programação", "Verificação"];
const ORIGEM: Record<string, string> = {
  "ip19": "com HH na própria IP19", "iw38op-ordem": "completadas pelas operações da ordem (IW38OP)",
  "iw38op-plano": "completadas pela ordem do mesmo plano e equipamento", "ip19-mesmo-plano": "completadas por outra chamada do mesmo plano",
  "sem-hh": "sem HH (sem operação nem plano anterior)",
};

export default async function ProgramacaoParadas(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigir("programacao_paradas");
  const params = await props.searchParams;
  const [c, prog] = await Promise.all([contexto(params), programacaoParadas()]);
  const visao = VISOES.includes(param(params, "visao")) ? param(params, "visao") : VISOES[0];
  const cab = <Cabecalho titulo="Programação de paradas," destaque="dia a dia, dentro do HH." sobre="Planejamento · GAL1 Componentes"
    subtitulo="As chamadas da IP19 distribuídas em paradas de máquina por dia e turno, dentro da capacidade da equipe e das regras de programação (máquinas críticas no dia da semana delas, uma prensa e uma Pellet por semana, nenhum turno vazio…). Os números vêm das bases do site: IP19, IW38, IW38OP e IH08." />;
  if (!prog) {
    return <PaginaWcm barra={barra(c)} periodo={false} dimensoes={false}>{cab}<SemDados base="IP19 (planos de manutenção)" /></PaginaWcm>;
  }
  const { montado, calculo } = prog;
  const e = montado.entrada;
  const porAlerta = new Map<string, string[]>();
  for (const a of calculo.alertas) porAlerta.set(a.linhaId, [...(porAlerta.get(a.linhaId) ?? []), a.texto]);
  const t = e.parametros.turnos;
  const linhas: LinhaTela[] = calculo.r.linhas.map((l) => {
    const d = e.demandas.find((x) => x.mes === l.mes && x.ativo === l.ativo);
    const A = e.ativos[l.ativo];
    const p = partes(l.data);
    const janela = p.semana === 6 ? `${t.sabado.inicio}–${t.sabado.fim}` : l.turno === 1 ? `${t.t1.inicio}–${t.t1.fim}` : `${t.t2.inicio}–${t.t2.fim}`;
    return {
      id: l.id, mes: l.mes, data: dataBr(l.data), dia: NOME_DIA[p.semana], semana: semanaIso(l.data).semana, turno: l.turno, ativo: l.ativo,
      equipamentos: (A?.equipamentos ?? []).join(", "), hhMec: l.hh.mec, hhEle: l.hh.ele, parada: `${l.parada} de ${l.paradasNoMes}`, janela,
      marcas: l.marcas, itens: l.itens.length, itensMes: d?.itens.length ?? 0, datasIp19: (d?.datas ?? []).map((x) => dataBr(x).slice(0, 5)).join(", "),
      tipo: l.tipo, grupo: l.grupo ?? "", acimaMec: l.acima.mec, acimaEle: l.acima.ele, campos: l.campos.join(", "), alertas: porAlerta.get(l.id) ?? [],
    };
  });
  const meses = [...new Set([...calculo.resumo.map((r) => r.mes), ...linhas.map((l) => l.mes)])].sort();
  const n = (x: number) => x.toLocaleString("pt-BR");
  const descartes = Object.entries(montado.leitura.descartes).filter(([, q]) => q > 0);
  return (
    <PaginaWcm barra={barra(c)} periodo={false} dimensoes={false}>
      {cab}
      <Secao titulo="Programação" destaque={`${n(calculo.r.linhas.length)} linhas · ${n(Object.keys(e.ativos).length)} ativos`}
        sub={`De ${dataBr(e.inicio)} a ${dataBr(e.fim)}. Linha em vermelho = regra quebrada (a regra aparece na coluna Alerta).`}>
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        {visao === "Verificação"
          ? <Verificacao resumo={calculo.resumo} conferencias={calculo.conferencias} />
          : <TabelaProgramacao linhas={linhas} meses={meses} />}
      </Secao>
      <Secao titulo="De onde vêm" destaque="os números">
        <Cartao className="space-y-3 p-5 text-[13px] text-texto-2">
          <p>
            Bases: IP19 {prog.atualizado.ip19 ?? "—"} · IW38 {prog.atualizado.iw38 ?? "—"} · IW38OP {prog.atualizado.iw38op ?? "—"} · IH08 {prog.atualizado.ih08 ?? "—"}
            {prog.demo && " · demonstração (dados fictícios, todas as localizações e centros)"}.
          </p>
          <p>
            {n(montado.leitura.itens.length)} operações da IP19 entraram
            {descartes.length > 0 && <> ; ficaram de fora: {descartes.map(([m, q]) => `${n(q)} ${m}`).join(", ")}</>}.
            {montado.leitura.semCentro > 0 && <> {n(montado.leitura.semCentro)} sem centro de trabalho (assumidas como mecânica).</>}
          </p>
          <p>Chamadas: {Object.entries(montado.completadas).filter(([, q]) => q > 0).map(([o, q]) => `${n(q)} ${ORIGEM[o] ?? o}`).join(" · ") || "nenhuma"}.</p>
          {calculo.r.retirados.length > 0 && <p>{n(calculo.r.retirados.length)} ativo(s) com HH irrelevante no mês ficaram fora da programação (só inspeção rápida).</p>}
          {calculo.r.semHh.length > 0 && <p>{n(calculo.r.semHh.length)} ativo(s) com HH que não coube (Ativos sem HH).</p>}
          {[...montado.avisos, ...calculo.r.avisos].map((a) => <p key={a} className="text-texto-3">{a}</p>)}
        </Cartao>
      </Secao>
    </PaginaWcm>
  );
}
