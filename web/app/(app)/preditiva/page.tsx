import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Barras, Colunas, Grafico, type Cor } from "@/components/graficos";
import { GradeKpis } from "@/components/Indicador";
import { Aviso, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { brl } from "@/lib/formato";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { barra, contexto, dados, resultados, serieMensal } from "@/lib/wcm/contexto";
import { descrever } from "@/lib/wcm/filtros";
import * as ind from "@/lib/wcm/indicadores";
import * as pr from "@/lib/wcm/preditiva";
import { dataBr } from "@/lib/wcm/util";

import { Campos, GradeTiles, LegendaCores, Quadro, Tile } from "../execucao/_ui/Blocos";
import { COR_ANOMALIA } from "../execucao/_ui/cores";
import { horas, int, num } from "../execucao/_ui/fmt";
import { param } from "../execucao/_ui/memo";
import { PontoSituacao, Tabela, type Coluna } from "../execucao/_ui/Tabela";

/** Rótulo do campo de ordenação geral do equipamento (o mesmo das abas Equipamentos e Calendário). */
const ROTULO_CAMPO = "Campo de ordenação";

export const metadata: Metadata = { title: "Preditiva (SEMEQ)" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SERIES: Cor[] = ["serie-1", "serie-2", "serie-3", "serie-4"];

const COLS_FILA: Coluna[] = [
  { id: "codigo", rotulo: "Código", tipo: "codigo", largura: 120 }, { id: "tecnica", rotulo: "Técnica", largura: 150 },
  { id: "achado", rotulo: "Achado", largura: 200 }, { id: "objeto", rotulo: "Objeto técnico", largura: 190 },
  { id: "campo", rotulo: ROTULO_CAMPO }, { id: "equipamento", rotulo: "Equipamento", tipo: "codigo" }, { id: "situacao", rotulo: "Situação", tipo: "situacao", largura: 190 },
  { id: "deteccao", rotulo: "Detecção", tipo: "data" }, { id: "dias", rotulo: "Dias em aberto", tipo: "barra", corBarra: "st-critico", largura: 140 },
  { id: "nota", rotulo: "Nota", tipo: "codigo" }, { id: "ordem", rotulo: "Ordem", tipo: "codigo" }, { id: "status", rotulo: "Status SAP", tipo: "codigo", largura: 140 },
  { id: "fimPrevisto", rotulo: "Fim previsto (data-base)", tipo: "data", largura: 120 }, { id: "centro", rotulo: "Centro de trabalho", tipo: "codigo", largura: 130 },
];
const COLS: Coluna[] = [
  { id: "codigo", rotulo: "Código", tipo: "codigo", largura: 120 }, { id: "tecnica", rotulo: "Técnica", largura: 150 },
  { id: "achado", rotulo: "Achado", largura: 200 }, { id: "situacao", rotulo: "Situação", tipo: "situacao", largura: 190 },
  { id: "status", rotulo: "Status SAP", tipo: "codigo", largura: 140 }, { id: "deteccao", rotulo: "Detecção", tipo: "data" },
  { id: "objeto", rotulo: "Objeto técnico", largura: 190 }, { id: "campo", rotulo: ROTULO_CAMPO }, { id: "equipamento", rotulo: "Equipamento", tipo: "codigo" },
  { id: "area", rotulo: "Área", largura: 100 }, { id: "centro", rotulo: "Centro de trabalho", tipo: "codigo", largura: 130 },
  { id: "nota", rotulo: "Nota", tipo: "codigo" }, { id: "ordem", rotulo: "Ordem", tipo: "codigo" }, { id: "tipo", rotulo: "Tipo", tipo: "codigo", largura: 70 },
  { id: "fimPrevisto", rotulo: "Fim previsto", tipo: "data" }, { id: "fimReal", rotulo: "Fim real", tipo: "data" },
  { id: "diasTratar", rotulo: "Dias para tratar", tipo: "num", largura: 100 }, { id: "dias", rotulo: "Dias em aberto", tipo: "num", largura: 100 },
  { id: "quem", rotulo: "Tratado por", largura: 180 }, { id: "hh", rotulo: "HH apontadas", tipo: "h" }, { id: "custo", rotulo: "Custo real", tipo: "R$" },
];

export default async function Preditiva(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigir("preditiva");
  const params = await props.searchParams;
  const c = await contexto(params);
  const campoEq = await campoDoEquipamento(c);
  const cab = <Cabecalho titulo="Preditiva SEMEQ," destaque="da anomalia detectada à tratativa."
    sobre="IW28 · IW38 · IW47"
    subtitulo="Anomalias apontadas pela preditiva (notas IW28) e a tratativa pelas ordens (IW38): técnica, achado, equipamento, prazo e quem tratou." />;
  if (!c.b.ordens.dados && !c.b.notas.dados) return <PaginaWcm barra={barra(c)}>{cab}<SemDados base="IW38 (ordens)" /></PaginaWcm>;
  const d = await dados(c);
  const an = ind.anomaliasSemeq(d);
  if (!an.length) {
    return (
      <PaginaWcm barra={barra(c)}>{cab}
        <Aviso>Nenhuma nota ou ordem com <b>SEMEQ</b> no texto foi encontrada nas bases carregadas (IW28 e IW38). As anomalias da preditiva são reconhecidas pelo padrão SEMEQ-&lt;técnica&gt;-&lt;nº&gt;-&lt;achado&gt;.</Aviso>
      </PaginaWcm>
    );
  }
  const { ini, fim } = c.f;
  const [[atual, anterior], serie] = await Promise.all([resultados(c), serieMensal(c)]);
  const [aIni, aFim] = ind.periodoAnterior(ini, fim);
  const per = pr.noPeriodo(an, ini, fim);
  const fila = pr.filaAbertas(an);
  const r = pr.indicadores(an, ini, fim);
  const selCod = param(params, "anomalia");
  const sel = selCod ? an.find((a) => a.codigo === selCod) : undefined;

  // gráficos
  const tecs = [...new Set(per.map((a) => a.tecnica))].map((t) => [t, per.filter((a) => a.tecnica === t).length] as const).sort((a, b) => b[1] - a[1]);
  const principais = tecs.slice(0, tecs.length > 4 ? 3 : 4).map(([t]) => t);
  const grupoTec = (t: string) => (principais.includes(t) ? t : "Outras técnicas");
  const nomesSerie = [...principais, ...(tecs.length > principais.length ? ["Outras técnicas"] : [])];
  const pm = pr.porMesTecnica(per);
  const meses = [...new Set(pm.map((x) => x.mes))].sort((a, b) => a - b);
  const mesTxt = new Map(pm.map((x) => [x.mes, x.mesTxt]));
  const seriesMes = nomesSerie.map((n, i) => ({ nome: n, cor: n === "Outras técnicas" ? "neutro" as Cor : SERIES[i],
    valores: meses.map((m) => pm.filter((x) => x.mes === m && grupoTec(x.tecnica) === n).reduce((s, x) => s + x.anomalias, 0)) }));
  const spt = pr.situacaoPorTecnica(per);
  const itensSit = tecs.map(([t, n]) => ({ rotulo: t, valor: n, partes: pr.SITUACOES.map((s) => ({ nome: s, valor: spt.find((x) => x.tecnica === t && x.situacao === s)?.anomalias ?? 0, cor: COR_ANOMALIA[s] })).filter((p) => p.valor) }));
  const sitsUsadas = pr.SITUACOES.filter((s) => spt.some((x) => x.situacao === s));
  const achados = pr.paretoAchados(per);
  const eqs = pr.equipamentosMaisAnomalias(per);

  return (
    <PaginaWcm barra={barra(c)}>
      {cab}
      <p className="max-w-4xl text-[12.5px] leading-relaxed text-texto-3">Uma anomalia = técnica + nº do código SEMEQ (ex.: SEMEQ-AVB-333). A nota registra a detecção e a ordem é a tratativa; o período vale pela data de detecção. Técnicas: AVB = vibração, AOL = análise de óleo, TMP = termografia.</p>

      <Secao titulo="Indicadores" destaque={descrever(ini, fim)} sub={`Variações contra ${descrever(aIni, aFim)} (período anterior de mesma duração). Passe o mouse no nome para ver a fórmula.`}>
        <GradeKpis kpis={ind.KPIS.filter((k) => k.grupo === ind.PREDITIVA)} atual={atual} anterior={anterior} metas={c.cad.metas} serie={serie} link={false} colunas={5} />
        <GradeTiles>
          <Tile rotulo="Equipamentos com anomalia" valor={int(r.semeq_equipamentos)} dica="Equipamentos distintos com anomalia detectada no período." />
          <Tile rotulo="Reincidentes" valor={int(r.semeq_reincidentes)} detalhe="mais de uma anomalia no período" farol={r.semeq_reincidentes ? "amarelo" : "verde"}
            dica="Equipamentos com mais de uma anomalia detectada no período." />
          <Tile rotulo="Custo das tratativas" valor={brl(r.semeq_custo)} dica="Custo real (IW38) das ordens das anomalias detectadas no período." />
          <Tile rotulo="HH apontadas" valor={horas(pr.hhApontadas(per))} detalhe="IW47 nas ordens das anomalias" dica="Horas reais apontadas na IW47 nas ordens das anomalias do período." />
        </GradeTiles>
      </Secao>

      {fila.length > 0 && (
        <Quadro titulo={`${int(fila.length)} anomalia(s) em aberto`}
          subtitulo={`${int(fila.filter((a) => a.situacao === pr.ATRASADA).length)} atrasada(s), ${int(fila.filter((a) => a.situacao === pr.SEM_ORDEM).length)} sem ordem — retrato de hoje, as mais antigas primeiro · clique para ver o detalhe`}>
          <Tabela colunas={COLS_FILA} cores={COR_ANOMALIA} altura={320} contagem="abertas" resumoPor="situacao" arquivo="anomalias_abertas"
            facetas={[{ id: "situacao", rotulo: "Situação", ordem: [...pr.SITUACOES] }, { id: "tecnica", rotulo: "Técnica" }]}
            abrirParam={{ param: "anomalia", campo: "codigo", ancora: "anomalia" }}
            linhas={fila.slice(0, 300).map((a) => ({ codigo: a.codigo, tecnica: a.tecnica, achado: a.achado, objeto: a.objeto, campo: campoEq(a.equipamento), equipamento: a.equipamento,
              situacao: a.situacao, deteccao: a.deteccao, dias: a.diasEmAberto, nota: a.nota, ordem: a.ordem, status: a.statusSap,
              fimPrevisto: a.fimPrevisto, centro: a.centroTrabalho }))} />
        </Quadro>
      )}

      {per.length > 0 && (
        <Secao titulo="Onde e o quê" destaque="anomalias detectadas no período">
          <div className="grid gap-4 lg:grid-cols-2">
            <Grafico titulo="Anomalias por mês" subtitulo="Pela data de detecção, por técnica"
              legenda={<LegendaCores itens={seriesMes.map((s) => [s.nome, s.cor])} />}
              tabela={{ colunas: ["Mês", ...nomesSerie], linhas: meses.map((m, i) => [mesTxt.get(m) ?? "", ...seriesMes.map((s) => s.valores[i])]) }}>
              <Colunas rotulos={meses.map((m) => mesTxt.get(m) ?? "")} series={seriesMes} empilhar formato="inteiro" rotular="todos" />
            </Grafico>
            <Grafico titulo="Situação por técnica" subtitulo="Quantas já foram tratadas, estão em tratativa, atrasadas ou sem ordem"
              legenda={<LegendaCores itens={sitsUsadas.map((s) => [s, COR_ANOMALIA[s]])} />}
              tabela={{ colunas: ["Técnica", ...sitsUsadas], linhas: tecs.map(([t]) => [t, ...sitsUsadas.map((s) => spt.find((x) => x.tecnica === t && x.situacao === s)?.anomalias ?? 0)]) }}>
              <Barras itens={itensSit} formato="inteiro" larguraRotulo={170} />
            </Grafico>
            <Grafico titulo="Pareto dos achados" subtitulo="Modos de falha mais apontados (12 maiores)"
              tabela={{ colunas: ["Achado", "Anomalias"], linhas: achados.map((x) => [x.achado, x.anomalias]) }}>
              <Barras itens={achados.map((x) => ({ rotulo: x.achado, valor: x.anomalias, cor: "serie-2" as Cor }))} formato="inteiro" larguraRotulo={210} />
            </Grafico>
            <Grafico titulo="Equipamentos com mais anomalias" subtitulo="Reincidência no período · em aberto × encerradas"
              legenda={<LegendaCores itens={[["Em aberto", "serie-2"], ["Encerradas", "serie-1"]]} />}
              tabela={{ colunas: [ROTULO_CAMPO, "Equipamento", "Nome", "Anomalias", "Em aberto"], linhas: eqs.map((x) => [campoEq(x.equipamento) || "—", x.equipamento, x.nome, x.anomalias, x.abertas]) }}>
              {eqs.length ? <Barras formato="inteiro" larguraRotulo={210} itens={eqs.map((x) => ({ rotulo: x.nome || x.equipamento, detalhe: x.equipamento, valor: x.anomalias,
                partes: [{ nome: "Encerradas", valor: x.anomalias - x.abertas, cor: "serie-1" as Cor }, { nome: "Em aberto", valor: x.abertas, cor: "serie-2" as Cor }] }))} />
                : <p className="text-[13px] text-texto-3">Nenhuma anomalia com equipamento no período.</p>}
            </Grafico>
          </div>
        </Secao>
      )}

      <Secao titulo="Anomalias" sub="Clique numa linha para ver a anomalia completa e abrir a ficha do equipamento.">
        <Tabela colunas={COLS} cores={COR_ANOMALIA} contagem="anomalias" resumoPor="situacao" arquivo="anomalias_semeq" altura={480}
          busca={{ campos: ["codigo", "achado", "equipamento", "campo", "objeto", "nota", "ordem", "quem"], placeholder: "código, achado, equipamento, nota, ordem…" }}
          facetas={[{ id: "tecnica", rotulo: "Técnica" }, { id: "situacao", rotulo: "Situação", ordem: [...pr.SITUACOES] }]}
          alternancias={[{ id: "per", rotulo: "Só detectadas no período", campo: "noPeriodo", padrao: true, dica: "Desligue para ver as anomalias de todas as datas." }]}
          abrirParam={{ param: "anomalia", campo: "codigo", ancora: "anomalia" }}
          linhas={an.map((a) => ({ codigo: a.codigo, tecnica: a.tecnica, achado: a.achado, situacao: a.situacao, status: a.statusSap, deteccao: a.deteccao,
            objeto: a.objeto, campo: campoEq(a.equipamento), equipamento: a.equipamento, area: a.area, centro: a.centroTrabalho, nota: a.nota, ordem: a.ordem, tipo: a.tipo,
            fimPrevisto: a.fimPrevisto, fimReal: a.fimReal, diasTratar: a.diasParaTratar, dias: a.diasEmAberto, quem: a.tratadoPor,
            hh: a.hhApontadas, custo: a.custoReal || null, noPeriodo: a.deteccao != null && a.deteccao >= ini && a.deteccao <= fim ? 1 : null }))} />
      </Secao>

      {sel && (
        <Quadro id="anomalia" titulo={`Anomalia ${sel.codigo}`} subtitulo={sel.texto}
          acoes={sel.equipamento ? (
            <Link href={`/equipamentos?eq=${encodeURIComponent(sel.equipamento)}`} className="inline-flex items-center gap-1 text-[13px] text-texto-2 hover:text-texto">
              Abrir ficha de {sel.equipamento} <ArrowRight className="size-3.5" />
            </Link>) : undefined}>
          <div className="mb-4"><PontoSituacao nome={sel.situacao} cor={COR_ANOMALIA[sel.situacao]} /></div>
          <Campos itens={[["Técnica", sel.tecnica], ["Achado", sel.achado], [ROTULO_CAMPO, campoEq(sel.equipamento) || "—"], ["Equipamento", [sel.equipamento, sel.objeto].filter(Boolean).join(" · ")],
            ["Área", sel.area], ["Centro de trabalho", sel.centroTrabalho], ["Detecção", dataBr(sel.deteccao)], ["Nota (detecção)", sel.nota],
            ["Ordem (tratativa)", sel.ordem ? `${sel.ordem}${sel.tipo ? ` · ${sel.tipo}` : ""}` : "sem ordem"], ["Status SAP", sel.statusSap],
            ["Fim previsto (data-base)", dataBr(sel.fimPrevisto)], ["Fim real", dataBr(sel.fimReal)], ["Dias para tratar", num(sel.diasParaTratar, 0)],
            ["Dias em aberto", num(sel.diasEmAberto, 0)], ["Tratado por", sel.tratadoPor], ["HH apontadas", horas(sel.hhApontadas, 1)], ["Custo real", brl(sel.custoReal)]]} />
        </Quadro>
      )}
    </PaginaWcm>
  );
}

