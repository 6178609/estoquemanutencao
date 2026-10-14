import type { Metadata } from "next";

import { Colunas, Grafico, Linhas } from "@/components/graficos";
import { PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { brl } from "@/lib/formato";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import * as ct from "@/lib/wcm/confiabilidadeTipos";
import { barra, contexto, dados } from "@/lib/wcm/contexto";
import * as ind from "@/lib/wcm/indicadores";
import { dataBr } from "@/lib/wcm/util";

import { Nota, Numeros } from "../confiabilidade/_comum/Numeros";
import { TabelaDados, type Coluna } from "../confiabilidade/_comum/TabelaDados";
import { Controles } from "../planos/_comum/Controles";
import { lista } from "../planos/_comum/params";

export const metadata: Metadata = { title: "MTBF e MTTR por tipo de ordem" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dias = (v: number | null) => (v == null ? "—" : `${n1.format(v)} d`);
const horas = (v: number | null) => (v == null ? "—" : `${n1.format(v)} h`);
const pct = (v: number | null) => (v == null ? "—" : `${n1.format(v)}%`);

const FORMULA_MTBF = "Dias do período × equipamentos com ordem ÷ ordens (a mesma conta da quebra).";
const FORMULA_MTTR = "Média das horas de reparo das ordens: IW47 (HH ÷ pessoas que apontaram); sem IW47, Σ(trabalho ÷ pessoas) das operações no IW38OP.";

const COLS_TIPO: Coluna[] = [
  { rotulo: "Tipo", formato: "codigo" }, { rotulo: "Descrição", largo: true }, { rotulo: "Classe" },
  { rotulo: "Ordens", formato: "inteiro" }, { rotulo: "Equipamentos", formato: "inteiro" },
  { rotulo: "MTBF (dias)", formato: "num1", dica: FORMULA_MTBF }, { rotulo: "MTTR (h)", formato: "num1", dica: FORMULA_MTTR },
  { rotulo: "Disponibilidade", formato: "%" }, { rotulo: "Horas de reparo", formato: "h" }, { rotulo: "Custo real", formato: "R$" },
  { rotulo: "Ordens com horas", formato: "%" },
];
const COLS_EQUIP: Coluna[] = [
  { rotulo: "Campo de ordenação" }, { rotulo: "Código", formato: "codigo" }, { rotulo: "Equipamento", largo: true }, { rotulo: "Tipos" },
  { rotulo: "Ordens", formato: "inteiro" }, { rotulo: "MTBF (dias)", formato: "num1", dica: "Dias do período ÷ ordens do equipamento." },
  { rotulo: "MTTR (h)", formato: "num1", dica: FORMULA_MTTR }, { rotulo: "Disponibilidade", formato: "%" },
  { rotulo: "Horas de reparo", formato: "h" }, { rotulo: "Custo real", formato: "R$" }, { rotulo: "Última ordem", formato: "data" },
];

/** A coluna Ordens ganha a barra de magnitude (o máximo é o da primeira linha, a com mais ordens). */
const comBarra = (cols: Coluna[], max = 1) => cols.map((c) => (c.rotulo === "Ordens" ? { ...c, barra: max } : c));

export default async function ConfiabilidadeTipos(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigir("confiabilidade_tipos");
  const params = await props.searchParams;
  const c = await contexto(params);
  const titulo = <Cabecalho titulo="MTBF e MTTR," destaque="por tipo de ordem." sobre="Manutenção Profissional"
    subtitulo="Os mesmos indicadores da Confiabilidade (que vale para a quebra Y1 → YM11) para os outros tipos de ordem do IW38: corretiva, preventiva, lubrificação… Escolha os tipos abaixo." />;
  if (!c.b.ordens.dados) return <PaginaWcm barra={barra(c)}>{titulo}<SemDados base="IW38 (ordens)" /></PaginaWcm>;

  const [d, campoEq] = await Promise.all([dados(c), campoDoEquipamento(c)]);
  const disponiveis = ct.tiposDisponiveis(d.ordens);
  const escolhidos = ct.tiposEscolhidos(lista(params, "tord"), disponiveis.map((t) => t.tipo));
  const rep = ind.horasReparoPorOrdem(d.oper, d.confTodos ?? d.conf);
  const todos = ct.eventos(d.ordens, new Set(escolhidos), rep);
  const ini = c.f.ini, fim = Math.min(c.f.fim, c.b.hoje);
  const nDias = Math.max(fim - ini + 1, 0);
  const ev = ct.noPeriodo(todos, ini, fim);
  const r = ct.resumir(ev, nDias);
  const serie = ct.mensal(todos, fim, c.b.hoje);
  const rotMes = serie.map((s, i) => ind.mesTxt(s.mes) + (i === serie.length - 1 && c.f.fim >= c.b.hoje ? "*" : ""));
  const desc = (t: string) => d.tipos[t]?.descricao ?? "";
  const tipos = ct.porTipo(ev, nDias), equips = ct.porEquipamento(ev, nDias);

  const controles = (
    <Controles controles={[{
      tipo: "multi", chave: "tord", rotulo: "Tipos de ordem", valor: lista(params, "tord").filter((t) => disponiveis.some((x) => x.tipo === t)),
      opcoes: disponiveis.map((t) => ({ valor: t.tipo, rotulo: desc(t.tipo) ? `${t.tipo} · ${desc(t.tipo)}` : t.tipo, n: t.n })),
    }]} />
  );
  const rotTipos = escolhidos.length > 6 ? `${escolhidos.length} tipos` : escolhidos.join(", ");

  return (
    <PaginaWcm barra={barra(c)}>
      {titulo}
      <Secao titulo="Tipos de ordem" destaque={`· ${rotTipos || "nenhum"}`}
        sub={`Sem escolha, entram todos os tipos menos o ${ct.TIPO_QUEBRA} (quebra, que está na aba Confiabilidade). Recorte: ${c.recorte}.`}>
        {controles}
      </Secao>
      {!ev.length ? (
        <p className="rounded-cartao border border-borda bg-superficie-2 px-5 py-4 text-[14px] text-texto-2">
          Nenhuma ordem desses tipos com equipamento no período. Amplie o período ou escolha outros tipos.
        </p>
      ) : (
        <>
          <Secao titulo="Indicadores" destaque="do período" sub="Passe o mouse no nome do indicador para ver a fórmula.">
            <Numeros colunas={5} itens={[
              { rotulo: "Ordens", valor: n0.format(r.ordens), detalhe: `${n0.format(r.equipamentos)} equipamentos`, dica: "Ordens dos tipos escolhidos, não canceladas, com equipamento, pela data da ordem." },
              { rotulo: "MTBF", valor: dias(r.mtbf), detalhe: "dias entre ordens", dica: FORMULA_MTBF },
              { rotulo: "MTTR", valor: horas(r.mttr), detalhe: "horas de reparo por ordem", dica: FORMULA_MTTR },
              { rotulo: "Disponibilidade", valor: pct(r.disponibilidade), detalhe: "MTBF ÷ (MTBF + MTTR)", dica: "MTBF em horas (dias × 24) ÷ (MTBF + MTTR)." },
              { rotulo: "Custo real", valor: brl(r.custo), detalhe: `${pct(r.cobertura)} das ordens com horas` },
            ]} />
          </Secao>
          <Secao titulo="Evolução" destaque="mês a mês">
            <div className="grid gap-4 lg:grid-cols-3">
              <Grafico titulo="Ordens por mês" subtitulo="12 meses · * mês em andamento"
                tabela={{ colunas: ["Mês", "Ordens"], linhas: serie.map((s, i) => [rotMes[i], s.resumo.ordens]) }}>
                <Colunas rotulos={rotMes} series={[{ nome: "Ordens", valores: serie.map((s) => s.resumo.ordens), cor: "serie-1" }]} formato="inteiro" altura={200} />
              </Grafico>
              <Grafico titulo="MTBF por mês" subtitulo="Dias entre ordens" dica={FORMULA_MTBF}
                tabela={{ colunas: ["Mês", "MTBF", "Disponibilidade"], linhas: serie.map((s, i) => [rotMes[i], dias(s.resumo.mtbf), pct(s.resumo.disponibilidade)]) }}>
                <Linhas rotulos={rotMes} series={[{ nome: "MTBF", valores: serie.map((s) => s.resumo.mtbf), cor: "serie-1" }]} formato="dias" altura={200} area />
              </Grafico>
              <Grafico titulo="MTTR por mês" subtitulo="Horas de reparo por ordem" dica={FORMULA_MTTR}
                tabela={{ colunas: ["Mês", "MTTR"], linhas: serie.map((s, i) => [rotMes[i], horas(s.resumo.mttr)]) }}>
                {serie.some((s) => s.resumo.mttr != null)
                  ? <Linhas rotulos={rotMes} series={[{ nome: "MTTR", valores: serie.map((s) => s.resumo.mttr), cor: "serie-2" }]} formato="h" altura={200} area />
                  : <p className="text-[13px] text-texto-3">Sem horas de reparo (IW47 ou IW38OP) dessas ordens.</p>}
              </Grafico>
            </div>
            <Nota>Cobertura: {pct(r.cobertura)} das ordens do período têm horas de reparo (apontamento na IW47 ou trabalho no IW38OP); o MTTR usa só essas.</Nota>
          </Secao>
          <Secao titulo="Por tipo" destaque="de ordem" sub="Cada tipo com o seu MTBF e MTTR no período.">
            <TabelaDados colunas={comBarra(COLS_TIPO, tipos[0]?.ordens)} baixar="mtbf_mttr_por_tipo" ordemInicial={{ coluna: 3, desc: true }}
              linhas={tipos.map((t) => [t.tipo, desc(t.tipo), ind.classeTipo(t.tipo, d.tipos), t.ordens, t.equipamentos, t.mtbf, t.mttr,
                t.disponibilidade, t.horas, t.custo, t.cobertura])} />
          </Secao>
          <Secao titulo="Por equipamento" destaque={`· ${n0.format(r.equipamentos)} com ordem`} sub="MTBF = dias do período ÷ ordens do equipamento. Baixe em CSV para abrir no Excel.">
            <TabelaDados colunas={comBarra(COLS_EQUIP, equips[0]?.ordens)} colunaChave={1} baixar="mtbf_mttr_por_equipamento" limite={500} ordemInicial={{ coluna: 4, desc: true }}
              busca="Buscar: campo de ordenação, código, equipamento, tipo…"
              linhas={equips.map((e) => [campoEq(e.equip), e.equip, e.nome, e.tipos, e.ordens, e.mtbf, e.mttr, e.disponibilidade,
                e.horas, e.custo, e.ultima])} />
            <Nota>Período: {dataBr(ini)} a {dataBr(fim)} ({n0.format(nDias)} dias).</Nota>
          </Secao>
        </>
      )}
    </PaginaWcm>
  );
}
