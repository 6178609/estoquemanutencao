import type { Metadata } from "next";

import { Barras, Colunas, Grafico, Legenda, type Cor } from "@/components/graficos";
import { GradeKpis } from "@/components/Indicador";
import { PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { inteiro } from "@/lib/formato";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { barra, contexto, resultados, serieMensal } from "@/lib/wcm/contexto";
import { descrever } from "@/lib/wcm/filtros";
import * as ind from "@/lib/wcm/indicadores";
import type { Nota } from "@/lib/wcm/preparo";
import { Baixar, query } from "../ordens/_comum/Baixar";
import { FiltrosLocais } from "../ordens/_comum/FiltrosLocais";
import { Numeros } from "../ordens/_comum/Numeros";
import { TabelaDados } from "../ordens/_comum/TabelaDados";
import { eixoTempo } from "../ordens/_comum/tempo";
import { faixaDe, paginar, type Params } from "../ordens/_comum/url";
import { COLUNAS, FAIXAS_IDADE, type CampoFn, comCampo, linha, notasDaPagina, ordenarNotas } from "./dados";

export const metadata: Metadata = { title: "Notas" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KPIS = ["quebras", "quebras_a", "reincidencia", "notas_7d"];
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%`.replace(".", ",") : "—");

export default async function Notas(props: { searchParams: Promise<Params> }) {
  await exigir("notas");
  const params = await props.searchParams;
  const c = await contexto(params);
  if (!c.b.notas.dados) return <PaginaWcm barra={barra(c)}><Cabecalho titulo="Notas de manutenção" /><SemDados base="IW28 (notas)" /></PaginaWcm>;
  const temOrdens = !!c.b.ordens.dados;
  const [[atual, anterior], serie] = temOrdens ? await Promise.all([resultados(c), serieMensal(c)]) : [[{}, {}], []] as const;
  const { base, filtradas } = notasDaPagina(c, params);
  const campoEq = await campoDoEquipamento(c);
  const { lista, ord, desc } = ordenarNotas(comCampo(filtradas, campoEq), params);
  const { itens, pagina, paginas } = paginar(lista, params.pag);

  const contar = (f: (n: Nota) => string) => {
    const m = new Map<string, number>();
    for (const n of base) { const v = f(n); if (v) m.set(v, (m.get(v) ?? 0) + 1); }
    return m;
  };
  const tipos = contar((n) => n.tipoNota), abcs = contar((n) => n.codigoAbc);
  const semOrdem = filtradas.filter((n) => !n.comOrdem);
  const quebras = filtradas.filter((n) => n.quebra).length;
  const classeA = filtradas.filter((n) => n.codigoAbc === "A").length;

  return (
    <PaginaWcm barra={barra(c)}>
      <Cabecalho titulo="Notas de manutenção," destaque="o que a fábrica pediu e ainda espera." sobre="IW28 · Confiabilidade"
        subtitulo="Pedidos e falhas registrados pela fábrica: o que ainda não virou ordem, o que parou máquina e onde se repete." />

      {temOrdens && (
        <Secao titulo="Indicadores" destaque="do recorte" sub="Quebra = nota Y1 convertida em ordem YM11 (regra da planta). Passe o mouse no nome para ver a fórmula.">
          <GradeKpis kpis={KPIS.map((id) => ind.POR_ID[id])} atual={atual as ind.Resultado} anterior={anterior as ind.Resultado}
            metas={c.cad.metas} serie={serie as { mes: number; valores: ind.Resultado }[]} link={false} />
        </Secao>
      )}

      <Secao titulo="Notas" destaque="do filtro" acoes={<Baixar href={`/api/notas?${query(params, ["pag"])}`}>Baixar notas (CSV)</Baixar>}>
        <FiltrosLocais campos={[
          { tipo: "busca", chave: "q", placeholder: "Nº da nota ou ordem, descrição, equipamento, notificador, local…" },
          { tipo: "multi", chave: "tipo_nota", rotulo: "Tipo de nota", opcoes: [...tipos.keys()].sort().map((v) => ({ valor: v, n: tipos.get(v) })) },
          { tipo: "multi", chave: "abc", rotulo: "Criticidade ABC", opcoes: ["A", "B", "C"].filter((a) => abcs.has(a)).map((v) => ({ valor: v, n: abcs.get(v) })) },
          { tipo: "alternar", chave: "sem", rotulo: "Só sem ordem", dica: "Notas que ainda não viraram ordem de manutenção" },
          { tipo: "alternar", chave: "par", rotulo: "Só quebras", dica: "Quebra = nota Y1 convertida em ordem YM11 (regra da planta)" },
        ]} />

        <Numeros itens={[
          { rotulo: "Notas", valor: inteiro(filtradas.length), detalhe: descrever(c.f.ini, c.f.fim) },
          { rotulo: "Sem ordem", valor: inteiro(semOrdem.length), detalhe: `${pct(semOrdem.length, filtradas.length)} das notas`, dica: "Ainda não viraram ordem: é a fila de pedidos da fábrica." },
          { rotulo: "Sem ordem há mais de 7 dias", valor: inteiro(semOrdem.filter((n) => (n.dias ?? 0) > 7).length), alerta: semOrdem.some((n) => (n.dias ?? 0) > 7) },
          { rotulo: "Quebras", valor: inteiro(quebras), detalhe: `${pct(quebras, filtradas.length)} das notas`, dica: "Notas Y1 convertidas em ordem YM11 (regra da planta)." },
          { rotulo: "Em equipamento classe A", valor: inteiro(classeA), detalhe: `${pct(classeA, filtradas.length)} das notas`, dica: "Código ABC = A no IW28" },
        ]} />

        {filtradas.length > 0 && <Graficos xs={filtradas} ini={c.f.ini} fim={c.f.fim} campoEq={campoEq} />}

        <TabelaDados colunas={COLUNAS} linhas={itens.map(linha)} params={params} ord={ord} desc={desc} pagina={pagina} paginas={paginas}
          total={lista.length} rotulo="notas" vazio="Nenhuma nota no filtro." />
        <p className="text-[12px] text-texto-3">Mais recentes primeiro · clique no cabeçalho para ordenar.</p>
      </Secao>
    </PaginaWcm>
  );
}

const CORES: Cor[] = ["serie-1", "serie-2", "serie-3", "serie-4"];

function Graficos({ xs, ini, fim, campoEq }: { xs: Nota[]; ini: number; fim: number; campoEq: CampoFn }) {
  // por tempo, por tipo de nota (os 3 mais frequentes + "Outros")
  const eixo = eixoTempo(ini, fim);
  const freq = new Map<string, number>();
  for (const n of xs) freq.set(n.tipoNota || "(sem tipo)", (freq.get(n.tipoNota || "(sem tipo)") ?? 0) + 1);
  const ordem = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const principais = ordem.length <= 4 ? ordem : ordem.slice(0, 3);
  const nomes = ordem.length <= 4 ? principais : [...principais, "Outros"];
  const series = nomes.map((nome, i) => ({ nome, cor: CORES[i], valores: eixo.rotulos.map(() => 0 as number | null) }));
  for (const n of xs) {
    const i = eixo.indice(n.data);
    if (i < 0) continue;
    let j = nomes.indexOf(n.tipoNota || "(sem tipo)");
    if (j < 0) j = nomes.length - 1;
    series[j].valores[i] = (series[j].valores[i] ?? 0) + 1;
  }

  // reincidência: equipamentos com mais notas
  const porEq = new Map<string, { nome: string; notas: number; quebras: number }>();
  for (const n of xs) {
    if (!n.equipChave) continue;
    const e = porEq.get(n.equipChave) ?? { nome: n.objeto || n.equipChave, notas: 0, quebras: 0 };
    e.notas++; if (n.quebra) e.quebras++;
    porEq.set(n.equipChave, e);
  }
  const top = [...porEq.entries()].sort((a, b) => b[1].notas - a[1].notas).slice(0, 10);

  // fila sem ordem por idade
  const fila = FAIXAS_IDADE.map(() => 0);
  for (const n of xs) if (!n.comOrdem && n.dias != null) fila[faixaDe(n.dias, FAIXAS_IDADE)]++;
  const STATUS: Cor[] = ["st-bom", "st-atencao", "st-serio", "st-critico"];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Grafico className="min-w-0" titulo={`Notas por ${eixo.porSemana ? "semana" : "mês"}`} subtitulo="Por tipo de nota, pela data da nota"
        legenda={<Legenda series={series} />}
        tabela={{ colunas: [eixo.porSemana ? "Semana de" : "Mês", ...nomes], linhas: eixo.rotulos.map((r, i) => [r, ...series.map((s) => s.valores[i] ?? 0)]) }}>
        <Colunas rotulos={eixo.rotulos} series={series} empilhar formato="inteiro" altura={240} />
      </Grafico>
      <Grafico className="min-w-0" titulo="Equipamentos com mais notas" subtitulo="Reincidência · laranja = quebras"
        legenda={<Legenda series={[{ nome: "Outras notas", cor: "serie-1" }, { nome: "Quebras", cor: "serie-2" }]} />}
        tabela={{ colunas: ["Equipamento", "Campo de ordenação", "Código", "Notas", "Quebras"], linhas: top.map(([k, v]) => [v.nome, campoEq(k), k, v.notas, v.quebras]) }}>
        {top.length ? <Barras larguraRotulo={190} formato="inteiro" itens={top.map(([k, v]) => ({ rotulo: v.nome, valor: v.notas, detalhe: `${campoEq(k) ? campoEq(k) + " · " : ""}${k}`,
          partes: [{ nome: "Outras notas", valor: v.notas - v.quebras, cor: "serie-1" }, { nome: "Quebras", valor: v.quebras, cor: "serie-2" }] }))} />
          : <p className="text-[13px] text-texto-3">Notas sem equipamento informado.</p>}
      </Grafico>
      <Grafico className="min-w-0 lg:col-span-2" titulo="Fila sem ordem por idade" subtitulo="Notas do filtro que ainda não viraram ordem, por dias desde a nota"
        tabela={{ colunas: ["Idade", "Notas sem ordem"], linhas: FAIXAS_IDADE.map(([r], i) => [r, fila[i]]) }}>
        {fila.some(Boolean) ? <Barras formato="inteiro" larguraRotulo={130} itens={FAIXAS_IDADE.map(([r], i) => ({ rotulo: r, valor: fila[i], cor: STATUS[i] }))} />
          : <p className="text-[13px] text-texto-3">Todas as notas do filtro já têm ordem.</p>}
      </Grafico>
    </div>
  );
}
