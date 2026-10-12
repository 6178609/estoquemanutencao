import { ArrowRight, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Barras, Colunas, Grafico, Linhas, type Cor } from "@/components/graficos";
import { GradeKpis } from "@/components/Indicador";
import { Aviso, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import * as af from "@/lib/wcm/af";
import { barra, contexto } from "@/lib/wcm/contexto";
import { descrever } from "@/lib/wcm/filtros";
import * as ind from "@/lib/wcm/indicadores";
import { dataBr, inicioDoMes, mesBr, partes, somarMeses, type Dia } from "@/lib/wcm/util";

import { Campos, fundoPct, GradeTiles, LegendaCores, Nota, Opcoes, Quadro, TabelaSimples, Tile } from "../execucao/_ui/Blocos";
import { COR_ACAO, COR_AF } from "../execucao/_ui/cores";
import { int, num, pct } from "../execucao/_ui/fmt";
import { param } from "../execucao/_ui/memo";
import { PontoSituacao, Tabela, type Coluna } from "../execucao/_ui/Tabela";

export const metadata: Metadata = { title: "Planos de AF" };
export const dynamic = "force-dynamic";

const NAO_INF = "(não informado)";
const PAG = "/af_planos";
/** KPIs de AF que o motor de indicadores não tem (mesma definição de paginas/af_planos.py). */
const EXTRA: Record<string, ind.Kpi> = {
  af_geradas: { id: "af_geradas", nome: "AFs geradas", unidade: "un", sentido: -1, meta: null, grupo: ind.ANALISE_FALHA, pagina: PAG,
    formula: "AFs com data da falha no período (canceladas não contam).", mensal: true },
  dias_para_analise: { id: "dias_para_analise", nome: "Dias médios p/ análise", unidade: "dias", sentido: -1, meta: null, grupo: ind.ANALISE_FALHA,
    pagina: PAG, formula: "Média de dias entre a data da falha e a data da análise das AFs geradas no período e já analisadas.", mensal: true },
};
const KS = ["taxa_quebra_a", "af_execucao", "af_no_prazo", "af_geradas", "af_atrasadas", "dias_para_analise"].map((id) => ind.POR_ID[id] ?? EXTRA[id]);
const BASES = [{ valor: "falha", rotulo: "Data da falha" }, { valor: "limite", rotulo: "Data limite" }, { valor: "analise", rotulo: "Data da análise" }];
const CAMPO_BASE = { falha: "dataFalha", limite: "dataLimite", analise: "dataAnalise" } as const;
const DIST = ["Situação e criticidade", "Área e pilar", "Causa raiz (Pareto)", "Especialidade e turno", "Supervisores", "Equipamentos"];
const COR_GRUPO: Record<string, Cor> = { [af.G_NO_PRAZO]: "st-bom", [af.G_FORA]: "st-atencao", [af.G_ABERTO]: "serie-1", [af.G_ATRASADA]: "st-critico" };

type Params = Record<string, string | string[] | undefined>;
type AfG = af.Af & { grupo: string };

export default async function PlanosAf(props: { searchParams: Promise<Params> }) {
  await exigir("af_planos");
  const params = await props.searchParams;
  const c = await contexto(params);
  const cab = <Cabecalho titulo="Planos de AF," destaque="a análise de cada falha."
    sobre="Gerenciador de AF"
    subtitulo="Gestão das análises de falha (AF) a partir do Gerenciador de AF mantido pelo PCM: prazos, execução, causas raiz e ações, no formato do resumo corporativo WCM." />;
  const moldura = (x: React.ReactNode) => <PaginaWcm barra={barra(c)} dimensoes={false}>{cab}{x}</PaginaWcm>;
  if (!c.afs) return moldura(<SemDados base="Gerenciador de AF (análises de falha)" />);
  if (!c.afs.length) return moldura(<Aviso>O Gerenciador de AF foi encontrado, mas não tem nenhuma análise de falha preenchida.</Aviso>);

  const afs = c.afs, acoes = c.acoesAf ?? [], notas = c.b.notas.dados, hoje = c.b.hoje;
  const { ini, fim } = c.f;
  const [aIni, aFim] = ind.periodoAnterior(ini, fim);
  const atual = af.indicadores(afs, acoes, ini, fim, hoje, notas) as unknown as ind.Resultado;
  const anterior = af.indicadores(afs, acoes, aIni, aFim, hoje, notas) as unknown as ind.Resultado;
  const serie = af.mensal(afs, acoes, ini, fim, hoje, notas);
  const serieK = serie.map(({ mes, ...v }) => ({ mes, valores: v as unknown as ind.Resultado }));
  const vivas = afs.filter((a) => a.situacao !== af.AF_CANCELADA);
  const gerP: AfG[] = vivas.filter((a) => a.dataFalha != null && a.dataFalha >= ini && a.dataFalha <= fim)
    .map((a) => ({ ...a, grupo: af.GRUPO_DA_SITUACAO_AF[a.situacao] ?? af.G_ABERTO }));
  const risco = af.afsEmRisco(vivas, hoje);
  const nAtr = risco.filter((a) => a.situacao === af.AF_ATRASADA).length;

  return moldura(
    <>
      <Nota>Indicadores: geradas e taxa de quebra A pela <b>data da falha</b>; execução e prazo pela <b>data limite</b>. Os filtros de área, centro e tipo de ordem não valem aqui: as áreas do gerenciador são as de produção.</Nota>

      {risco.length > 0 && (
        <Quadro titulo={`${int(risco.length)} AF(s) atrasada(s) ou em risco hoje`}
          subtitulo={`${int(nAtr)} com o prazo vencido e ${int(risco.length - nAtr)} vencendo (risco de atraso ou data limite em até 3 dias). Cobre a análise com o supervisor responsável.`}>
          <Tabela cores={COR_AF} altura={300} contagem="AFs" resumoPor="situacao" arquivo="afs_em_risco"
            abrirParam={{ param: "af", campo: "numero", ancora: "af" }}
            colunas={[{ id: "numero", rotulo: "Nº AF", tipo: "codigo", largura: 100 }, { id: "situacao", rotulo: "Situação", tipo: "situacao", largura: 160 },
              { id: "atraso", rotulo: "Dias de atraso", tipo: "barra", corBarra: "st-critico", largura: 130 }, { id: "limite", rotulo: "Data limite", tipo: "data" },
              { id: "crit", rotulo: "Criticidade", largura: 90 }, { id: "equipamento", rotulo: "Equipamento", largura: 200 }, { id: "resumo", rotulo: "Resumo", largura: 300 },
              { id: "supervisor", rotulo: "Supervisor", largura: 170 }, { id: "area", rotulo: "Área", largura: 120 }, { id: "link", rotulo: "Link", tipo: "link", largura: 70 }]}
            linhas={risco.map((a) => ({ numero: a.numero, situacao: a.situacao, atraso: a.diasDeAtraso, limite: a.dataLimite, crit: a.criticidade,
              equipamento: a.equipamento, resumo: a.resumo, supervisor: a.supervisor, area: a.area, link: a.link }))} />
        </Quadro>
      )}

      <Secao titulo="Indicadores" destaque={descrever(ini, fim)} sub={`Variações contra ${descrever(aIni, aFim)} (período anterior de mesma duração). Passe o mouse no nome para ver a fórmula.`}>
        <GradeKpis kpis={KS} atual={atual} anterior={anterior} metas={c.cad.metas} serie={serieK} link={false} colunas={3} />
        <GradeTiles>
          <Tile rotulo="AFs A geradas" valor={int(atual.af_geradas_a)} dica="AFs de criticidade A com data da falha no período." />
          <Tile rotulo="AFs em aberto" valor={int(atual.af_abertas)} detalhe="retrato de hoje" dica="Em andamento, risco de atraso e atrasadas (retrato de hoje, qualquer data)." />
          <Tile rotulo="Execução de ações" valor={pct(atual.acoes_execucao)} dica="Ações com data limite no período (até hoje) realizadas ÷ ações com data limite no período." />
          <Tile rotulo="Ações por AF" valor={num(atual.acoes_por_af)} dica="Ações criadas no período (data de início) ÷ AFs geradas no período." />
        </GradeTiles>
      </Secao>

      <Semanal afs={afs} acoes={acoes} ini={ini} fim={fim} hoje={hoje} params={params} />

      <Secao titulo="Evolução mensal" destaque="pela data da falha">
        <Mensal gerP={gerP} serie={serie} />
      </Secao>

      <Secao titulo="Onde e por que falha" sub={`${int(gerP.length)} AFs geradas no período (data da falha; canceladas não contam).`}>
        <Opcoes param="dist" opcoes={DIST.map((d) => ({ valor: d }))} atual={DIST.includes(param(params, "dist")) ? param(params, "dist") : DIST[0]} params={params} />
        <Distribuicao dist={DIST.includes(param(params, "dist")) ? param(params, "dist") : DIST[0]} gerP={gerP} afs={afs} ini={ini} fim={fim} />
      </Secao>

      <Secao titulo="Referência IW28" destaque="quebras A × AFs A">
        <ReferenciaIw28 notas={notas} gerP={gerP} ini={ini} fim={fim} />
      </Secao>

      <TabelaAfs afs={afs} acoes={acoes} ini={ini} fim={fim} params={params} />
    </>,
  );
}

// ----------------------------------------------------------------------------
// Acompanhamento semanal (RESUMO CORPORATIVO)
// ----------------------------------------------------------------------------
function Semanal({ afs, acoes, ini, fim, hoje, params }: { afs: af.Af[]; acoes: af.AcaoAf[]; ini: Dia; fim: Dia; hoje: Dia; params: Params }) {
  const janela = ["8", "13", "todo"].includes(param(params, "semanas")) ? param(params, "semanas") : "13";
  const sem = af.semanal(afs, acoes, ini, fim, hoje).filter((l) => !l.futura);
  let semanas = [...new Set(sem.map((l) => l.semana))].sort((a, b) => a - b);
  if (janela !== "todo") semanas = semanas.slice(-Number(janela));
  const variosAnos = new Set(semanas.map((s) => partes(s).ano)).size > 1;
  const nSem = (s: Dia) => { // semana ISO
    const p = partes(s), qui = s + 3 - ((p.semana + 6) % 7), a = partes(qui).ano;
    const j1 = Date.UTC(a, 0, 1) / 86_400_000;
    return Math.floor((qui - j1) / 7) + 1;
  };
  const rot = (s: Dia) => `S${String(nSem(s)).padStart(2, "0")} · ${dataBr(s).slice(0, variosAnos ? 10 : 5)}`;
  const linhas: { celulas: React.ReactNode[]; estilos?: (React.CSSProperties | undefined)[] }[] = [];
  for (const indicador of af.INDICADORES_SEMANAIS) {
    const sub = new Map(sem.filter((l) => l.indicador === indicador).map((l) => [l.semana, l]));
    const ger = semanas.reduce((s, w) => s + (sub.get(w)?.gerado ?? 0), 0), exe = semanas.reduce((s, w) => s + (sub.get(w)?.executado ?? 0), 0);
    const tot = ger ? (exe / ger) * 100 : null;
    linhas.push({ celulas: [<b key="i" className="font-medium">{indicador}</b>, "Gerado", ...semanas.map((w) => int(sub.get(w)?.gerado ?? 0)), int(ger)] });
    linhas.push({ celulas: ["", "Executado", ...semanas.map((w) => int(sub.get(w)?.executado ?? 0)), int(exe)] });
    linhas.push({ celulas: ["", "%", ...semanas.map((w) => pct(sub.get(w)?.percentual)), pct(tot)],
      estilos: [undefined, undefined, ...semanas.map((w) => fundoPct(sub.get(w)?.percentual)), fundoPct(tot)] });
  }
  const series = af.INDICADORES_SEMANAIS.map((indicador, i) => ({ nome: indicador, cor: (["serie-1", "serie-2", "serie-3"] as Cor[])[i],
    valores: semanas.map((w) => { const p = sem.find((l) => l.indicador === indicador && l.semana === w)?.percentual; return p == null ? null : Math.round(p * 10) / 10; }) }));
  return (
    <Secao titulo="Acompanhamento semanal" destaque="resumo corporativo"
      sub="Gerado × executado por semana (segunda a domingo). Taxa de análise de quebra crítica (A): AFs A pela data da falha. Execução de AFs e ações de AFs: pela data limite. Cor do %: verde ≥ 90%, amarelo ≥ 70%, vermelho abaixo."
      acoes={<Opcoes param="semanas" atual={janela} params={params} opcoes={[{ valor: "8", rotulo: "Últimas 8" }, { valor: "13", rotulo: "Últimas 13" }, { valor: "todo", rotulo: "Período todo" }]} />}>
      {!semanas.length ? <p className="text-[14px] text-texto-3">Sem semanas concluídas no período.</p> : (
        <>
          <TabelaSimples minimo={360 + semanas.length * 92}
            colunas={[{ rotulo: "Indicador" }, { rotulo: "Linha" }, ...semanas.map((w) => ({ rotulo: rot(w), direita: true })), { rotulo: "Total", direita: true }]}
            linhas={linhas} />
          <Grafico titulo="Percentual por semana" subtitulo="Executado ÷ gerado · linha verde = meta de 100%"
            legenda={<LegendaCores itens={series.map((s) => [s.nome, s.cor])} />}
            tabela={{ colunas: ["Semana", ...series.map((s) => s.nome)], linhas: semanas.map((w, i) => [rot(w), ...series.map((s) => pct(s.valores[i]))]) }}>
            <Linhas rotulos={semanas.map(rot)} series={series} meta={100} formato="%" minimo={0} />
          </Grafico>
        </>
      )}
    </Secao>
  );
}

// ----------------------------------------------------------------------------
// Evolução mensal
// ----------------------------------------------------------------------------
function Mensal({ gerP, serie }: { gerP: AfG[]; serie: ({ mes: Dia } & af.IndicadoresAf)[] }) {
  if (!gerP.length) return <p className="text-[14px] text-texto-3">Nenhuma AF com data da falha no período.</p>;
  const meses = serie.map((s) => s.mes);
  const rot = meses.map(mesBr);
  const series = af.GRUPOS_AF.map((g) => ({ nome: g, cor: COR_GRUPO[g], valores: meses.map((m) => gerP.filter((a) => a.grupo === g && inicioDoMes(a.dataFalha!) === m).length) }));
  const taxa = serie.map((s) => (s.taxa_quebra_a == null ? null : Math.round(s.taxa_quebra_a * 10) / 10));
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Grafico titulo="AFs geradas por mês" subtitulo="Pelo resultado da análise" legenda={<LegendaCores itens={series.map((s) => [s.nome, s.cor!])} />}
        dica="AFs geradas no mês (data da falha), separadas em analisadas no prazo, fora do prazo, em aberto e atrasadas."
        tabela={{ colunas: ["Mês", ...af.GRUPOS_AF], linhas: rot.map((r, i) => [r, ...series.map((s) => s.valores[i])]) }}>
        <Colunas rotulos={rot} series={series} empilhar formato="inteiro" rotular="todos" />
      </Grafico>
      <Grafico titulo="Taxa de análise de quebra A" subtitulo="AFs A do mês já analisadas ÷ AFs A do mês · tabela com todos os indicadores mês a mês"
        dica={ind.POR_ID.taxa_quebra_a.formula}
        tabela={{ colunas: ["Mês", "AFs geradas", "AFs A", "Taxa de quebra A", "Execução de AFs", "AFs no prazo", "Dias p/ análise", "Execução de ações", "Ações no prazo"],
          linhas: serie.map((s, i) => [rot[i], int(s.af_geradas), int(s.af_geradas_a), pct(s.taxa_quebra_a), pct(s.af_execucao), pct(s.af_no_prazo),
            num(s.dias_para_analise), pct(s.acoes_execucao), pct(s.acoes_no_prazo)]) }}>
        <Linhas rotulos={rot} series={[{ nome: "Taxa de quebra A", valores: taxa, cor: "serie-1" }]} meta={100} formato="%" minimo={0} />
      </Grafico>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Distribuições
// ----------------------------------------------------------------------------
function barrasGrupo(gerP: AfG[], campo: (a: af.Af) => string, top = 15) {
  const m = new Map<string, Map<string, number>>();
  for (const a of gerP) {
    const k = campo(a) || NAO_INF;
    const g = m.get(k) ?? m.set(k, new Map()).get(k)!;
    g.set(a.grupo, (g.get(a.grupo) ?? 0) + 1);
  }
  const itens = [...m.entries()].map(([k, g]) => ({ rotulo: k, valor: [...g.values()].reduce((s, v) => s + v, 0),
    partes: af.GRUPOS_AF.map((gr) => ({ nome: gr, valor: g.get(gr) ?? 0, cor: COR_GRUPO[gr] })).filter((p) => p.valor) }))
    .sort((a, b) => b.valor - a.valor).slice(0, top);
  return itens;
}

function GraficoGrupo({ titulo, subtitulo, dica, gerP, campo }: { titulo: string; subtitulo?: string; dica?: string; gerP: AfG[]; campo: (a: af.Af) => string }) {
  const itens = barrasGrupo(gerP, campo);
  return (
    <Grafico titulo={titulo} subtitulo={subtitulo} dica={dica} legenda={<LegendaCores itens={af.GRUPOS_AF.map((g) => [g, COR_GRUPO[g]])} />}
      tabela={{ colunas: [titulo, "AFs", ...af.GRUPOS_AF], linhas: itens.map((i) => [i.rotulo, i.valor, ...af.GRUPOS_AF.map((g) => i.partes.find((p) => p.nome === g)?.valor ?? 0)]) }}>
      {itens.length ? <Barras itens={itens} formato="inteiro" larguraRotulo={200} /> : <p className="text-[13px] text-texto-3">Sem AFs no período.</p>}
    </Grafico>
  );
}

function Distribuicao({ dist, gerP, afs, ini, fim }: { dist: string; gerP: AfG[]; afs: af.Af[]; ini: Dia; fim: Dia }) {
  if (dist === "Situação e criticidade") {
    const todas = afs.filter((a) => a.dataFalha != null && a.dataFalha >= ini && a.dataFalha <= fim);
    const sit = af.SITUACOES_AF.map((s) => ({ s, n: todas.filter((a) => a.situacao === s).length })).filter((x) => x.n);
    const tot = sit.reduce((s, x) => s + x.n, 0);
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Grafico titulo="Por situação" subtitulo="Inclui canceladas" tabela={{ colunas: ["Situação", "AFs", "%"], linhas: sit.map((x) => [x.s, x.n, pct((x.n / tot) * 100, 0)]) }}>
          {sit.length ? <Barras itens={sit.map((x) => ({ rotulo: x.s, valor: x.n, cor: COR_AF[x.s], detalhe: pct((x.n / tot) * 100, 0) }))} formato="inteiro" larguraRotulo={190} />
            : <p className="text-[13px] text-texto-3">Sem AFs no período.</p>}
        </Grafico>
        <GraficoGrupo titulo="Por criticidade do equipamento" dica="A = crítico (toda quebra A gera AF e entra na taxa de análise de quebra crítica)."
          gerP={gerP} campo={(a) => (a.criticidade === "A" ? "A · crítico" : a.criticidade)} />
      </div>
    );
  }
  if (dist === "Área e pilar") {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <GraficoGrupo titulo="Por área" subtitulo="15 maiores" gerP={gerP} campo={(a) => a.area} />
        <GraficoGrupo titulo="Por pilar WCM da causa" dica="Pilar responsável por eliminar a causa raiz da falha." gerP={gerP}
          campo={(a) => (af.PILARES[a.pilar] ? `${a.pilar} · ${af.PILARES[a.pilar]}` : a.pilar)} />
      </div>
    );
  }
  if (dist === "Causa raiz (Pareto)") {
    const cr = gerP.filter((a) => a.causaRaiz);
    if (!cr.length) return <p className="text-[14px] text-texto-3">Nenhuma AF com causa raiz preenchida no período.</p>;
    const m = new Map<string, number>();
    for (const a of cr) m.set(a.causaRaiz, (m.get(a.causaRaiz) ?? 0) + 1);
    const par = [...m.entries()].sort((a, b) => b[1] - a[1]);
    let acc = 0;
    const comAcum = par.map(([causa, n]) => { acc += n; return { causa, n, acum: (acc / cr.length) * 100 }; });
    const n80 = comAcum.filter((x) => x.acum < 80).length + 1;
    const sem = gerP.length - cr.length;
    return (
      <Grafico titulo="Pareto das causas raiz" subtitulo="As poucas causas que concentram a maior parte das falhas (80/20) · 20 maiores"
        legenda={<LegendaCores itens={[["Concentram 80% das AFs", "serie-2"], ["Demais causas", "neutro"]]} />}
        tabela={{ colunas: ["Causa raiz", "AFs", "% acumulado"], linhas: comAcum.map((x) => [x.causa, x.n, pct(x.acum)]) }}>
        <Barras formato="inteiro" larguraRotulo={240} itens={comAcum.slice(0, 20).map((x, i) => ({ rotulo: x.causa, valor: x.n,
          detalhe: `${pct(x.acum)} acumulado`, cor: (i < n80 ? "serie-2" : "neutro") as Cor }))} />
        <p className="mt-3 text-[12.5px] text-texto-3"><b className="font-medium text-texto-2">{int(n80)}</b> causa(s) concentram 80% das {int(cr.length)} AFs com causa raiz informada{sem ? ` · ${int(sem)} AF(s) do período sem causa raiz preenchida.` : "."}</p>
      </Grafico>
    );
  }
  if (dist === "Especialidade e turno") {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <GraficoGrupo titulo="Por especialidade" gerP={gerP} campo={(a) => a.especialidade} />
        <GraficoGrupo titulo="Por turno" gerP={gerP} campo={(a) => a.turno} />
      </div>
    );
  }
  if (dist === "Supervisores") {
    if (!gerP.length) return <p className="text-[14px] text-texto-3">Sem AFs no período.</p>;
    const m = new Map<string, AfG[]>();
    for (const a of gerP) { const k = a.supervisor || NAO_INF; (m.get(k) ?? m.set(k, []).get(k)!).push(a); }
    const sc = [...m.entries()].map(([sup, xs]) => {
      const n = (s: string) => xs.filter((a) => a.situacao === s).length;
      const dec = n(af.AF_NO_PRAZO) + n(af.AF_FORA_PRAZO) + n(af.AF_ATRASADA);
      const dias = xs.map((a) => a.diasParaAnalise).filter((d): d is number => d != null && d >= 0);
      return { sup, ger: xs.length, a: xs.filter((x) => x.criticidade === "A").length, noPrazo: n(af.AF_NO_PRAZO), fora: n(af.AF_FORA_PRAZO),
        atr: n(af.AF_ATRASADA), aberto: n(af.AF_RISCO) + n(af.AF_ANDAMENTO), pct: dec ? (n(af.AF_NO_PRAZO) / dec) * 100 : null,
        dias: dias.length ? dias.reduce((s, d) => s + d, 0) / dias.length : null };
    }).sort((x, y) => y.ger - x.ger);
    return (
      <Quadro titulo="Scorecard dos supervisores" subtitulo="AFs geradas no período · % no prazo = analisadas no prazo ÷ AFs já decididas (analisadas ou atrasadas); as que ainda estão dentro do prazo não contam">
        <TabelaSimples minimo={820}
          colunas={[{ rotulo: "Supervisor" }, { rotulo: "Geradas", direita: true }, { rotulo: "A", direita: true }, { rotulo: "% no prazo", direita: true },
            { rotulo: "No prazo", direita: true }, { rotulo: "Fora do prazo", direita: true }, { rotulo: "Atrasadas", direita: true }, { rotulo: "Em aberto", direita: true },
            { rotulo: "Dias médios", direita: true, dica: "Data da falha até a data da análise" }]}
          linhas={sc.map((x) => ({ celulas: [x.sup, int(x.ger), int(x.a), pct(x.pct), int(x.noPrazo), int(x.fora),
            x.atr ? <span className="inline-flex items-center gap-1"><PontoSituacao nome={int(x.atr)} cor="st-critico" /></span> : "0", int(x.aberto), num(x.dias)],
            estilos: [undefined, undefined, undefined, fundoPct(x.pct)] }))} />
      </Quadro>
    );
  }
  // Equipamentos
  if (!gerP.length) return <p className="text-[14px] text-texto-3">Sem AFs no período.</p>;
  const m = new Map<string, AfG[]>();
  for (const a of gerP) { const k = a.codigoSap || a.equipamento; if (k) (m.get(k) ?? m.set(k, []).get(k)!).push(a); }
  const top = [...m.entries()].map(([, xs]) => {
    const causas = new Map<string, number>();
    for (const a of xs) if (a.causaRaiz) causas.set(a.causaRaiz, (causas.get(a.causaRaiz) ?? 0) + 1);
    return { cod: xs[0].codigoSap, eq: xs.find((a) => a.equipamento)?.equipamento ?? "", area: xs.find((a) => a.area)?.area ?? "", n: xs.length,
      a: xs.filter((x) => x.criticidade === "A").length, aberto: xs.filter((x) => af.AF_ABERTAS.includes(x.situacao)).length,
      parada: xs.reduce((s, x) => s + (Number.isNaN(x.duracaoParada) ? 0 : x.duracaoParada), 0),
      causa: [...causas.entries()].sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0]))[0]?.[0] ?? "",
      ultima: Math.max(...xs.map((x) => x.dataFalha ?? -Infinity)) };
  }).sort((x, y) => y.n - x.n || y.parada - x.parada).slice(0, 30);
  return (
    <Quadro titulo="Equipamentos com mais AFs no período" subtitulo="Candidatos a revisão de plano de manutenção, melhoria (fragilidade de projeto) e expansão horizontal das ações · o código abre a ficha do equipamento">
      <TabelaSimples minimo={980}
        colunas={[{ rotulo: "Código SAP" }, { rotulo: "Equipamento" }, { rotulo: "Área" }, { rotulo: "AFs", direita: true }, { rotulo: "AFs A", direita: true },
          { rotulo: "Em aberto", direita: true }, { rotulo: "Parada (h)", direita: true }, { rotulo: "Causa mais frequente" }, { rotulo: "Última falha" }]}
        linhas={top.map((x) => ({ celulas: [
          x.cod ? <Link href={`/equipamentos?eq=${encodeURIComponent(x.cod)}`} className="font-mono text-[12px] text-[var(--serie-1)] hover:underline">{x.cod}</Link> : "—",
          x.eq, x.area, int(x.n), int(x.a), int(x.aberto), num(x.parada), x.causa, dataBr(x.ultima)] }))} />
    </Quadro>
  );
}

// ----------------------------------------------------------------------------
// Referência IW28
// ----------------------------------------------------------------------------
function ReferenciaIw28({ notas, gerP, ini, fim }: { notas: import("@/lib/wcm/preparo").Nota[] | null; gerP: AfG[]; ini: Dia; fim: Dia }) {
  const datas = (notas ?? []).map((n) => n.data).filter((d): d is Dia => d != null);
  if (!datas.length) return <Aviso tom="azul">Envie o export da IW28 (notas) para comparar as quebras classe A com as AFs A geradas.</Aviso>;
  let cIni = Infinity, cFim = -Infinity;
  for (const d of datas) { if (d < cIni) cIni = d; if (d > cFim) cFim = d; }
  const rIni = Math.max(ini, cIni), rFim = Math.min(fim, cFim);
  if (rIni > rFim) return <Aviso tom="azul">O export da IW28 carregado cobre {descrever(cIni, cFim)}, fora do período escolhido: não há quebras para comparar com as AFs.</Aviso>;
  const q = af.quebrasAIw28(notas).filter((n) => n.data! >= rIni && n.data! <= rFim);
  const ga = gerP.filter((a) => a.criticidade === "A" && a.dataFalha! >= rIni && a.dataFalha! <= rFim);
  const meses: Dia[] = [];
  for (let m = inicioDoMes(rIni); m <= rFim; m = somarMeses(m, 1)) meses.push(m);
  const qa = meses.map((m) => q.filter((n) => inicioDoMes(n.data!) === m).length), aa = meses.map((m) => ga.filter((a) => inicioDoMes(a.dataFalha!) === m).length);
  const tq = q.length, tg = ga.length;
  return (
    <Grafico titulo="Quebras A na IW28 × AFs A geradas" subtitulo={`De ${descrever(rIni, rFim)} (parte do período coberta pelo export da IW28)`}
      legenda={<LegendaCores itens={[["Quebras A (IW28)", "neutro"], ["AFs A geradas", "serie-1"]]} />}
      tabela={{ colunas: ["Mês", "Quebras A (IW28)", "AFs A geradas"], linhas: meses.map((m, i) => [mesBr(m), qa[i], aa[i]]) }}>
      <Colunas rotulos={meses.map(mesBr)} formato="inteiro" rotular="todos"
        series={[{ nome: "Quebras A (IW28)", valores: qa, cor: "neutro" }, { nome: "AFs A geradas", valores: aa, cor: "serie-1" }]} />
      <p className="mt-3 text-[12.5px] leading-relaxed text-texto-3"><b className="font-medium text-texto-2">{int(tq)}</b> quebras classe A na IW28 (notas Y1 → ordem YM11 em equipamento A) e <b className="font-medium text-texto-2">{int(tg)}</b> AFs A geradas{tq ? ` (${num((tg / tq) * 100, 0)}% das quebras)` : ""}. Referência apenas: nem toda parada vira AF (o gatilho depende da duração da parada) e a nota quase nunca traz o número da AF, por isso as duas contagens não se cruzam uma a uma.</p>
    </Grafico>
  );
}

// ----------------------------------------------------------------------------
// Tabela das AFs, com detalhe e ações
// ----------------------------------------------------------------------------
const COLS_AF: Coluna[] = [
  { id: "numero", rotulo: "Nº AF", tipo: "codigo", largura: 100 }, { id: "situacao", rotulo: "Situação", tipo: "situacao", largura: 180 },
  { id: "crit", rotulo: "Criticidade", largura: 90 }, { id: "falha", rotulo: "Data da falha", tipo: "data", largura: 110 },
  { id: "limite", rotulo: "Data limite", tipo: "data" }, { id: "analise", rotulo: "Data da análise", tipo: "data", largura: 120 },
  { id: "atraso", rotulo: "Dias de atraso", tipo: "num", largura: 100 }, { id: "diasAnalise", rotulo: "Dias para análise", tipo: "num", largura: 110 },
  { id: "area", rotulo: "Área", largura: 120 }, { id: "equipamento", rotulo: "Equipamento", largura: 200 }, { id: "sap", rotulo: "Código SAP", tipo: "codigo" },
  { id: "resumo", rotulo: "Resumo", largura: 300 }, { id: "causa", rotulo: "Causa raiz", largura: 200 }, { id: "pilar", rotulo: "Pilar", largura: 70 },
  { id: "especialidade", rotulo: "Especialidade", largura: 130 }, { id: "supervisor", rotulo: "Supervisor", largura: 170 }, { id: "turno", rotulo: "Turno", largura: 80 },
  { id: "parada", rotulo: "Parada (h)", tipo: "num", casas: 1 }, { id: "pctAcoes", rotulo: "Ações concluídas", tipo: "barra", max: 100, corBarra: "st-bom", largura: 140 },
  { id: "acoes", rotulo: "Ações", tipo: "num", largura: 70 }, { id: "abertas", rotulo: "Ações abertas", tipo: "num", largura: 100 },
  { id: "link", rotulo: "Link", tipo: "link", largura: 70 },
];
const COLS_ACAO: Coluna[] = [
  { id: "n", rotulo: "Nº ação", tipo: "codigo", largura: 80 }, { id: "situacao", rotulo: "Situação", tipo: "situacao", largura: 180 },
  { id: "acao", rotulo: "Ação", largura: 320 }, { id: "tipo", rotulo: "Tipo da ação", largura: 170 }, { id: "resp", rotulo: "Responsável", largura: 170 },
  { id: "ini", rotulo: "Data de início", tipo: "data", largura: 110 }, { id: "limite", rotulo: "Data limite", tipo: "data" },
  { id: "feita", rotulo: "Data realizada", tipo: "data", largura: 110 }, { id: "atraso", rotulo: "Dias de atraso", tipo: "num", largura: 100 },
  { id: "status", rotulo: "Status", largura: 70 }, { id: "obs", rotulo: "Observações", largura: 240 },
];

const LISTAS = [{ valor: "periodo", rotulo: "Só no período" }, { valor: "todas", rotulo: "Todas as datas" }];

function TabelaAfs({ afs, acoes, ini, fim, params }: { afs: af.Af[]; acoes: af.AcaoAf[]; ini: Dia; fim: Dia; params: Params }) {
  const base = (["falha", "limite", "analise"].includes(param(params, "base")) ? param(params, "base") : "falha") as keyof typeof CAMPO_BASE;
  const campo = CAMPO_BASE[base];
  const qtd = new Map<string, number>(), abertas = new Map<string, number>();
  for (const a of acoes) {
    qtd.set(a.numeroAf, (qtd.get(a.numeroAf) ?? 0) + 1);
    if (af.AC_ABERTAS.includes(a.situacao)) abertas.set(a.numeroAf, (abertas.get(a.numeroAf) ?? 0) + 1);
  }
  const ord = [...afs].sort((a, b) => af.ORDEM_SITUACAO_AF[a.situacao] - af.ORDEM_SITUACAO_AF[b.situacao]
    || (b.diasDeAtraso ?? -1) - (a.diasDeAtraso ?? -1) || (b.dataFalha ?? -Infinity) - (a.dataFalha ?? -Infinity));
  const q = param(params, "q").trim().slice(0, 100);
  const selN = param(params, "af") || (q && afs.some((a) => a.numero === q) ? q : "");
  const sel = selN ? afs.find((a) => a.numero === selN) : undefined;
  const acs = sel ? af.acoesDaAf(acoes, sel.numero) : [];
  const nan = (v: number) => (Number.isNaN(v) ? null : v);
  // "Só no período" decidido no servidor: o navegador recebe só as AFs que vai mostrar (a lista inteira é pesada)
  const lista = param(params, "lista") === "todas" || (q && param(params, "lista") !== "periodo") ? "todas" : "periodo";
  const visiveis = lista === "todas" ? ord : ord.filter((a) => { const d = a[campo]; return d != null && d >= ini && d <= fim; });
  return (
    <>
      <Secao titulo="Análises de falha" sub="Atrasadas e em risco primeiro · clique numa AF para ver o detalhe e o plano de ação."
        acoes={<div className="flex flex-wrap items-center gap-3">
          <Opcoes param="lista" rotulo="Mostrar" opcoes={LISTAS} atual={lista} params={params} />
          <Opcoes param="base" rotulo="Data de referência" opcoes={BASES} atual={base} params={params} />
        </div>}>
        <Tabela key={q} colunas={COLS_AF} cores={COR_AF} contagem="AFs" resumoPor="situacao" arquivo="planos_de_af" altura={500}
          busca={{ campos: ["numero", "os", "resumo", "equipamento", "sap", "causa", "componente"], placeholder: "nº da AF, resumo, equipamento ou causa…" }}
          facetas={[{ id: "situacao", rotulo: "Situação", ordem: [...af.SITUACOES_AF] }, { id: "area", rotulo: "Área" }, { id: "crit", rotulo: "Criticidade" },
            { id: "pilar", rotulo: "Pilar" }, { id: "supervisor", rotulo: "Supervisor" }]}
          buscaInicial={q}
          abrirParam={{ param: "af", campo: "numero", ancora: "af" }}
          linhas={visiveis.map((a) => {
            return { numero: a.numero, situacao: a.situacao, crit: a.criticidade, falha: a.dataFalha, limite: a.dataLimite, analise: a.dataAnalise,
              atraso: a.diasDeAtraso, diasAnalise: a.diasParaAnalise, area: a.area, equipamento: a.equipamento, sap: a.codigoSap, resumo: a.resumo,
              causa: a.causaRaiz, pilar: a.pilar, especialidade: a.especialidade, supervisor: a.supervisor, turno: a.turno, parada: nan(a.duracaoParada),
              pctAcoes: nan(a.pctAcoesConcluidas), acoes: qtd.get(a.numero) ?? 0, abertas: abertas.get(a.numero) ?? 0, link: a.link,
              os: a.osCorretiva, componente: a.componente };
          })} />
        <Link href="/af_acoes" className="inline-flex items-center gap-1 text-[13px] text-texto-3 hover:text-texto">Abrir Ações de AF <ArrowRight className="size-3.5" /></Link>
      </Secao>
      {sel && (
        <Quadro id="af" titulo={`AF ${sel.numero} · ${sel.equipamento || "equipamento não informado"}`}
          subtitulo={sel.resumo ? `Resumo da falha: ${sel.resumo}` : undefined}
          acoes={
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              {/^https?:\/\//i.test(sel.link) && <a href={sel.link} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-texto-2 hover:text-texto">Abrir a AF (arquivo) <ExternalLink className="size-3.5" /></a>}
              {sel.codigoSap ? <Link href={`/equipamentos?eq=${encodeURIComponent(sel.codigoSap)}`} className="inline-flex items-center gap-1 text-texto-2 hover:text-texto">Ficha do equipamento <ArrowRight className="size-3.5" /></Link>
                : <span className="text-texto-3">Sem código SAP no gerenciador</span>}
            </div>
          }>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px]">
            <PontoSituacao nome={sel.situacao} cor={COR_AF[sel.situacao]} />
            {!!sel.diasDeAtraso && <span className="text-texto-2">{int(sel.diasDeAtraso)} dia(s) de atraso</span>}
          </div>
          <Campos itens={[["Tipo de análise", sel.tipoAnalise], ["Status no gerenciador", sel.status], ["Criticidade", sel.criticidade], ["Área", sel.area],
            ["Área da falha", sel.areaFalha], ["Código SAP", sel.codigoSap], ["Conjunto", sel.conjunto], ["Subconjunto", sel.subconjunto], ["Componente", sel.componente],
            ["Pilar", af.PILARES[sel.pilar] ? `${sel.pilar} · ${af.PILARES[sel.pilar]}` : sel.pilar], ["Causa raiz", sel.causaRaiz], ["Especialidade", sel.especialidade],
            ["OS corretiva", sel.osCorretiva], ["Duração da parada (h)", num(nan(sel.duracaoParada))], ["Supervisor", sel.supervisor], ["Turno", sel.turno],
            ["Data da falha", dataBr(sel.dataFalha)], ["Data limite", dataBr(sel.dataLimite)], ["Ajuste", sel.ajuste], ["Data da análise", dataBr(sel.dataAnalise)],
            ["Dias para análise", num(sel.diasParaAnalise, 0)], ["% ações concluídas", pct(nan(sel.pctAcoesConcluidas), 0)], ["Observações", sel.observacoes]]} />
          <div className="mt-6">
            <div className="mb-2 font-display text-[14px] font-medium">Plano de ação da AF · {int(acs.length)} ação(ões)</div>
            {acs.length ? (
              <Tabela colunas={COLS_ACAO} cores={COR_ACAO} contagem="ações" altura={320}
                linhas={acs.map((a) => ({ n: a.numeroAcao, situacao: a.situacao, acao: a.acao, tipo: a.tipoDaAcao, resp: a.responsavel, ini: a.dataInicio,
                  limite: a.dataLimite, feita: a.dataRealizada, atraso: a.diasDeAtraso, status: a.status, obs: a.observacoes }))} />
            ) : <p className="text-[13px] text-texto-3">Nenhuma ação cadastrada para esta AF no gerenciador.</p>}
          </div>
        </Quadro>
      )}
    </>
  );
}
