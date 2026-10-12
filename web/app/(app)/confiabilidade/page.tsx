import type { Metadata } from "next";

import { Barras, Colunas, Grafico, Linhas, MapaDeCalor, Legenda, type Cor } from "@/components/graficos";
import { GradeKpis } from "@/components/Indicador";
import { AbasVisao, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { brl } from "@/lib/formato";
import { barra, contexto, dados, resultados, serieMensal } from "@/lib/wcm/contexto";
import * as ind from "@/lib/wcm/indicadores";
import { dataBr } from "@/lib/wcm/util";

import { LinksParam } from "./_comum/LinksParam";
import { Nota, Numeros } from "./_comum/Numeros";
import { pareto, somarPor } from "./_comum/agregar";
import { TabelaDados, type Coluna } from "./_comum/TabelaDados";
import {
  CRITICIDADES, DIAS_SEMANA, DIMENSOES, FAIXAS_QUEBRAS, matrizCriticidade, mtbfMensal, porDiaDaSemana, porEquipamento,
} from "./calculo";
import { Equipamentos } from "./Equipamentos";

export const metadata: Metadata = { title: "Confiabilidade" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VISOES = ["Visão geral", "Por equipamento", "Reincidências"];
const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

const COLUNAS_REINC: Coluna[] = [
  { rotulo: "Data", formato: "data" }, { rotulo: "Código", formato: "codigo" }, { rotulo: "Equipamento", largo: true },
  { rotulo: "Dias desde a anterior", formato: "inteiro" }, { rotulo: "Descrição", largo: true }, { rotulo: "Nota", formato: "codigo" },
  { rotulo: "Ordem", formato: "codigo" }, { rotulo: "Centro de trabalho" },
];

export default async function Confiabilidade(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigir("confiabilidade");
  const params = await props.searchParams;
  const c = await contexto(params);
  const titulo = <Cabecalho titulo="Confiabilidade," destaque="quebras, MTBF e MTTR." sobre="Manutenção Profissional"
    subtitulo="Análise de falhas: onde quebra, quanto tempo leva para reparar e o que se repete. Quebra = nota Y1 da IW28 convertida em ordem YM11." />;
  if (!c.b.notas.dados) return <PaginaWcm barra={barra(c)}>{titulo}<SemDados base="IW28 (notas)" /></PaginaWcm>;
  if (!c.b.ordens.dados) return <PaginaWcm barra={barra(c)}>{titulo}<SemDados base="IW38 (ordens)" /></PaginaWcm>;

  const [[atual, anterior], serie, d] = await Promise.all([resultados(c), serieMensal(c), dados(c)]);
  const metas = c.cad.metas;
  const visao = VISOES.includes(String(params.visao)) ? String(params.visao) : VISOES[0];
  const { ini, fim } = c.f;
  const qAll = ind.quebras(d);
  const q = qAll.filter((x) => x.data! >= ini && x.data! <= fim);
  const dias = fim - ini + 1;

  const kpis = ind.KPIS.filter((k) => k.grupo === ind.CONFIABILIDADE);
  const cabeca = (
    <>
      {titulo}
      <Secao titulo="Indicadores" destaque="de confiabilidade" sub={`Recorte: ${c.recorte}. Passe o mouse no nome do indicador para ver a fórmula.`}>
        <GradeKpis kpis={kpis} atual={atual} anterior={anterior} metas={metas} serie={serie} link={false} colunas={3} />
      </Secao>
    </>
  );
  if (!q.length) {
    return (
      <PaginaWcm barra={barra(c)}>
        {cabeca}
        <p className="rounded-cartao border border-borda bg-superficie-2 px-5 py-4 text-[14px] text-texto-2">
          Nenhuma quebra (nota Y1 convertida em ordem YM11) no recorte. Amplie o período ou tire filtros.
        </p>
      </PaginaWcm>
    );
  }

  return (
    <PaginaWcm barra={barra(c)}>
      {cabeca}
      <Secao titulo="Análise" destaque="das quebras do período">
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        {visao === "Visão geral" ? <VisaoGeral c={c} q={q} qAll={qAll} serie={serie} params={params} />
          : visao === "Por equipamento" ? <PorEquipamento c={c} d={d} q={q} dias={dias} />
            : <Reincidencias q={q} />}
      </Secao>
    </PaginaWcm>
  );
}

type Ctx = Awaited<ReturnType<typeof contexto>>;

function VisaoGeral({ c, q, qAll, serie, params }: { c: Ctx; q: ind.Quebra[]; qAll: ind.Quebra[];
  serie: { mes: number; valores: ind.Resultado }[]; params: Record<string, string | string[] | undefined> }) {
  const metas = c.cad.metas;
  const rotMes = serie.map((s, i) => ind.mesTxt(s.mes) + (i === serie.length - 1 && c.f.fim >= c.b.hoje ? "*" : ""));
  const kQ = ind.POR_ID.quebras, kR = ind.POR_ID.mttr, kB = ind.POR_ID.mtbf;
  const vQ = serie.map((s) => s.valores.quebras ?? null), vR = serie.map((s) => s.valores.mttr ?? null);
  const { mtbf: vB, disponibilidade: vD } = mtbfMensal(qAll, serie.map((s) => s.mes), c.b.hoje, vR);
  const cobertura = q.length ? (q.filter((x) => x.horasReparo != null).length / q.length) * 100 : 0;

  // Pareto
  const nomeDim = Object.keys(DIMENSOES).includes(String(params.dim)) ? String(params.dim) : "Equipamento";
  const campo = DIMENSOES[nomeDim];
  const base = q.filter((x) => x[campo]);
  const nomes = new Map<string, string>();
  for (const x of base) if (!nomes.has(x.equipChave)) nomes.set(x.equipChave, x.objeto);
  const par = pareto(somarPor(base, (x) => x[campo]));
  const rot = (i: string) => (nomeDim === "Equipamento" ? `${i} · ${(nomes.get(i) ?? "").slice(0, 28)}` : i);
  const topo = par.itens.slice(0, 15);

  // matriz e dia da semana
  const tab = porEquipamento(q.filter((x) => x.equipChave), [], 1, c.cad.equipamentos,
    new Map((c.b.equipamentos.dados ?? []).map((e) => [e.equipamento, e.codigoAbc])));
  const matriz = matrizCriticidade(tab);
  const ds = porDiaDaSemana(q);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Grafico titulo="Quebras por mês" subtitulo="12 meses · * mês em andamento" dica={kQ.formula}
          tabela={{ colunas: ["Mês", "Quebras"], linhas: serie.map((_, i) => [rotMes[i], vQ[i] ?? "—"]) }}>
          <Colunas rotulos={rotMes} series={[{ nome: "Quebras", valores: vQ, cor: "serie-2" }]} meta={ind.meta(kQ, metas)} formato="inteiro" altura={200} />
        </Grafico>
        <Grafico titulo="MTTR por mês" subtitulo="Horas de reparo por quebra · linha verde = meta" dica={kR.formula}
          tabela={{ colunas: ["Mês", "MTTR"], linhas: serie.map((_, i) => [rotMes[i], ind.formatar(kR, vR[i])]) }}>
          {vR.some((v) => v != null)
            ? <Linhas rotulos={rotMes} series={[{ nome: "MTTR", valores: vR, cor: "serie-1" }]} meta={ind.meta(kR, metas)} formato="h" altura={200} area />
            : <p className="text-[13px] text-texto-3">Sem horas de reparo das quebras no recorte (nota sem ordem ou ordem sem apontamento).</p>}
        </Grafico>
        <Grafico titulo="MTBF por mês" subtitulo="Dias entre falhas dos equipamentos que quebraram" dica={kB.formula}
          tabela={{ colunas: ["Mês", "MTBF", "Disponibilidade"], linhas: serie.map((_, i) => [rotMes[i], ind.formatar(kB, vB[i]), ind.formatar(ind.POR_ID.disponibilidade, vD[i])]) }}>
          <Linhas rotulos={rotMes} series={[{ nome: "MTBF", valores: vB, cor: "serie-1" }]} meta={ind.meta(kB, metas)} formato="dias" altura={200} area />
        </Grafico>
      </div>
      <Nota>Cobertura: {Math.round(cobertura)}% das quebras do período têm horas de reparo (duração da parada na nota, apontamento na IW47 da ordem ou trabalho no IW38OP).</Nota>

      <Grafico titulo="Pareto das quebras" subtitulo="Os poucos itens que concentram a maior parte das falhas (80/20)"
        acoes={<LinksParam chave="dim" opcoes={Object.keys(DIMENSOES)} atual={nomeDim} params={params} />}
        legenda={<Legenda series={[{ nome: "Concentram 80% das quebras", cor: "serie-2" }, { nome: "Demais", cor: "neutro" }]} />}
        tabela={{ colunas: [nomeDim, "Quebras", "%", "% acumulado"], linhas: par.itens.slice(0, 25).map((x) => [rot(x.item), x.valor, `${x.pct.toFixed(1).replace(".", ",")}%`, `${x.acumulado.toFixed(1).replace(".", ",")}%`]) }}>
        {topo.length ? (
          <>
            <Barras larguraRotulo={nomeDim === "Equipamento" || nomeDim === "Local de instalação" ? 280 : 200} formato="inteiro"
              itens={topo.map((x) => ({ rotulo: rot(x.item), valor: x.valor, cor: (x.vital ? "serie-2" : "neutro") as Cor,
                detalhe: `quebras · ${x.acumulado.toFixed(0)}% acumulado` }))} />
            <p className="mt-3 text-[13px] text-texto-2">
              <b className="num font-medium text-texto">{n0.format(par.n80)}</b> {nomeDim.toLowerCase()}(s) concentram 80% das {n0.format(par.total)} quebras
              com {nomeDim.toLowerCase()} informado — foco para análise de falha (5 porquês / Ishikawa) e plano de ação.
              {par.itens.length > topo.length && <span className="text-texto-3"> Mostrando os {topo.length} primeiros de {par.itens.length}.</span>}
            </p>
          </>
        ) : <p className="text-[13px] text-texto-3">Nenhuma quebra com {nomeDim.toLowerCase()} informado.</p>}
      </Grafico>

      <div className="grid gap-4 lg:grid-cols-2">
        <Grafico titulo="Matriz criticidade × frequência" subtitulo="Nº de equipamentos em cada célula · mais escuro = mais equipamentos"
          dica="Equipamentos de criticidade Alta com muitas quebras são a prioridade de ataque."
          tabela={{ colunas: ["Criticidade", ...FAIXAS_QUEBRAS.map((f) => `${f} quebra(s)`)], linhas: CRITICIDADES.map((cr, i) => [cr, ...matriz[i]]) }}>
          <MapaDeCalor linhas={CRITICIDADES} colunas={FAIXAS_QUEBRAS.map((f) => `${f} q.`)} valores={matriz} formato="inteiro" larguraRotulo={110} />
          <Nota>Colunas = quebras do equipamento no período. A célula Alta × muitas quebras é a prioridade de ataque.</Nota>
        </Grafico>
        <Grafico titulo="Quebras por dia da semana" subtitulo="Pela data da nota"
          tabela={{ colunas: ["Dia", "Quebras"], linhas: DIAS_SEMANA.map((x, i) => [x, ds[i]]) }}>
          <Colunas rotulos={DIAS_SEMANA} series={[{ nome: "Quebras", valores: ds, cor: "serie-2" }]} formato="inteiro" altura={200} rotular="todos" />
        </Grafico>
      </div>
    </div>
  );
}

function PorEquipamento({ c, d, q, dias }: { c: Ctx; d: ind.Dados; q: ind.Quebra[]; dias: number }) {
  const ordensPer = d.ordens.filter((o) => o.data != null && o.data >= c.f.ini && o.data <= c.f.fim);
  const abc = new Map((c.b.equipamentos.dados ?? []).map((e) => [e.equipamento, e.codigoAbc]));
  const tab = porEquipamento(q.filter((x) => x.equipChave), ordensPer, dias, c.cad.equipamentos, abc);
  const linhas = tab.map((t) => [t.codigo, t.nome, t.criticidade, t.abc, t.area, t.quebras, t.reincidencias, t.mtbf, t.mttr, t.reparo,
    t.ordens, t.custo, t.ultima, t.local]);
  const bad = tab.slice(0, 10);
  const custo = tab.reduce((s, t) => s + t.custo, 0);
  return (
    <div className="space-y-4">
      <Numeros itens={[
        { rotulo: "Equipamentos que quebraram", valor: n0.format(tab.length), detalhe: `${n0.format(q.filter((x) => x.equipChave).length)} quebras com equipamento` },
        { rotulo: "Com reincidência", valor: n0.format(tab.filter((t) => t.reincidencias > 0).length), detalhe: "quebrou de novo em até 30 dias" },
        { rotulo: "Criticidade Alta", valor: n0.format(tab.filter((t) => t.criticidade === "Alta").length), detalhe: "pelo cadastro ou ABC = A" },
        { rotulo: "Custo das ordens", valor: brl(custo), detalhe: "dos equipamentos que quebraram, no período", dica: "Custo real (IW38) de todas as ordens do período desses equipamentos" },
      ]} />
      <Grafico titulo="Equipamentos com mais quebras" subtitulo="Bad actors do período · primeira quebra × reincidente (≤ 30 dias)"
        legenda={<Legenda series={[{ nome: "Primeira", cor: "serie-1" }, { nome: "Reincidente", cor: "serie-2" }]} />}
        tabela={{ colunas: ["Código", "Equipamento", "Quebras", "Reincidências", "MTTR (h)"], linhas: bad.map((t) => [t.codigo, t.nome, t.quebras, t.reincidencias, t.mttr == null ? "—" : t.mttr.toFixed(1).replace(".", ",")]) }}>
        <Barras larguraRotulo={280} formato="inteiro" itens={bad.map((t) => ({ rotulo: `${t.codigo} · ${t.nome.slice(0, 30)}`, valor: t.quebras,
          partes: [{ nome: "Primeira", valor: t.quebras - t.reincidencias, cor: "serie-1" as Cor }, { nome: "Reincidente", valor: t.reincidencias, cor: "serie-2" as Cor }] }))} />
      </Grafico>
      <div className="rounded-cartao border border-borda bg-superficie p-5">
        <div className="font-display text-[15px] font-medium">Confiabilidade por equipamento</div>
        <div className="mb-4 mt-0.5 text-[12.5px] text-texto-3">MTBF = dias do período ÷ quebras do equipamento · MTTR = média das horas de reparo. Clique numa linha para ver todas as quebras e abrir a ficha.</div>
        <Equipamentos linhas={linhas} />
      </div>
    </div>
  );
}

function Reincidencias({ q }: { q: ind.Quebra[] }) {
  const rc = q.filter((x) => x.reincidente).sort((a, b) => b.data! - a.data!);
  const eqs = new Set(rc.map((x) => x.equipChave));
  const porEq = new Map<string, { nome: string; n: number }>();
  for (const x of rc) { const e = porEq.get(x.equipChave) ?? { nome: x.objeto, n: 0 }; e.n++; porEq.set(x.equipChave, e); }
  const top = [...porEq.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0])).slice(0, 10);
  const pct = q.length ? (rc.length / q.length) * 100 : 0;
  const intervalo = rc.map((x) => x.diasDesdeAnterior ?? 0);
  const medio = intervalo.length ? intervalo.reduce((s, v) => s + v, 0) / intervalo.length : null;
  return (
    <div className="space-y-4">
      <Numeros colunas={4} itens={[
        { rotulo: "Reincidências", valor: n0.format(rc.length), detalhe: `${pct.toFixed(1).replace(".", ",")}% das quebras`, dica: ind.POR_ID.reincidencia.formula },
        { rotulo: "Equipamentos", valor: n0.format(eqs.size), detalhe: "com ao menos uma reincidência" },
        { rotulo: "Dias até a reincidência", valor: medio == null ? "—" : `${medio.toFixed(1).replace(".", ",")} d`, detalhe: "média desde a quebra anterior" },
        { rotulo: "Última reincidência", valor: rc.length ? dataBr(rc[0].data) : "—" },
      ]} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Grafico titulo="Onde mais reincide" subtitulo="Reincidências por equipamento"
          tabela={{ colunas: ["Código", "Equipamento", "Reincidências"], linhas: top.map(([k, v]) => [k, v.nome, v.n]) }}>
          {top.length ? <Barras larguraRotulo={220} formato="inteiro" itens={top.map(([k, v]) => ({ rotulo: `${k} · ${v.nome.slice(0, 24)}`, valor: v.n, cor: "serie-2" as Cor }))} />
            : <p className="text-[13px] text-texto-3">Nenhuma reincidência no período.</p>}
        </Grafico>
        <div className="min-w-0 rounded-cartao border border-borda bg-superficie p-5">
          <div className="font-display text-[15px] font-medium" title="Reincidência indica reparo que não eliminou a causa: candidata a análise de falha e à revisão do plano de manutenção.">
            Reincidências do período
          </div>
          <div className="mb-4 mt-0.5 text-[12.5px] text-texto-3">Quebra no mesmo equipamento em até 30 dias da anterior — reparo que não eliminou a causa: candidata a análise de falha.</div>
          <TabelaDados colunas={COLUNAS_REINC} limite={300} baixar="reincidencias" busca="Buscar: código, equipamento, descrição…"
            linhas={rc.map((x) => [x.data, x.equipChave, x.objeto, x.diasDesdeAnterior, x.descricao, x.nota, x.ordem, x.centroTrabalho])} />
        </div>
      </div>
    </div>
  );
}
