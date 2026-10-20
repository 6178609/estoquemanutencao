import type { Metadata } from "next";

import { Barras, Colunas, Grafico, Legenda, type Cor } from "@/components/graficos";
import { PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { brl, brlCurto } from "@/lib/formato";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { concentracao, custoParadaDe, dnaPorFamilia, iceberg, kpis360, mesDoTermometro, mesNoIntervalo, porCriticidade, porDia, porGrupo, porMesAno, travado } from "@/lib/wcm/custo360";
import { barra, contexto, dados, resultados } from "@/lib/wcm/contexto";
import * as ind from "@/lib/wcm/indicadores";
import { dia, inicioDoMes, partes, somarMeses, type Dia } from "@/lib/wcm/util";

import { hrefCom } from "../equipamentos/_ui/url";
import { Nota, Numeros } from "../confiabilidade/_comum/Numeros";
import { TabelaDados, type Coluna } from "../confiabilidade/_comum/TabelaDados";
import { TabelaFicha } from "../confiabilidade/_comum/TabelaFicha";
import { custoPor, ordensDoPeriodo, porEquipamento, porMes, resumo } from "./calculo";
import { Concentracao } from "./_ui/Concentracao";
import { Dna } from "./_ui/Dna";
import { Iceberg } from "./_ui/Iceberg";
import { PorClasse } from "./_ui/PorClasse";
import { Kpis360 } from "./_ui/Kpis360";
import { ParaOnde } from "./_ui/ParaOnde";
import { Termometro } from "./_ui/Termometro";
import { Travado } from "./_ui/Travado";

export const metadata: Metadata = { title: "Custos" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b ? `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format((a / b) * 100)}%` : "—");
const chaveMes = (a: number, m: number) => a * 12 + (m - 1);
const mesParam = (a: number, m: number) => `${a}-${String(m).padStart(2, "0")}`;

const COL_EQ: Coluna[] = [
  { rotulo: "Campo de ordenação" }, { rotulo: "Código", formato: "codigo" }, { rotulo: "Equipamento", largo: true }, { rotulo: "Custo", formato: "R$" },
  { rotulo: "Ordens", formato: "inteiro" }, { rotulo: "Backlog", formato: "inteiro", dica: "Ordens sem plano de manutenção" },
  { rotulo: "Custo médio por ordem", formato: "R$" }, { rotulo: "% acumulado", formato: "%" },
];
const COL_ORD: Coluna[] = [
  { rotulo: "Ordem", formato: "codigo" }, { rotulo: "Tipo" }, { rotulo: "Natureza" }, { rotulo: "Texto", largo: true },
  { rotulo: "Campo de ordenação" }, { rotulo: "Equipamento", formato: "codigo" }, { rotulo: "Custo real", formato: "R$" }, { rotulo: "Data", formato: "data" },
  { rotulo: "Situação" },
];

export default async function Custos(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigir("custos");
  const params = await props.searchParams;
  const c = await contexto(params);
  const titulo = <Cabecalho titulo="Custos," destaque="quanto custa manter a fábrica rodando." sobre="Manutenção Profissional"
    subtitulo="Custo real das ordens (IW38) por mês, classe de manutenção, tipo, área, centro de trabalho e equipamento. Ordens canceladas não entram." />;
  if (!c.b.ordens.dados) return <PaginaWcm barra={barra(c)}>{titulo}<SemDados base="IW38 (ordens)" /></PaginaWcm>;

  const [[atual], d, campoEq] = await Promise.all([resultados(c), dados(c), campoDoEquipamento(c)]);
  const metas = c.cad.metas;
  const { ini, fim } = c.f;
  const hoje = d.hoje;
  const fimEf = Math.min(fim, hoje);
  const o = ordensDoPeriodo(d.ordens, ini, fimEf, c.tipos);
  if (!o.length) return <PaginaWcm barra={barra(c)}>{titulo}<p className="text-[14px] text-texto-3">Sem ordens no recorte.</p></PaginaWcm>;

  // ---- topo: KPIs, iceberg, termômetro e para onde vai ----
  const r = resumo(o, ini, fimEf);
  const comCentroOuTipo = c.f.centros.length > 0 || c.f.setores.length > 0 || c.f.tipos.length > 0;
  // ativos = IH08 sem desativado, da área do filtro quando há área (mesma base do custo por ativo e da classe)
  const eqsAtivos = (c.b.equipamentos.dados ?? [])
    .filter((e) => !e.desativado && (!c.f.areas.length || c.f.areas.includes(e.localizacao)));
  const nAtivos = eqsAtivos.length;
  const nomeEq = new Map((c.b.equipamentos.dados ?? []).map((e) => [e.equipamento, e.denominacao]));
  const k = kpis360(o, comCentroOuTipo ? 0 : nAtivos, r.meses);

  const [ant0, ant1] = ind.periodoAnterior(ini, fimEf);
  const antes = ordensDoPeriodo(d.ordens, ant0, ant1, c.tipos);
  const totalAntes = antes.reduce((s, x) => s + x.custoReal, 0);
  const variacao = antes.length && totalAntes ? ((r.total - totalAntes) / Math.abs(totalAntes)) * 100 : null;

  const grupos = porGrupo(o);
  const pctCorr = atual.pct_custo_corr ?? null;
  const metaCorr = ind.meta(ind.POR_ID.pct_custo_corr, metas);
  const etapasTravado = travado(o, d.requisicoes);
  const travados = etapasTravado.filter((e) => e.valor != null);
  const totalTravado = travados.length ? travados.reduce((s, e) => s + (e.valor ?? 0), 0) : null;

  const conf = d.confTodos ?? d.conf;
  const horasIw47 = (conf ?? []).filter((x) => x.data != null && x.data >= ini && x.data <= fimEf).reduce((s, x) => s + x.horas, 0);
  const quebras = d.notas && (!c.f.tipos.length || c.f.tipos.includes(ind.TIPO_QUEBRA)) ? ind.quebras(d) : [];
  const quebrasPeriodo = quebras.filter((q) => q.data != null && q.data >= ini && q.data <= fimEf);
  const reqPendentes = d.requisicoes ? d.requisicoes.filter((x) => x.pendente).reduce((s, x) => s + x.total, 0) : null;
  const estoque = d.estoque ? d.estoque.reduce((s, x) => s + x.valor, 0) : null;
  const ice = iceberg(o, quebrasPeriodo, horasIw47, reqPendentes, estoque, custoParadaDe(metas));

  // termômetro: intervalo do IW38 (não o período do filtro); ordens do ano anterior e do ano escolhido
  let spanIni = Infinity, spanMax = -Infinity;
  for (const x of d.ordens) if (x.data != null) { spanIni = Math.min(spanIni, x.data); spanMax = Math.max(spanMax, x.data); }
  const spanFim = Math.min(spanMax, hoje);
  const spanIniEf = Math.min(spanIni, spanFim);
  const dentroDoSpan = (x: Dia) => Math.min(Math.max(x, spanIniEf), spanFim);
  const padrao = partes(dentroDoSpan(fimEf));
  const cmesParam = typeof params.cmes === "string" ? params.cmes : mesParam(padrao.ano, padrao.mes);
  const { ano: anoAlvo, mes } = mesDoTermometro(cmesParam, spanIniEf, spanFim);
  const modo: "mensal" | "anual" = params.cvis === "anual" ? "anual" : "mensal";
  const ordensTerm = ordensDoPeriodo(d.ordens, dia(anoAlvo - 1, 1, 1)!, Math.min(dia(anoAlvo, 12, 31) ?? hoje, hoje), c.tipos);
  const dias = porDia(ordensTerm, anoAlvo, mes);
  const meses = porMesAno(ordensTerm, anoAlvo);
  const somaDias = (xs: { valor: number }[]) => xs.reduce((s, x) => s + x.valor, 0);
  const sIni = partes(spanIniEf), sFim = partes(spanFim);
  const noSpan = (a: number, m: number) => mesNoIntervalo(a, m, spanIniEf, spanFim);
  const cursor = chaveMes(anoAlvo, mes);
  const temAnt = modo === "mensal" ? cursor - 1 >= chaveMes(sIni.ano, sIni.mes) : anoAlvo - 1 >= sIni.ano;
  const temProx = modo === "mensal" ? cursor + 1 <= chaveMes(sFim.ano, sFim.mes) : anoAlvo + 1 <= sFim.ano;
  const vizinhoMes = (delta: number) => {
    const k2 = cursor + delta;
    const q = noSpan(Math.floor(k2 / 12), (k2 % 12) + 1);
    return hrefCom(params, { cmes: mesParam(q.ano, q.mes) });
  };
  const termometro = {
    ano: anoAlvo, mes, modo, dias, meses,
    mesAnterior: somaDias(porDia(ordensTerm, anoAlvo - 1, mes)),
    anoAnteriorTotal: porMesAno(ordensTerm, anoAlvo - 1).reduce((s, v) => s + v, 0),
    anoAnterior: anoAlvo - 1,
    nav: {
      ant: temAnt ? (modo === "mensal" ? vizinhoMes(-1) : hrefCom(params, { cmes: mesParam(noSpan(anoAlvo - 1, mes).ano, noSpan(anoAlvo - 1, mes).mes), cvis: "anual" })) : null,
      prox: temProx ? (modo === "mensal" ? vizinhoMes(1) : hrefCom(params, { cmes: mesParam(noSpan(anoAlvo + 1, mes).ano, noSpan(anoAlvo + 1, mes).mes), cvis: "anual" })) : null,
      mensal: hrefCom(params, { cmes: mesParam(anoAlvo, mes), cvis: null }),
      anual: hrefCom(params, { cmes: mesParam(anoAlvo, mes), cvis: "anual" }),
      mesHrefs: Array.from({ length: 12 }, (_, i) => hrefCom(params, { cmes: mesParam(noSpan(anoAlvo, i + 1).ano, noSpan(anoAlvo, i + 1).mes), cvis: null })),
    },
  };

  // ---- detalhes (como antes) ----
  const emerg = ind.temEmergencial(d);
  // custo por mês: o período, com no mínimo os 12 meses até o fim dele (contexto da tendência)
  const iniMes = Math.min(ini, somarMeses(inicioDoMes(fimEf), -11));
  const mes12 = porMes(ordensDoPeriodo(d.ordens, iniMes, fimEf, c.tipos), iniMes, fimEf);
  const rotMes = mes12.meses.map(ind.mesTxt);
  const orc = ind.meta(ind.POR_ID.custo, metas);
  const porTipo = custoPor(o, (x) => x.tipoNome, 12);
  const porArea = custoPor(o, (x) => x.localizacao, 10, "—");
  const porCentro = custoPor(o, (x) => x.centroTrabalho, 12, "—");
  const eq = porEquipamento(o);
  const topEq = eq.linhas.slice(0, 12);
  const topOrd = [...o].sort((a, b) => b.custoReal - a.custoReal).slice(0, 200);
  const folga = (xs: { valor: number }[]) => Math.max(1, ...xs.map((x) => x.valor)) * 1.18; // espaço para o rótulo "R$ 69 mil" na ponta
  const barrasSimples = (xs: [string, number][]) => xs.map(([rotulo, valor]) => ({ rotulo, valor, cor: "serie-1" as Cor }));
  const tabelaSimples = (nome: string, xs: [string, number][]) => ({ colunas: [nome, "Custo"], linhas: xs.map(([k2, v]) => [k2, brl(v)]) });

  return (
    <PaginaWcm barra={barra(c)}>
      {titulo}
      <Secao titulo="Indicadores" destaque="de custo" sub={`Recorte: ${c.recorte}. Passe o mouse no nome do indicador para ver a fórmula.`}>
        <Kpis360
          total={r.total}
          variacao={variacao}
          porAtivoMes={k.porAtivoMes}
          nAtivos={nAtivos}
          ativoAplica={!comCentroOuTipo}
          medioOrdem={k.medioOrdem}
          ordensComCusto={k.ordensComCusto}
          backlog={{
            pct: pctCorr, meta: metaCorr, farol: ind.farol(ind.POR_ID.pct_custo_corr, pctCorr, metaCorr),
            preventivaPct: grupos.find((g) => g.grupo === "Planejada")?.pct ?? null, dica: ind.POR_ID.pct_custo_corr.formula,
          }}
          travado={totalTravado}
        />
      </Secao>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.3fr_1fr]">
        <Iceberg ice={ice} temIw47={conf != null} />
        <Termometro {...termometro} />
        <ParaOnde
          grupos={grupos}
          planejadaPct={pctCorr != null ? 100 - pctCorr : null}
          metaPlanejada={metaCorr != null ? 100 - metaCorr : null}
          emergencial={r.emergencial}
          emergencialPct={r.total ? (r.emergencial / r.total) * 100 : null}
        />
      </div>
      <p className="-mt-6 text-[12px] text-texto-3">
        O termômetro segue área, centro e tipo do filtro; o período do filtro vale só para os cartões de custo e o iceberg.
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Dna familias={dnaPorFamilia(o, nomeEq, 5)} />
        <PorClasse dados={porCriticidade(o, eqsAtivos)} semIh08={c.b.equipamentos.dados == null} comFiltroCentroTipo={comCentroOuTipo} />
        <Concentracao conc={concentracao(o)} nomeEq={nomeEq} campoEq={campoEq} />
        <Travado etapas={etapasTravado} />
      </div>

      <details className="rounded-cartao border border-borda bg-superficie">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-display text-[16px] font-medium [&::-webkit-details-marker]:hidden">
          Mais detalhes
          <span className="text-[13px] font-normal text-texto-3">por mês, tipo, área, centro, equipamento e ordem</span>
        </summary>
        <div className="space-y-10 border-t border-borda p-5">
          <Secao titulo="Onde está" destaque="o dinheiro">
            <Numeros colunas={5} itens={[
              { rotulo: "Custo total", valor: brlCurto(r.total), detalhe: brl(r.total) },
              { rotulo: "Com plano", valor: brlCurto(r.comPlano), detalhe: `${pct(r.comPlano, r.total)} do total`, dica: "Ordens com número de plano de manutenção" },
              { rotulo: "Backlog", valor: brlCurto(r.backlog), detalhe: `${pct(r.backlog, r.total)} do total`, dica: "Ordens sem plano de manutenção" },
              emerg ? { rotulo: "Emergencial", valor: brlCurto(r.emergencial), detalhe: `${pct(r.emergencial, r.total)} do total`, dica: "Ordens de tipo classificado como Emergencial (ex.: YM11)" }
                : { rotulo: "Emergencial", valor: "—", detalhe: "IW38 sem tipo emergencial", dica: "O IW38 carregado não tem ordens de tipo emergencial (ex.: YM11). Exporte com todos os tipos." },
              { rotulo: "Ordens com custo", valor: n0.format(r.comCusto), detalhe: `de ${n0.format(r.ordens)} ordens` },
            ]} />

            <Grafico titulo="Custo por mês" subtitulo={`Por classe de manutenção · ${rotMes.length > 12 ? "período" : "12 meses até o fim do período"}${orc ? " · linha verde = orçamento mensal (meta do custo médio mensal)" : ""}`}
              dica={ind.POR_ID.custo.formula} legenda={<Legenda series={mes12.series} />}
              tabela={{ colunas: ["Mês", ...mes12.classes.map((x) => x.classe), "Total"], linhas: mes12.meses.map((_, i) => [rotMes[i], ...mes12.classes.map((x) => brl(x.valores[i])),
                brl(mes12.classes.reduce((s, x) => s + x.valores[i], 0))]) }}>
              <Colunas rotulos={rotMes} series={mes12.series} empilhar meta={orc} formato="R$" altura={260} rotular="ultimo" />
              <div className="mt-3"><Nota>
                Custo médio mensal no período: <b className="font-medium text-texto-2">{brl(r.total / r.meses)}</b> ({r.meses.toFixed(1).replace(".", ",")} meses).
                {!orc && " Defina o orçamento mensal em Metas e parâmetros (meta do indicador Custo médio mensal)."}
                {" "}Planejada = preventiva, preditiva/inspeção, lubrificação e autônoma; a tabela traz cada classe.
              </Nota></div>
            </Grafico>

            <div className="grid gap-4 lg:grid-cols-2">
              <Grafico titulo="Custo por tipo de ordem" subtitulo="12 maiores" tabela={tabelaSimples("Tipo", porTipo)}>
                <Barras itens={barrasSimples(porTipo)} max={folga(barrasSimples(porTipo))} formato="R$" larguraRotulo={240} />
              </Grafico>
              <Grafico titulo="Custo por área" subtitulo="10 maiores · localização da ordem" tabela={tabelaSimples("Área", porArea)}>
                <Barras itens={barrasSimples(porArea)} max={folga(barrasSimples(porArea))} formato="R$" larguraRotulo={200} />
              </Grafico>
              <Grafico titulo="Custo por centro de trabalho" subtitulo="12 maiores" tabela={tabelaSimples("Centro", porCentro)}>
                <Barras itens={barrasSimples(porCentro)} max={folga(barrasSimples(porCentro))} formato="R$" larguraRotulo={200} />
              </Grafico>
              <Grafico titulo="Pareto de custo por equipamento" subtitulo="Os 12 que mais custaram · laranja = os que somam 80% do gasto"
                legenda={<Legenda series={[{ nome: "Somam 80% do gasto", cor: "serie-2" }, { nome: "Demais", cor: "neutro" }]} />}
                tabela={{ colunas: ["Campo de ordenação", "Código", "Equipamento", "Custo", "% acumulado"],
                  linhas: topEq.map((x) => [campoEq(x.codigo), x.codigo, x.nome, brl(x.custo), `${x.acumulado.toFixed(1).replace(".", ",")}%`]) }}>
                {topEq.length ? (
                  <>
                    <Barras formato="R$" larguraRotulo={260} max={(topEq[0]?.custo ?? 1) * 1.18} itens={topEq.map((x) => ({
                      rotulo: `${campoEq(x.codigo) ? `${campoEq(x.codigo)} · ` : ""}${x.codigo} · ${x.nome.slice(0, 28)}`, valor: x.custo,
                      cor: (x.vital ? "serie-2" : "neutro") as Cor, detalhe: `${x.acumulado.toFixed(0)}% acumulado` }))} />
                    <p className="mt-3 text-[13px] text-texto-2"><b className="num font-medium text-texto">{n0.format(eq.n80)}</b> de {n0.format(eq.linhas.length)} equipamentos
                      com custo respondem por 80% do gasto com equipamento.</p>
                  </>
                ) : <p className="text-[13px] text-texto-3">Nenhuma ordem com equipamento e custo no período.</p>}
              </Grafico>
            </div>
          </Secao>

          <Secao titulo="Equipamentos e ordens" destaque="que mais custaram">
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="min-w-0 rounded-cartao border border-borda bg-superficie p-5">
                <div className="font-display text-[15px] font-medium">Por equipamento</div>
                <div className="mb-4 mt-0.5 text-[12.5px] text-texto-3">200 maiores · clique numa linha para abrir a ficha do equipamento</div>
                <TabelaFicha colunas={COL_EQ} limite={200} baixar="custo_por_equipamento" busca="Buscar equipamento…" colunaCodigo={1} colunaNome={2}
                  linhas={eq.linhas.slice(0, 200).map((x) => [campoEq(x.codigo), x.codigo, x.nome, x.custo, x.ordens, x.backlog, x.medio, x.acumulado])} />
              </div>
              <div className="min-w-0 rounded-cartao border border-borda bg-superficie p-5">
                <div className="font-display text-[15px] font-medium">Por ordem</div>
                <div className="mb-4 mt-0.5 text-[12.5px] text-texto-3">200 ordens mais caras do período</div>
                <TabelaDados colunas={COL_ORD} limite={200} baixar="ordens_mais_caras" busca="Buscar ordem, texto, equipamento…"
                  linhas={topOrd.map((x) => [x.ordem, x.tipoNome, x.natureza, x.texto, campoEq(x.equipChave), x.equipChave, x.custoReal, x.data, x.situacao])} />
              </div>
            </div>
          </Secao>
        </div>
      </details>
    </PaginaWcm>
  );
}
