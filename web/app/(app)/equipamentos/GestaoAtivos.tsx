import { Boxes, ClipboardList, Hourglass, ListChecks, Network, Pencil } from "lucide-react";
import Link from "next/link";

import { Barras, Grafico, Legenda, Partes, type Cor } from "@/components/graficos";
import { Aviso } from "@/components/PaginaWcm";
import { Selo } from "@/components/ui";
import { brl, brlCurto } from "@/lib/formato";
import * as ativos from "@/lib/wcm/ativos";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import type { Contexto } from "@/lib/wcm/contexto";
import { dataBr } from "@/lib/wcm/util";

import { AbasParam, BarraSaude, Cartao, GradeNumeros, inteiroBr, Numero, Paginacao, TabelaT } from "./_ui/Blocos";
import { FiltrosUrl } from "./_ui/FiltrosUrl";
import { hrefCom, type Params } from "./_ui/url";
import { inventarioAtivos } from "./dados";
import { CampoEq, filtrarInventario, lerFiltroInventario, paginar, param, ROTULO_CAMPO, SEM_CLASSE, V_ANALISE, V_CADASTRO } from "./logica";

/** Visão "Gestão de ativos" — a única que o Manutentor vê, sem editar. */

export const COR_REC: Record<string, Cor> = {
  [ativos.SUBSTITUIR]: "st-critico", [ativos.CRIAR_PLANO]: "st-serio", [ativos.ATACAR]: "st-atencao", [ativos.CLASSIFICAR]: "neutro",
  [ativos.MANTER]: "st-bom",
};
const SELO_REC: Record<string, "vermelho" | "laranja" | "amarelo" | "cinza" | "verde"> = {
  [ativos.SUBSTITUIR]: "vermelho", [ativos.CRIAR_PLANO]: "laranja", [ativos.ATACAR]: "amarelo", [ativos.CLASSIFICAR]: "cinza", [ativos.MANTER]: "verde",
};
const CRITS = ["Alta", "Média", "Baixa", SEM_CLASSE];
const COR_CRIT: Record<string, Cor> = { Alta: "serie-1", "Média": "serie-2", Baixa: "serie-3", [SEM_CLASSE]: "neutro" };
const ABAS = [
  { id: "inventario", rotulo: "Inventário", icone: <Boxes className="size-4" strokeWidth={1.75} /> },
  { id: "area", rotulo: "Por área", icone: <Network className="size-4" strokeWidth={1.75} /> },
  { id: "vida", rotulo: "Ciclo de vida", icone: <Hourglass className="size-4" strokeWidth={1.75} /> },
  { id: "lacunas", rotulo: "Lacunas do cadastro", icone: <ListChecks className="size-4" strokeWidth={1.75} /> },
];
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

export async function GestaoAtivos({ c, params, completo, cadastra }: { c: Contexto; params: Params; completo: boolean; cadastra: boolean }) {
  const t = await inventarioAtivos(c);
  const campoEq = await campoDoEquipamento(c);
  if (!t.length) {
    return <Aviso>Nenhum ativo encontrado. Envie o export do <b>IH08</b> (cadastro de equipamentos) ou do <b>IW38</b> em <Link prefetch={false} href="/dados" className="font-medium underline">Fontes de dados</Link>{completo ? <>, ou cadastre os equipamentos em <b>Cadastro de equipamentos</b></> : null}.</Aviso>;
  }
  const r = ativos.resumo(t);
  const aba = ABAS.some((a) => a.id === param(params, "aba")) ? param(params, "aba") : "inventario";
  return (
    <div className="space-y-6">
      <GradeNumeros colunas={6}>
        <Numero rotulo="Ativos no inventário" valor={inteiroBr(r.ativos)} detalhe={`+ ${inteiroBr(r.desativados)} desativados`}
          dica="Equipamentos do IH08, do cadastro do site e das ordens do IW38 que não estão desativados." />
        <Numero rotulo="Criticidade Alta" valor={inteiroBr(r.alta)} detalhe={`${inteiroBr(r.semCriticidade)} sem criticidade`}
          dica="Criticidade do cadastro do site; sem ela, o código ABC do IH08 (A = Alta, B = Média, C = Baixa)." />
        <Numero rotulo="Cobertura preventiva" valor={pct(r.coberturaCriticos)} detalhe={`Alta: ${pct(r.coberturaAlta)}`}
          tom={r.coberturaCriticos == null ? undefined : r.coberturaCriticos >= 100 ? "bom" : r.coberturaCriticos >= 80 ? "atencao" : "critico"}
          dica="% dos ativos de criticidade Alta e Média com plano de manutenção preventiva (IP19 ou ordens de plano no IW38 dos últimos 12 meses). Referência de mercado: 100% dos críticos cobertos." />
        <Numero rotulo="Ativos parados" valor={inteiroBr(r.parados)} dica="Ativos com a situação “Parado” no cadastro do site." />
        <Numero rotulo="Custo de manutenção" valor={brlCurto(r.custo12m)} detalhe="últimos 12 meses" dica="Custo real das ordens do IW38 dos últimos 12 meses (ativos não desativados)." />
        <Numero rotulo="Avaliar substituição" valor={inteiroBr(r.substituir)} detalhe={`${inteiroBr(r.garantiaVencendo)} garantia(s) vencendo`}
          tom={r.substituir ? "critico" : undefined}
          dica={`Custo de 12 meses ≥ ${ativos.LIMITE_SUBSTITUICAO * 100}% do valor de reposição, ou vida útil vencida com saúde crítica (reparar ou substituir).`} />
      </GradeNumeros>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Pareto t={t} campoEq={campoEq} />
        <Recomendacoes t={t} />
      </div>

      <div id="abas" className="scroll-mt-24 space-y-4">
        <AbasParam params={params} param="aba" abas={ABAS} atual={aba} ancora="abas" />
        {aba === "area" && <PorArea t={t} />}
        {aba === "vida" && <CicloVida t={t} cadastra={cadastra} campoEq={campoEq} />}
        {aba === "lacunas" && <Lacunas t={t} />}
        {aba === "inventario" && <Inventario t={t} params={params} completo={completo} cadastra={cadastra} temOrdens={!!c.b.ordens.dados} campoEq={campoEq} />}
      </div>
    </div>
  );
}

function Pareto({ t, campoEq }: { t: ativos.LinhaAtivo[]; campoEq: CampoEq }) {
  const p = ativos.paretoCusto(t);
  const total = t.filter((x) => x.situacao !== ativos.DESATIVADO).reduce((s, x) => s + x.custo12Meses, 0);
  const topo = p.reduce((s, x) => s + x.custo12Meses, 0);
  return (
    <Grafico titulo="Bad actors" subtitulo="Os 15 ativos que mais custaram em 12 meses"
      dica="Poucos ativos costumam concentrar a maior parte do gasto: comece a análise de custo por eles."
      tabela={{ colunas: [ROTULO_CAMPO, "Código", "Equipamento", "Criticidade", "Custo 12 meses", "% acumulado"], linhas: p.map((x) => [campoEq(x.codigo) || "—", x.codigo, x.equipamento, x.criticidade || "—", brl(x.custo12Meses), `${Math.round(x.pctAcumulado)}%`]) }}>
      {!p.length ? <p className="text-[13px] text-texto-3">Sem custo de manutenção nos últimos 12 meses.</p> : (
        <div className="space-y-5">
          <div>
            <div className="mb-2 text-[12.5px] text-texto-2">Os {p.length} primeiros somam <b className="num">{Math.round(p[p.length - 1].pctAcumulado)}%</b> do custo de manutenção dos ativos</div>
            <Partes formato="R$" partes={[{ nome: `${p.length} maiores`, valor: topo, cor: "serie-1" }, { nome: "Demais ativos", valor: Math.max(0, total - topo), cor: "neutro" }]} />
          </div>
          <Barras formato="R$" larguraRotulo={230} max={(p[0]?.custo12Meses ?? 1) * 1.15}
            itens={p.map((x) => ({ rotulo: x.equipamento || x.codigo, valor: x.custo12Meses, detalhe: `${x.codigo} · ${Math.round(x.pctAcumulado)}% acumulado` }))} />
        </div>
      )}
    </Grafico>
  );
}

function Recomendacoes({ t }: { t: ativos.LinhaAtivo[] }) {
  const cont = ativos.contarRecomendacoes(t);
  return (
    <Grafico titulo="O que fazer com os ativos" subtitulo="Recomendação de cada ativo — a primeira regra que vale"
      dica="Avaliar substituição → criar plano preventivo nos críticos sem plano → atacar a causa das falhas (saúde crítica) → classificar a criticidade → manter."
      tabela={{ colunas: ["Recomendação", "Ativos"], linhas: cont.map((x) => [x.recomendacao, x.ativos]) }}>
      <Barras formato="inteiro" larguraRotulo={180} itens={cont.map((x) => ({ rotulo: x.recomendacao, valor: x.ativos, cor: COR_REC[x.recomendacao], detalhe: "ativos" }))} />
      <ol className="mt-4 space-y-1.5 text-[12.5px] text-texto-3">
        <li><b className="font-medium text-texto-2">Avaliar substituição</b>: custo de 12 meses ≥ {ativos.LIMITE_SUBSTITUICAO * 100}% da reposição, ou vida útil vencida com saúde crítica.</li>
        <li><b className="font-medium text-texto-2">Criar plano preventivo</b>: criticidade Alta/Média sem plano de manutenção.</li>
        <li><b className="font-medium text-texto-2">Atacar causa das falhas</b>: saúde crítica.</li>
        <li><b className="font-medium text-texto-2">Classificar criticidade</b>: ativo sem criticidade.</li>
      </ol>
    </Grafico>
  );
}

function PorArea({ t }: { t: ativos.LinhaAtivo[] }) {
  const { areas, linhas } = ativos.porArea(t);
  if (!areas.length) return <p className="text-[13px] text-texto-3">Nenhum ativo.</p>;
  const v = (a: string, cr: string) => linhas.find((l) => l.area === a && l.criticidade === cr)?.ativos ?? 0;
  return (
    <Grafico titulo="Ativos por área e criticidade" subtitulo={`As ${areas.length} áreas com mais ativos (desativados fora)`}
      legenda={<Legenda series={CRITS.map((cr) => ({ nome: cr, cor: COR_CRIT[cr] }))} />}
      tabela={{ colunas: ["Área", ...CRITS, "Total"], linhas: areas.map((a) => [a, ...CRITS.map((cr) => v(a, cr)), CRITS.reduce((s, cr) => s + v(a, cr), 0)]) }}>
      <Barras formato="inteiro" larguraRotulo={200}
        itens={areas.map((a) => ({ rotulo: a, valor: CRITS.reduce((s, cr) => s + v(a, cr), 0),
          partes: CRITS.map((cr) => ({ nome: cr, valor: v(a, cr), cor: COR_CRIT[cr] })) }))} />
    </Grafico>
  );
}

function CicloVida({ t, cadastra, campoEq }: { t: ativos.LinhaAtivo[]; cadastra: boolean; campoEq: CampoEq }) {
  const v = ativos.cicloDeVida(t);
  return (
    <div className="space-y-4">
      <GradeNumeros>
        <Numero rotulo="Com ano de instalação" valor={inteiroBr(v.comAno)} detalhe={`de ${inteiroBr(v.ativos)} ativos`} />
        <Numero rotulo="Idade média" valor={v.idadeMedia == null ? "—" : `${Math.round(v.idadeMedia)} anos`} dica="Média da idade dos ativos com ano de instalação cadastrado." />
        <Numero rotulo="Vida útil vencida" valor={inteiroBr(v.vidaVencida)} tom={v.vidaVencida ? "atencao" : undefined} dica="Idade ≥ vida útil cadastrada." />
        <Numero rotulo="Em garantia" valor={inteiroBr(v.emGarantia)} detalhe={`${inteiroBr(v.garantiaVencendo)} vencendo em ${ativos.AVISO_GARANTIA_DIAS} dias`} />
      </GradeNumeros>
      {!v.temCicloCadastrado ? (
        <Aviso tom="azul">Nenhum ativo tem ciclo de vida cadastrado ainda. Em <b>Cadastro de equipamentos → Editar</b>{cadastra ? "" : " (editor ou administrador)"}, preencha
          fabricante, modelo, ano de instalação, vida útil, garantia e valor de reposição — com eles a gestão mostra idade, garantias a vencer e quando vale mais substituir do que reparar.</Aviso>
      ) : (
        <Cartao titulo="Atenção no ciclo de vida" sub="Substituição a avaliar, garantia vencendo ou fim da vida útil (≤ 1 ano)">
          {!v.alerta.length ? <p className="text-[13px] text-texto-3">Nenhum ativo em alerta de ciclo de vida.</p> : (
            <TabelaT alta colunas={[{ rotulo: ROTULO_CAMPO }, { rotulo: "Código" }, { rotulo: "Equipamento", larga: true }, { rotulo: "Criticidade" }, { rotulo: "Fabricante" }, { rotulo: "Modelo" },
              { rotulo: "Ano", dir: true }, { rotulo: "Idade (anos)", dir: true }, { rotulo: "Vida útil", dir: true }, { rotulo: "Vida restante", dir: true },
              { rotulo: "Garantia até" }, { rotulo: "Reposição", dir: true }, { rotulo: "Custo 12 meses", dir: true },
              { rotulo: "Custo ÷ reposição", dir: true, dica: `≥ ${ativos.LIMITE_SUBSTITUICAO * 100}% = avaliar substituição` }, { rotulo: "Recomendação" }]}
              linhas={v.alerta.map((x) => ({ chave: x.codigo, celulas: [campoEq(x.codigo) || "—", x.codigo, x.equipamento || "—", x.criticidade || "—", x.fabricante || "—", x.modelo || "—",
                x.anoInstalacao ?? "—", x.idade ?? "—", x.vidaUtil ?? "—", x.vidaRestante ?? "—", dataBr(x.garantiaAte), brl(x.valorReposicao), brl(x.custo12Meses),
                x.custoPorReposicaoPct == null ? "—" : `${x.custoPorReposicaoPct}%`, <Selo key="r" cor={SELO_REC[x.recomendacao] ?? "cinza"}>{x.recomendacao}</Selo>] }))} />
          )}
        </Cartao>
      )}
    </div>
  );
}

function Lacunas({ t }: { t: ativos.LinhaAtivo[] }) {
  const c = ativos.completude(t);
  return (
    <Cartao titulo="Lacunas do cadastro" sub="% dos ativos (não desativados) com cada informação. O ciclo de vida (fabricante, ano, valor de reposição) se preenche em Cadastro de equipamentos → Editar.">
      <div className="divide-y divide-borda">
        {c.map((x) => {
          const st = x.preenchidoPct >= 90 ? "st-bom" : x.preenchidoPct >= 50 ? "st-atencao" : "st-critico";
          return (
            <div key={x.informacao} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[240px_1fr_120px]">
              <div className="text-[13.5px] font-medium text-texto-2">{x.informacao}</div>
              <div className="order-3 col-span-2 flex items-center gap-3 sm:order-none sm:col-span-1">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-superficie-3"><div className="h-full rounded-full" style={{ width: `${x.preenchidoPct}%`, background: `var(--${st})` }} /></div>
                <span className="num w-11 text-right text-[13px] font-medium">{Math.round(x.preenchidoPct)}%</span>
              </div>
              <div className="num text-right text-[12.5px] text-texto-3">{inteiroBr(x.faltando)} faltando</div>
            </div>
          );
        })}
      </div>
    </Cartao>
  );
}

const COLS_INV = [
  { rotulo: ROTULO_CAMPO }, { rotulo: "Código" }, { rotulo: "Equipamento", larga: true }, { rotulo: "Situação" }, { rotulo: "Criticidade" }, { rotulo: "Área" },
  { rotulo: "Local de instalação" }, { rotulo: "Saúde", dica: "Índice 0–100 da Saúde dos ativos" }, { rotulo: "Custo 12 meses", dir: true },
  { rotulo: "Quebras 12 meses", dir: true }, { rotulo: "MTBF (dias)", dir: true, dica: "365 dias ÷ quebras de 12 meses" },
  { rotulo: "Planos", dir: true, dica: "Planos de manutenção preventiva (IP19 ou ordens de plano do IW38)" }, { rotulo: "Pendentes", dir: true },
  { rotulo: "Idade (anos)", dir: true }, { rotulo: "Garantia" }, { rotulo: "Recomendação" }, { rotulo: "Origem" },
];

function Inventario({ t, params, completo, cadastra, temOrdens, campoEq }: { t: ativos.LinhaAtivo[]; params: Params; completo: boolean; cadastra: boolean; temOrdens: boolean; campoEq: CampoEq }) {
  const f = lerFiltroInventario(params);
  const vis = filtrarInventario(t, f, campoEq);
  const pg = paginar(vis, Number(param(params, "pag")) || 1);
  const sel = param(params, "at");
  const r = sel ? t.find((x) => x.codigo === sel) : undefined;
  const conta = (fn: (x: ativos.LinhaAtivo) => boolean) => t.filter(fn).length;
  const areas = [...new Set(t.map((x) => x.area).filter(Boolean))].sort();
  return (
    <div className="space-y-3">
      <FiltrosUrl zerar={["at"]} campos={[
        { tipo: "busca", param: "iq", placeholder: "Buscar código, nome, local, fabricante, nº de série…" },
        { tipo: "multi", param: "iarea", rotulo: "Área", opcoes: areas.map((a) => ({ valor: a, n: conta((x) => x.area === a) })) },
        { tipo: "multi", param: "icrit", rotulo: "Criticidade", opcoes: CRITS.map((cr) => ({ valor: cr, n: conta((x) => (x.criticidade || SEM_CLASSE) === cr) })) },
        { tipo: "multi", param: "isit", rotulo: "Situação", opcoes: ativos.SITUACOES.map((s) => ({ valor: s, n: conta((x) => x.situacao === s) })) },
        { tipo: "alternar", param: "iplano", rotulo: "Só sem plano preventivo" },
        { tipo: "alternar", param: "isite", rotulo: "Só cadastrados no site" },
        { tipo: "pilulas", param: "irec", rotulo: "Recomendação", opcoes: ativos.RECOMENDACOES },
      ]} />
      <p className="text-[12.5px] text-texto-3">{inteiroBr(vis.length)} de {inteiroBr(t.length)} ativo(s){f.sits.length ? "" : " (sem os desativados)"} · clique no código para ver o resumo{completo ? ", abrir a ficha ou editar o cadastro" : ""}.</p>
      {r && (
        <Cartao className="border-borda-forte" titulo={`${campoEq(r.codigo) ? `${campoEq(r.codigo)} · ` : ""}${r.codigo} · ${r.equipamento || "—"}`}
          sub={<span className="inline-flex flex-wrap items-center gap-1.5">{r.situacao} · criticidade {r.criticidade || "sem classe"} · <Selo cor={SELO_REC[r.recomendacao] ?? "cinza"}>{r.recomendacao}</Selo></span>}
          acoes={<div className="flex flex-wrap gap-2">
            {completo && temOrdens && <Link prefetch={false} href={`?${new URLSearchParams({ visao: V_ANALISE, eq: r.codigo })}#ficha`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borda px-3 text-[13px] transition hover:bg-superficie-2"><ClipboardList className="size-3.5" /> Abrir ficha (ordens)</Link>}
            {cadastra && <Link prefetch={false} href={`?${new URLSearchParams({ visao: V_CADASTRO, form: r.codigo })}#form`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-marca-500 px-3 text-[13px] font-medium text-white transition hover:bg-marca-600"><Pencil className="size-3.5" /> {r.origem !== "SAP" ? "Editar cadastro" : "Cadastrar no site"}</Link>}
            <Link prefetch={false} scroll={false} href={hrefCom(params, { at: null })} className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] text-texto-3 hover:text-texto">Fechar</Link>
          </div>}>
          <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            {[[ROTULO_CAMPO, campoEq(r.codigo) || "—"], ["Local", r.localInstalacao || "—"], ["Área", r.area || "—"], ["Centro", r.centro || "—"], ["Origem", r.origem],
              ["Custo total (IW38)", brl(r.custoTotal)], ["Custo 12 meses", brl(r.custo12Meses)], ["Planos preventivos", inteiroBr(r.planosPreventivos)], ["Peças vinculadas", inteiroBr(r.pecasVinculadas)],
              ["Fabricante / modelo", [r.fabricante, r.modelo].filter(Boolean).join(" ") || "—"], ["Nº de série", r.serie || "—"],
              ["Instalação", r.anoInstalacao != null ? `${r.anoInstalacao} (${r.idade} anos)` : "—"], ["Vida útil", r.vidaUtil != null ? `${r.vidaUtil} anos (restam ${r.vidaRestante ?? "—"})` : "—"],
              ["Garantia", r.garantiaAte != null ? `${r.garantia} · até ${dataBr(r.garantiaAte)}` : r.garantia], ["Reposição", brl(r.valorReposicao)],
              ["Saúde", r.saude != null ? `${r.saude} · ${r.faixa}` : "—"], ["MTBF", r.mtbfDias != null ? `${r.mtbfDias} dias` : "—"],
            ].map(([k, v]) => <div key={k}><dt className="text-[12px] text-texto-3">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          </dl>
        </Cartao>
      )}
      <TabelaT colunas={COLS_INV} vazio="Nenhum ativo com estes filtros."
        linhas={pg.itens.map((x) => ({
          chave: x.codigo, ativa: x.codigo === sel, href: hrefCom(params, { at: x.codigo === sel ? null : x.codigo }, "abas"),
          celulas: [campoEq(x.codigo) || "—", x.codigo, x.equipamento || "—", x.situacao, x.criticidade || <span className="text-texto-3">sem classe</span>, x.area || "—", x.localInstalacao || "—",
            <BarraSaude key="s" valor={x.saude} faixa={x.faixa} />, brl(x.custo12Meses), x.quebras12Meses, x.mtbfDias ?? "—", x.planosPreventivos, x.ordensPendentes,
            x.idade ?? "—", x.garantia, <Selo key="r" cor={SELO_REC[x.recomendacao] ?? "cinza"}>{x.recomendacao}</Selo>, x.origem],
        }))} />
      <Paginacao params={params} {...pg} mostrados={pg.itens.length} rotulo="ativo(s)" baixar={`/api/equipamentos${hrefCom(params, { planilha: "inventario", pag: null, at: null })}`} />
    </div>
  );
}
