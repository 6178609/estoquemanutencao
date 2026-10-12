import type { Metadata } from "next";

import { Barras, Colunas, Grafico, Legenda, type Cor } from "@/components/graficos";
import { GradeKpis } from "@/components/Indicador";
import { PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { brl, brlCurto } from "@/lib/formato";
import { barra, contexto, dados, resultados, serieMensal } from "@/lib/wcm/contexto";
import * as ind from "@/lib/wcm/indicadores";
import { inicioDoMes, somarMeses } from "@/lib/wcm/util";

import { Nota, Numeros } from "../confiabilidade/_comum/Numeros";
import { TabelaDados, type Coluna } from "../confiabilidade/_comum/TabelaDados";
import { TabelaFicha } from "../confiabilidade/_comum/TabelaFicha";
import { custoPor, ordensDoPeriodo, porEquipamento, porMes, resumo } from "./calculo";

export const metadata: Metadata = { title: "Custos" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b ? `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format((a / b) * 100)}%` : "—");

const COL_EQ: Coluna[] = [
  { rotulo: "Código", formato: "codigo" }, { rotulo: "Equipamento", largo: true }, { rotulo: "Custo", formato: "R$" },
  { rotulo: "Ordens", formato: "inteiro" }, { rotulo: "Backlog", formato: "inteiro", dica: "Ordens sem plano de manutenção" },
  { rotulo: "Custo médio por ordem", formato: "R$" }, { rotulo: "% acumulado", formato: "%" },
];
const COL_ORD: Coluna[] = [
  { rotulo: "Ordem", formato: "codigo" }, { rotulo: "Tipo" }, { rotulo: "Natureza" }, { rotulo: "Texto", largo: true },
  { rotulo: "Equipamento", formato: "codigo" }, { rotulo: "Custo real", formato: "R$" }, { rotulo: "Data", formato: "data" }, { rotulo: "Situação" },
];

export default async function Custos(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigir("custos");
  const params = await props.searchParams;
  const c = await contexto(params);
  const titulo = <Cabecalho titulo="Custos," destaque="quanto custa manter a fábrica rodando." sobre="Manutenção Profissional"
    subtitulo="Custo real das ordens (IW38) por mês, classe de manutenção, tipo, área, centro de trabalho e equipamento. Ordens canceladas não entram." />;
  if (!c.b.ordens.dados) return <PaginaWcm barra={barra(c)}>{titulo}<SemDados base="IW38 (ordens)" /></PaginaWcm>;

  const [[atual, anterior], serie, d] = await Promise.all([resultados(c), serieMensal(c), dados(c)]);
  const metas = c.cad.metas;
  const { ini, fim } = c.f;
  const o = ordensDoPeriodo(d.ordens, ini, fim, c.tipos);
  const kpis = ind.KPIS.filter((k) => k.grupo === ind.CUSTOS);
  const cabeca = (
    <>
      {titulo}
      <Secao titulo="Indicadores" destaque="de custo" sub={`Recorte: ${c.recorte}. Passe o mouse no nome do indicador para ver a fórmula.`}>
        <GradeKpis kpis={kpis} atual={atual} anterior={anterior} metas={metas} serie={serie} link={false} colunas={3} />
      </Secao>
    </>
  );
  if (!o.length) return <PaginaWcm barra={barra(c)}>{cabeca}<p className="text-[14px] text-texto-3">Sem ordens no recorte.</p></PaginaWcm>;

  const r = resumo(o, ini, fim);
  const emerg = ind.temEmergencial(d);
  // custo por mês: o período, com no mínimo os 12 meses até o fim dele (contexto da tendência)
  const iniMes = Math.min(ini, somarMeses(inicioDoMes(fim), -11));
  const mes = porMes(ordensDoPeriodo(d.ordens, iniMes, fim, c.tipos), iniMes, fim);
  const rotMes = mes.meses.map(ind.mesTxt);
  const orc = ind.meta(ind.POR_ID.custo, metas);
  const porTipo = custoPor(o, (x) => x.tipoNome, 12);
  const porArea = custoPor(o, (x) => x.localizacao, 10, "—");
  const porCentro = custoPor(o, (x) => x.centroTrabalho, 12, "—");
  const eq = porEquipamento(o);
  const topEq = eq.linhas.slice(0, 12);
  const topOrd = [...o].sort((a, b) => b.custoReal - a.custoReal).slice(0, 200);
  const folga = (xs: { valor: number }[]) => Math.max(1, ...xs.map((x) => x.valor)) * 1.18; // espaço para o rótulo "R$ 69 mil" na ponta
  const barrasSimples = (xs: [string, number][]) => xs.map(([rotulo, valor]) => ({ rotulo, valor, cor: "serie-1" as Cor }));
  const tabelaSimples = (nome: string, xs: [string, number][]) => ({ colunas: [nome, "Custo"], linhas: xs.map(([k, v]) => [k, brl(v)]) });

  return (
    <PaginaWcm barra={barra(c)}>
      {cabeca}
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
          dica={ind.POR_ID.custo.formula} legenda={<Legenda series={mes.series} />}
          tabela={{ colunas: ["Mês", ...mes.classes.map((x) => x.classe), "Total"], linhas: mes.meses.map((_, i) => [rotMes[i], ...mes.classes.map((x) => brl(x.valores[i])),
            brl(mes.classes.reduce((s, x) => s + x.valores[i], 0))]) }}>
          <Colunas rotulos={rotMes} series={mes.series} empilhar meta={orc} formato="R$" altura={260} rotular="ultimo" />
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
            tabela={{ colunas: ["Código", "Equipamento", "Custo", "% acumulado"], linhas: topEq.map((x) => [x.codigo, x.nome, brl(x.custo), `${x.acumulado.toFixed(1).replace(".", ",")}%`]) }}>
            {topEq.length ? (
              <>
                <Barras formato="R$" larguraRotulo={260} max={(topEq[0]?.custo ?? 1) * 1.18} itens={topEq.map((x) => ({ rotulo: `${x.codigo} · ${x.nome.slice(0, 28)}`, valor: x.custo,
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
            <TabelaFicha colunas={COL_EQ} limite={200} baixar="custo_por_equipamento" busca="Buscar equipamento…"
              linhas={eq.linhas.slice(0, 200).map((x) => [x.codigo, x.nome, x.custo, x.ordens, x.backlog, x.medio, x.acumulado])} />
          </div>
          <div className="min-w-0 rounded-cartao border border-borda bg-superficie p-5">
            <div className="font-display text-[15px] font-medium">Por ordem</div>
            <div className="mb-4 mt-0.5 text-[12.5px] text-texto-3">200 ordens mais caras do período</div>
            <TabelaDados colunas={COL_ORD} limite={200} baixar="ordens_mais_caras" busca="Buscar ordem, texto, equipamento…"
              linhas={topOrd.map((x) => [x.ordem, x.tipoNome, x.natureza, x.texto, x.equipChave, x.custoReal, x.data, x.situacao])} />
          </div>
        </div>
      </Secao>
    </PaginaWcm>
  );
}
