import { ArrowRight, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Barras, Colunas, Grafico, Linhas, type Cor } from "@/components/graficos";
import { CartaoKpi } from "@/components/Indicador";
import { Aviso, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import * as af from "@/lib/wcm/af";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { barra, contexto } from "@/lib/wcm/contexto";
import { descrever } from "@/lib/wcm/filtros";
import * as ind from "@/lib/wcm/indicadores";
import { dataBr, inicioDoMes, mesBr, partes, somarMeses, type Dia } from "@/lib/wcm/util";

import { Campos, fundoPct, LegendaCores, Nota, Opcoes, Quadro, TabelaSimples, Tile } from "../execucao/_ui/Blocos";
import { COR_ACAO, COR_AF } from "../execucao/_ui/cores";
import { int, num, pct } from "../execucao/_ui/fmt";
import { param } from "../execucao/_ui/memo";
import { PontoSituacao, Tabela, type Coluna } from "../execucao/_ui/Tabela";

export const metadata: Metadata = { title: "Ações de AF" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
type CampoEq = (codigo: string | null | undefined) => string;
const SEM_NOME = "(sem nome)";
const FAIXAS = ["0–7", "8–30", "31–90", "> 90"];
const COR_FAIXA: Cor[] = ["st-atencao", "st-serio", "st-critico", "st-critico"];
const BASES = [{ valor: "limite", rotulo: "Data limite" }, { valor: "inicio", rotulo: "Data de início" }, { valor: "realizada", rotulo: "Data realizada" }];
const CAMPO_BASE = { limite: "dataLimite", inicio: "dataInicio", realizada: "dataRealizada" } as const;
const entre = (d: Dia | null, a: Dia, b: Dia) => d != null && d >= a && d <= b;

export default async function AcoesAf(props: { searchParams: Promise<Params> }) {
  await exigir("af_acoes");
  const params = await props.searchParams;
  const c = await contexto(params);
  const cab = <Cabecalho titulo="Ações de AF," destaque="o plano de ação das análises de falha."
    sobre="Gerenciador de AF"
    subtitulo="Execução e prazo por data limite, fila de prioridade, cumprimento por responsável e supervisor e tipos de ação WCM (causa raiz, TTR, padronização, expansão)." />;
  const moldura = (x: React.ReactNode) => <PaginaWcm barra={barra(c)} dimensoes={false}>{cab}{x}</PaginaWcm>;
  if (!c.acoesAf) return moldura(<SemDados base="Gerenciador de AF (plano de ação)" />);

  const acoes = c.acoesAf, afs = c.afs ?? [], hoje = c.b.hoje;
  const { ini, fim } = c.f;
  const [aIni, aFim] = ind.periodoAnterior(ini, fim);
  const r = af.indicadores(afs, acoes, ini, fim, hoje), ra = af.indicadores(afs, acoes, aIni, aFim, hoje);
  const ex = af.extrasDasAcoes(acoes, ini, fim);
  const porAf = r.acoes_por_af ?? ex.acoes_por_af_sem_afs;
  const iniS = Math.max(ini, inicioDoMes(somarMeses(inicioDoMes(fim), -11)));
  const serie = af.mensal(afs, acoes, iniS, fim, hoje).map(({ mes, ...v }) => ({ mes, valores: v as unknown as ind.Resultado }));
  const vivas = acoes.filter((a) => a.situacao !== af.AC_CANCELADA);
  const campoEq = await campoDoEquipamento(c);
  const abertas = vivas.filter((a) => af.AC_ABERTAS.includes(a.situacao));
  const kpi = (id: string) => <CartaoKpi kpi={ind.POR_ID[id]} valor={(r as unknown as ind.Resultado)[id]} anterior={(ra as unknown as ind.Resultado)[id]}
    metas={c.cad.metas} serie={serie.map((s) => s.valores[id] ?? null)} link={false} />;

  return moldura(
    <>
      {!c.afs && <Aviso tom="azul">Análises de falha não encontradas: os dados da AF de origem (resumo, causa raiz, criticidade) e o indicador de ações por AF ficam limitados.</Aviso>}
      <Nota>Indicadores: execução e prazo pela <b>data limite</b>, geradas pela <b>data de início</b> · atrasadas, abertas e a fila de prioridade são o retrato de hoje · canceladas não contam · os filtros de área/centro/tipo não se aplicam às AFs.</Nota>

      <Secao titulo="Indicadores" destaque={descrever(ini, fim)} sub={`Variações contra ${descrever(aIni, aFim)} (período anterior de mesma duração).`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpi("acoes_execucao")}{kpi("acoes_no_prazo")}{kpi("acoes_atrasadas")}
          <Tile rotulo="Ações abertas" valor={int(r.acoes_abertas)} detalhe="retrato de hoje" dica="Ações não concluídas e não canceladas (retrato de hoje)." />
          <Tile rotulo="Vencem em 7 dias" valor={int(ex.acoes_vencem_7d)} detalhe="retrato de hoje" dica="Ações abertas com data limite entre hoje e os próximos 7 dias." />
          <Tile rotulo="Dias p/ concluir" valor={ex.acoes_dias_concluir == null ? "—" : `${num(ex.acoes_dias_concluir)} dias`} detalhe="no período"
            dica="Média de dias entre a data de início e a data realizada das ações concluídas no período." />
          <Tile rotulo="Ações por AF" valor={num(porAf)} detalhe="no período"
            dica="Ações iniciadas no período ÷ AFs geradas no período (data da falha). Sem a aba de análises (ou sem AFs geradas no período): ações iniciadas ÷ AFs distintas dessas ações." />
        </div>
      </Secao>

      <Fila acoes={acoes} hoje={hoje} campoEq={campoEq} />
      <Scorecard vivas={vivas} ini={ini} fim={fim} hoje={hoje} params={params} />
      <TiposWcm vivas={vivas} ini={ini} fim={fim} />
      <Evolucao vivas={vivas} ini={ini} fim={fim} hoje={hoje} params={params} />

      <div className="grid gap-4 lg:grid-cols-2">
        <IdadeAbertas abertas={abertas} />
        <SituacaoPeriodo acoes={acoes} ini={ini} fim={fim} />
      </div>

      <Todas acoes={acoes} afs={afs} ini={ini} fim={fim} params={params} campoEq={campoEq} />
    </>,
  );
}

// ----------------------------------------------------------------------------
function Fila({ acoes, hoje, campoEq }: { acoes: af.AcaoAf[]; hoje: Dia; campoEq: CampoEq }) {
  const fila = af.filaDeAcoes(acoes, hoje);
  const nAtr = fila.filter((a) => a.situacao === af.AC_ATRASADA).length;
  const resp = new Set(fila.map((a) => a.responsavel).filter(Boolean)).size;
  return (
    <Secao titulo="Fila de prioridade" sub={`${int(nAtr)} ações atrasadas e ${int(fila.length - nAtr)} que vencem em até 7 dias, de ${int(resp)} responsáveis — as mais atrasadas primeiro.`}>
      {!fila.length ? <Aviso tom="azul">Nenhuma ação atrasada ou vencendo nos próximos 7 dias.</Aviso> : (
        <Tabela cores={COR_ACAO} altura={380} contagem="ações" resumoPor="situacao" arquivo="acoes_af_prioridade"
          busca={{ campos: ["responsavel", "supervisor", "af", "acao", "equipamento"], placeholder: "responsável, AF, ação, equipamento…" }}
          facetas={[{ id: "situacao", rotulo: "Mostrar", ordem: [af.AC_ATRASADA, af.AC_VENCE] }, { id: "responsavel", rotulo: "Responsável" }, { id: "supervisor", rotulo: "Supervisor" }]}
          abrirParam={{ param: "acao", campo: "id", ancora: "acao" }}
          colunas={[{ id: "situacao", rotulo: "Situação", tipo: "situacao", largura: 170 }, { id: "atraso", rotulo: "Dias de atraso", tipo: "barra", corBarra: "st-critico", largura: 140 },
            { id: "vence", rotulo: "Vence em (dias)", tipo: "num", largura: 110 }, { id: "limite", rotulo: "Data limite", tipo: "data" },
            { id: "responsavel", rotulo: "Responsável", largura: 170 }, { id: "supervisor", rotulo: "Supervisor", largura: 170 }, { id: "af", rotulo: "Nº AF", tipo: "codigo", largura: 100 },
            { id: "n", rotulo: "Nº ação", tipo: "codigo", largura: 80 }, { id: "campoOrdenacao", rotulo: "Campo de ordenação", largura: 150 },
            { id: "equipamento", rotulo: "Equipamento", largura: 190 }, { id: "acao", rotulo: "Ação", largura: 320 },
            { id: "crit", rotulo: "Criticidade", largura: 90 }]}
          linhas={fila.map((a) => ({ id: a.id, situacao: a.situacao, atraso: a.diasDeAtraso || null, vence: a.venceEmDias, limite: a.dataLimite,
            responsavel: a.responsavel || SEM_NOME, supervisor: a.supervisor || SEM_NOME, af: a.numeroAf, n: a.numeroAcao, campoOrdenacao: campoEq(a.codigoSap), equipamento: a.equipamento,
            acao: a.acao, crit: a.criticidade }))} />
      )}
    </Secao>
  );
}

// ----------------------------------------------------------------------------
function Scorecard({ vivas, ini, fim, hoje, params }: { vivas: af.AcaoAf[]; ini: Dia; fim: Dia; hoje: Dia; params: Params }) {
  const dim = param(params, "sc") === "supervisor" ? "supervisor" : "responsavel";
  const per = vivas.filter((a) => entre(a.dataLimite, ini, fim));
  const nome = (a: af.AcaoAf) => a[dim] || SEM_NOME;
  const grupos = new Map<string, { per: number; venc: number; noPrazo: number; fora: number; atr: number; abertas: number; atrasos: number[] }>();
  const g = (k: string) => grupos.get(k) ?? grupos.set(k, { per: 0, venc: 0, noPrazo: 0, fora: 0, atr: 0, abertas: 0, atrasos: [] }).get(k)!;
  for (const a of per) {
    const x = g(nome(a));
    x.per++;
    if (a.dataLimite! <= hoje) { x.venc++; if (a.situacao === af.AC_NO_PRAZO) x.noPrazo++; }
    if (a.situacao === af.AC_FORA_PRAZO) x.fora++;
    if ((a.diasDeAtraso ?? 0) > 0) x.atrasos.push(a.diasDeAtraso!);
  }
  for (const a of vivas) {
    if (a.situacao === af.AC_ATRASADA) g(nome(a)).atr++;
    if (af.AC_ABERTAS.includes(a.situacao)) g(nome(a)).abertas++;
  }
  const sc = [...grupos.entries()].filter(([, x]) => x.per > 0 || x.abertas > 0)
    .map(([k, x]) => ({ k, ...x, pct: x.venc ? (x.noPrazo / x.venc) * 100 : null, mediaAtraso: x.atrasos.length ? x.atrasos.reduce((s, d) => s + d, 0) / x.atrasos.length : null }))
    .sort((a, b) => b.atr - a.atr || b.per - a.per);
  const top = [...grupos.entries()].filter(([, x]) => x.atr).sort((a, b) => b[1].atr - a[1].atr).slice(0, 20);
  const maxAtr = Math.max(1, ...sc.map((x) => x.atr));
  return (
    <Secao titulo="Cumprimento por responsável e supervisor"
      sub="Ações com data limite no período; atrasadas e abertas são de hoje. Concluídas no prazo % = realizadas até a data limite ÷ vencidas no período (farol: ≥ 90% verde, ≥ 70% amarelo, abaixo vermelho). Dias médios de atraso = média entre as ações do período que atrasaram."
      acoes={<Opcoes param="sc" atual={dim} params={params} rotulo="Agrupar por" opcoes={[{ valor: "responsavel", rotulo: "Responsável" }, { valor: "supervisor", rotulo: "Supervisor" }]} />}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Quadro titulo="Scorecard" subtitulo={`${int(sc.length)} ${dim === "supervisor" ? "supervisores" : "responsáveis"}`}>
          {!sc.length ? <p className="text-[13px] text-texto-3">Nenhuma ação com data limite no período.</p> : (
            <TabelaSimples minimo={820}
              colunas={[{ rotulo: dim === "supervisor" ? "Supervisor" : "Responsável" }, { rotulo: "Ações no período", direita: true }, { rotulo: "Concluídas no prazo %", direita: true },
                { rotulo: "Fora do prazo", direita: true }, { rotulo: "Atrasadas hoje" }, { rotulo: "Abertas", direita: true }, { rotulo: "Dias médios de atraso", direita: true },
                { rotulo: "Vencidas", direita: true }]}
              linhas={sc.map((x) => ({ celulas: [x.k, int(x.per), pct(x.pct), int(x.fora),
                <span key="a" className="flex items-center gap-2"><span className="h-1.5 w-16 overflow-hidden rounded-full bg-superficie-3"><span className="block h-full rounded-full bg-[var(--st-critico)]" style={{ width: `${(x.atr / maxAtr) * 100}%` }} /></span><span className="num tabular-nums">{int(x.atr)}</span></span>,
                int(x.abertas), num(x.mediaAtraso), int(x.venc)], estilos: [undefined, undefined, fundoPct(x.pct)] }))} />
          )}
        </Quadro>
        <Grafico titulo="Ações atrasadas hoje" subtitulo={`Por ${dim === "supervisor" ? "supervisor" : "responsável"} (20 maiores)`}
          tabela={{ colunas: [dim === "supervisor" ? "Supervisor" : "Responsável", "Atrasadas"], linhas: top.map(([k, x]) => [k, x.atr]) }}>
          {top.length ? <Barras itens={top.map(([k, x]) => ({ rotulo: k, valor: x.atr, cor: "st-critico" as Cor }))} formato="inteiro" larguraRotulo={180} />
            : <p className="text-[13px] text-texto-3">Nenhuma ação atrasada hoje.</p>}
        </Grafico>
      </div>
    </Secao>
  );
}

// ----------------------------------------------------------------------------
function TiposWcm({ vivas, ini, fim }: { vivas: af.AcaoAf[]; ini: Dia; fim: Dia }) {
  const ger = vivas.filter((a) => entre(a.dataInicio, ini, fim));
  const linhas = [...af.TIPOS_ACAO, af.SEM_TIPO].map((t) => {
    const g = ger.filter((a) => (t === af.SEM_TIPO ? !af.tiposDaAcao(a).length : a[af.CAMPO_TIPO_ACAO[t as af.TipoAcao]]));
    const feitas = g.filter((a) => af.AC_CONCLUIDAS.includes(a.situacao)).length;
    return { t, n: g.length, pctAcoes: ger.length ? (g.length / ger.length) * 100 : null, feitas, pctConcl: g.length ? (feitas / g.length) * 100 : null,
      noPrazo: g.filter((a) => a.situacao === af.AC_NO_PRAZO).length, atr: g.filter((a) => a.situacao === af.AC_ATRASADA).length };
  });
  const comAcoes = linhas.filter((l) => l.n);
  return (
    <Secao titulo="Tipos de ação WCM" sub={`${int(ger.length)} ações iniciadas no período. Uma ação pode ter mais de um tipo marcado no gerenciador, então os percentuais somam mais de 100%.`}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Quadro titulo="Ações iniciadas no período por tipo">
          <TabelaSimples minimo={620}
            colunas={[{ rotulo: "Tipo da ação" }, { rotulo: "Ações", direita: true }, { rotulo: "% das ações", direita: true }, { rotulo: "Concluídas", direita: true },
              { rotulo: "% concluída", direita: true }, { rotulo: "No prazo", direita: true }, { rotulo: "Atrasadas hoje", direita: true }]}
            linhas={linhas.map((l) => ({ celulas: [l.t, int(l.n), pct(l.pctAcoes), int(l.feitas), pct(l.pctConcl, 0), int(l.noPrazo), int(l.atr)] }))} />
        </Quadro>
        <Grafico titulo="% concluída por tipo" subtitulo="Ações do tipo já concluídas ÷ ações do tipo iniciadas no período"
          tabela={{ colunas: ["Tipo", "Ações", "% concluída"], linhas: comAcoes.map((l) => [l.t, l.n, pct(l.pctConcl)]) }}>
          {comAcoes.length ? <Barras itens={comAcoes.map((l) => ({ rotulo: l.t, valor: Math.round((l.pctConcl ?? 0) * 10) / 10, detalhe: `${int(l.n)} ações`, cor: "serie-1" as Cor }))} formato="%" max={100} />
            : <p className="text-[13px] text-texto-3">Nenhuma ação iniciada no período.</p>}
        </Grafico>
      </div>
    </Secao>
  );
}

// ----------------------------------------------------------------------------
function Evolucao({ vivas, ini, fim, hoje, params }: { vivas: af.AcaoAf[]; ini: Dia; fim: Dia; hoje: Dia; params: Params }) {
  const gran = param(params, "gran") === "Semana" ? "Semana" : "Mês";
  const jan: [string, Dia, Dia][] = [];
  if (gran === "Semana") for (let s = ini - ((partes(ini).semana + 6) % 7); s <= fim; s += 7) jan.push([dataBr(s).slice(0, 5), Math.max(s, ini), Math.min(s + 6, fim)]);
  else for (let m = inicioDoMes(ini); m <= fim; m = somarMeses(m, 1)) jan.push([mesBr(m), Math.max(m, ini), Math.min(somarMeses(m, 1) - 1, fim)]);
  const lim = jan.map(([, a, b]) => vivas.filter((x) => entre(x.dataLimite, a, b)));
  const ev = { lim: lim.map((l) => l.length), feitas: jan.map(([, a, b]) => vivas.filter((x) => entre(x.dataRealizada, a, b)).length),
    noPrazo: lim.map((l) => l.filter((x) => x.situacao === af.AC_NO_PRAZO).length) };
  const bk = jan.map(([, a, b]) => {
    if (a > hoje) return [null, null];
    const f = Math.min(b, hoje);
    const ab = vivas.filter((x) => x.dataInicio != null && x.dataInicio <= f && (x.dataRealizada == null || x.dataRealizada > f));
    return [ab.length, ab.filter((x) => x.dataLimite != null && x.dataLimite < f).length];
  });
  const rot = jan.map((j) => j[0]);
  return (
    <Secao titulo="Evolução" acoes={<Opcoes param="gran" atual={gran} params={params} rotulo="Granularidade" opcoes={[{ valor: "Mês" }, { valor: "Semana" }]} />}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Grafico titulo="Data limite × realizadas × no prazo"
          subtitulo="Com data limite: vencem na janela · Realizadas: data realizada na janela · No prazo: das que vencem, as realizadas até a data limite"
          legenda={<LegendaCores itens={[["Com data limite", "neutro"], ["Realizadas", "serie-1"], ["No prazo", "serie-3"]]} />}
          tabela={{ colunas: ["Período", "Com data limite", "Realizadas", "No prazo"], linhas: rot.map((r, i) => [r, ev.lim[i], ev.feitas[i], ev.noPrazo[i]]) }}>
          {ev.lim.some(Boolean) || ev.feitas.some(Boolean) ? (
            <Colunas rotulos={rot} formato="inteiro" rotular="nenhum" series={[{ nome: "Com data limite", valores: ev.lim, cor: "neutro" },
              { nome: "Realizadas", valores: ev.feitas, cor: "serie-1" }, { nome: "No prazo", valores: ev.noPrazo, cor: "serie-3" }]} />
          ) : <p className="text-[13px] text-texto-3">Sem ações no período.</p>}
        </Grafico>
        <Grafico titulo="Backlog de ações abertas" subtitulo="No fim de cada janela (a atual é medida hoje) · abertas vencidas = com a data limite já passada"
          legenda={<LegendaCores itens={[["Abertas", "serie-1"], ["Abertas vencidas", "serie-2"]]} />}
          tabela={{ colunas: ["Período", "Abertas", "Abertas vencidas"], linhas: rot.map((r, i) => [r, bk[i][0] ?? "—", bk[i][1] ?? "—"]) }}>
          <Linhas rotulos={rot} formato="inteiro" minimo={0} series={[{ nome: "Abertas", valores: bk.map((x) => x[0]), cor: "serie-1" },
            { nome: "Abertas vencidas", valores: bk.map((x) => x[1]), cor: "serie-2" }]} />
        </Grafico>
      </div>
    </Secao>
  );
}

function IdadeAbertas({ abertas }: { abertas: af.AcaoAf[] }) {
  const faixa = (d: number) => (d <= 7 ? 0 : d <= 30 ? 1 : d <= 90 ? 2 : 3);
  const n = FAIXAS.map((_, i) => abertas.filter((a) => faixa(a.diasDeAtraso ?? 0) === i).length);
  return (
    <Grafico titulo="Idade das ações abertas" subtitulo={`Dias de atraso · ${int(abertas.length)} abertas hoje (0 = ainda no prazo ou sem data limite)`}
      tabela={{ colunas: ["Dias de atraso", "Ações"], linhas: FAIXAS.map((f, i) => [f, n[i]]) }}>
      {abertas.length ? <Barras itens={FAIXAS.map((f, i) => ({ rotulo: `${f} dias`, valor: n[i], cor: COR_FAIXA[i] }))} formato="inteiro" larguraRotulo={110} />
        : <p className="text-[13px] text-texto-3">Nenhuma ação aberta.</p>}
    </Grafico>
  );
}

function SituacaoPeriodo({ acoes, ini, fim }: { acoes: af.AcaoAf[]; ini: Dia; fim: Dia }) {
  const per = acoes.filter((a) => entre(a.dataLimite, ini, fim));
  const sit = af.SITUACOES_ACAO.map((s) => ({ s, n: per.filter((a) => a.situacao === s).length })).filter((x) => x.n);
  return (
    <Grafico titulo="Situação das ações com data limite no período" subtitulo={`${int(per.length)} ações`}
      tabela={{ colunas: ["Situação", "Ações", "%"], linhas: sit.map((x) => [x.s, x.n, pct((x.n / per.length) * 100)]) }}>
      {sit.length ? <Barras itens={sit.map((x) => ({ rotulo: x.s, valor: x.n, cor: COR_ACAO[x.s], detalhe: pct((x.n / per.length) * 100) }))} formato="inteiro" larguraRotulo={180} />
        : <p className="text-[13px] text-texto-3">Nenhuma ação com data limite no período.</p>}
    </Grafico>
  );
}

// ----------------------------------------------------------------------------
const LISTAS = [{ valor: "periodo", rotulo: "Só no período" }, { valor: "todas", rotulo: "Todas as datas" }];

const COLS: Coluna[] = [
  { id: "id", rotulo: "ID", tipo: "codigo", largura: 110 }, { id: "situacao", rotulo: "Situação", tipo: "situacao", largura: 180 },
  { id: "af", rotulo: "Nº AF", tipo: "codigo", largura: 100 }, { id: "n", rotulo: "Nº ação", tipo: "codigo", largura: 80 }, { id: "acao", rotulo: "Ação", largura: 320 },
  { id: "tipo", rotulo: "Tipo da ação", largura: 170 }, { id: "responsavel", rotulo: "Responsável", largura: 170 }, { id: "supervisor", rotulo: "Supervisor", largura: 170 },
  { id: "ini", rotulo: "Data de início", tipo: "data", largura: 110 }, { id: "limite", rotulo: "Data limite", tipo: "data" }, { id: "feita", rotulo: "Data realizada", tipo: "data", largura: 110 },
  { id: "atraso", rotulo: "Dias de atraso", tipo: "num", largura: 100 }, { id: "concluir", rotulo: "Dias para concluir", tipo: "num", largura: 110 },
  { id: "campoOrdenacao", rotulo: "Campo de ordenação", largura: 150 }, { id: "equipamento", rotulo: "Equipamento", largura: 190 }, { id: "sap", rotulo: "Código SAP", tipo: "codigo" }, { id: "area", rotulo: "Área", largura: 120 },
  { id: "especialidade", rotulo: "Especialidade", largura: 130 }, { id: "crit", rotulo: "Criticidade", largura: 90 }, { id: "pilar", rotulo: "Pilar", largura: 70 },
  { id: "status", rotulo: "Status", largura: 70 }, { id: "os", rotulo: "OS de correção", tipo: "codigo", largura: 120 }, { id: "link", rotulo: "Link", tipo: "link", largura: 70 },
  { id: "obs", rotulo: "Observações", largura: 240 },
];

function Todas({ acoes, afs, ini, fim, params, campoEq }: { acoes: af.AcaoAf[]; afs: af.Af[]; ini: Dia; fim: Dia; params: Params; campoEq: CampoEq }) {
  const base = (["limite", "inicio", "realizada"].includes(param(params, "base")) ? param(params, "base") : "limite") as keyof typeof CAMPO_BASE;
  const campo = CAMPO_BASE[base];
  const ord = [...acoes].sort((a, b) => (b.dataLimite ?? -Infinity) - (a.dataLimite ?? -Infinity) || a.numeroAf.localeCompare(b.numeroAf, "pt-BR", { numeric: true })
    || a.numeroAcao.localeCompare(b.numeroAcao, "pt-BR", { numeric: true }));
  const selId = param(params, "acao");
  const sel = selId ? acoes.find((a) => a.id === selId) : undefined;
  const orig = sel ? afs.find((a) => a.numero === sel.numeroAf) : undefined;
  const outras = sel ? af.acoesDaAf(acoes, sel.numeroAf) : [];
  // "Só no período" decidido no servidor: o navegador recebe só as ações que vai mostrar (as 6 mil de uma vez pesam)
  const lista = param(params, "lista") === "todas" ? "todas" : "periodo";
  const visiveis = lista === "todas" ? ord : ord.filter((a) => { const d = a[campo]; return d != null && d >= ini && d <= fim; });
  return (
    <>
      <Secao titulo="Todas as ações" sub="Clique numa ação para ver a ação completa e a análise de falha de origem. Para ver as ações de uma AF de qualquer data, escolha “Todas as datas” e filtre pelo “Nº AF”."
        acoes={<div className="flex flex-wrap items-center gap-3">
          <Opcoes param="lista" rotulo="Mostrar" opcoes={LISTAS} atual={lista} params={params} />
          <Opcoes param="base" rotulo="Data de referência" opcoes={BASES} atual={base} params={params} />
        </div>}>
        <Tabela colunas={COLS} cores={COR_ACAO} contagem="ações" resumoPor="situacao" arquivo="acoes_af" altura={500}
          busca={{ campos: ["id", "acao", "equipamento", "sap", "responsavel", "supervisor", "obs"], placeholder: "ação, AF, equipamento, responsável…" }}
          facetas={[{ id: "situacao", rotulo: "Situação", ordem: [...af.SITUACOES_ACAO] }, { id: "responsavel", rotulo: "Responsável" }, { id: "supervisor", rotulo: "Supervisor" },
            { id: "area", rotulo: "Área" }, { id: "tipoF", rotulo: "Tipo da ação", lista: true, ordem: [...af.TIPOS_ACAO, af.SEM_TIPO] }, { id: "af", rotulo: "Nº AF" }]}
          abrirParam={{ param: "acao", campo: "id", ancora: "acao" }}
          linhas={visiveis.map((a) => {
            return { id: a.id, situacao: a.situacao, af: a.numeroAf, n: a.numeroAcao, acao: a.acao, tipo: a.tipoDaAcao, tipoF: a.tipoDaAcao || af.SEM_TIPO,
              responsavel: a.responsavel, supervisor: a.supervisor, ini: a.dataInicio, limite: a.dataLimite, feita: a.dataRealizada, atraso: a.diasDeAtraso,
              concluir: a.diasParaConcluir, campoOrdenacao: campoEq(a.codigoSap), equipamento: a.equipamento, sap: a.codigoSap, area: a.area, especialidade: a.especialidade, crit: a.criticidade,
              pilar: a.pilar, status: a.status, os: a.osCorrecao, link: a.link, obs: a.observacoes };
          })} />
      </Secao>
      {sel && (
        <div id="acao" className="scroll-mt-28 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Quadro titulo={`Ação ${sel.id}`} subtitulo={sel.acao}
              acoes={/^https?:\/\//i.test(sel.link) ? <a href={sel.link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[13px] text-texto-2 hover:text-texto">Abrir evidência <ExternalLink className="size-3.5" /></a> : undefined}>
              <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px]">
                <PontoSituacao nome={sel.situacao} cor={COR_ACAO[sel.situacao]} />
                {(sel.diasDeAtraso ?? 0) > 0 && <span className="text-texto-2">{int(sel.diasDeAtraso)} dias de atraso</span>}
              </div>
              <Campos itens={[["Tipo da ação", sel.tipoDaAcao], ["Responsável", sel.responsavel], ["Supervisor", sel.supervisor], ["Data de início", dataBr(sel.dataInicio)],
                ["Data limite", dataBr(sel.dataLimite)], ["Data realizada", dataBr(sel.dataRealizada)], ["Campo de ordenação", campoEq(sel.codigoSap) || "—"], ["Equipamento", [sel.codigoSap, sel.equipamento].filter(Boolean).join(" · ")],
                ["Área", sel.area || sel.areaFalha], ["Especialidade", sel.especialidade], ["OS de correção", sel.osCorrecao], ["Status no gerenciador", sel.status],
                ["Observações", sel.observacoes], ...(sel.link && !/^https?:\/\//i.test(sel.link) ? [["Link", sel.link] as [string, string]] : [])]} />
            </Quadro>
            <Quadro titulo={`Análise de falha de origem · AF ${sel.numeroAf}`}
              acoes={
                <div className="flex flex-wrap items-center gap-3 text-[13px]">
                  <Link prefetch={false} href={`/af_planos?af=${encodeURIComponent(sel.numeroAf)}#af`} className="inline-flex items-center gap-1 text-texto-2 hover:text-texto">Abrir em Planos de AF <ArrowRight className="size-3.5" /></Link>
                  {sel.codigoSap && <Link prefetch={false} href={`/equipamentos?eq=${encodeURIComponent(sel.codigoSap)}`} className="inline-flex items-center gap-1 text-texto-2 hover:text-texto">Ficha do equipamento <ArrowRight className="size-3.5" /></Link>}
                </div>
              }>
              {orig ? (
                <>
                  <div className="mb-4 text-[13px]"><PontoSituacao nome={orig.situacao} cor={COR_AF[orig.situacao]} /></div>
                  <Campos itens={[["Resumo", orig.resumo], ["Causa raiz", orig.causaRaiz], ["Criticidade", orig.criticidade], ["Pilar", af.PILARES[orig.pilar] ?? orig.pilar],
                    ["Campo de ordenação", campoEq(orig.codigoSap) || "—"], ["Equipamento", [orig.codigoSap, orig.equipamento].filter(Boolean).join(" · ")], ["Data da falha", dataBr(orig.dataFalha)],
                    ["Data limite da análise", dataBr(orig.dataLimite)], ["Supervisor", orig.supervisor]]} />
                  {/^https?:\/\//i.test(orig.link) && <a href={orig.link} target="_blank" rel="noreferrer noopener" className="mt-4 inline-flex items-center gap-1 text-[13px] text-texto-2 hover:text-texto">Abrir análise (documento) <ExternalLink className="size-3.5" /></a>}
                </>
              ) : (
                <p className="text-[13px] text-texto-3">Esta AF não está na aba de análises de falha do gerenciador.{sel.causaRaizAf ? ` Causa raiz: ${sel.causaRaizAf}` : ""}</p>
              )}
            </Quadro>
          </div>
          <Quadro titulo={`Todas as ações da AF ${sel.numeroAf}`} subtitulo={`${int(outras.length)} ação(ões)`}>
            <Tabela cores={COR_ACAO} altura={300} contagem="ações"
              colunas={[{ id: "n", rotulo: "Nº ação", tipo: "codigo", largura: 80 }, { id: "situacao", rotulo: "Situação", tipo: "situacao", largura: 180 },
                { id: "acao", rotulo: "Ação", largura: 320 }, { id: "tipo", rotulo: "Tipo da ação", largura: 170 }, { id: "resp", rotulo: "Responsável", largura: 170 },
                { id: "limite", rotulo: "Data limite", tipo: "data" }, { id: "feita", rotulo: "Data realizada", tipo: "data", largura: 110 },
                { id: "atraso", rotulo: "Dias de atraso", tipo: "num", largura: 100 }]}
              linhas={outras.map((a) => ({ n: a.numeroAcao, situacao: a.situacao, acao: a.acao, tipo: a.tipoDaAcao, resp: a.responsavel, limite: a.dataLimite,
                feita: a.dataRealizada, atraso: a.diasDeAtraso }))} />
          </Quadro>
        </div>
      )}
    </>
  );
}
