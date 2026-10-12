import Link from "next/link";
import type { Metadata } from "next";

import { Barras, Colunas, Grafico, Linhas, Partes } from "@/components/graficos";
import { AbasVisao, Aviso, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { barra, contexto } from "@/lib/wcm/contexto";
import * as ex from "@/lib/wcm/execucao";
import { descrever } from "@/lib/wcm/filtros";
import { dataBr } from "@/lib/wcm/util";

import { GradeTiles, LegendaCores, Nota, Opcoes, Quadro, Tile, variacaoPp } from "./_ui/Blocos";
import { COR_ATIVIDADE, farolPct } from "./_ui/cores";
import { horas, int, num, pct } from "./_ui/fmt";
import { param } from "./_ui/memo";
import { Tabela, type Coluna } from "./_ui/Tabela";
import { semanasGrafico, topPessoas } from "./calculos";
import { execucaoDoRecorte } from "./dados";

export const metadata: Metadata = { title: "Execução das atividades" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VISOES = ["Visão geral", "Quem fez o quê", "Atividades"];
const AGRUPAR = [{ valor: "setor", rotulo: "Setor" }, { valor: "centroTrabalho", rotulo: "Centro de trabalho" }];
const MAX_LINHAS = 5000;

export default async function Execucao(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigir("execucao");
  const params = await props.searchParams;
  const c = await contexto(params);
  const cab = <Cabecalho titulo="Execução das atividades," destaque="programado × executado e quem fez o quê."
    sobre="IW38 · IW38OP × IW47"
    subtitulo="Atividade = operação do IW38OP pela data programada (1ª data de início). Executada = operação confirmada ou com apontamento na IW47. A taxa considera só o que já venceu (até hoje)." />;
  if (!c.b.operacoes.dados) return <PaginaWcm barra={barra(c)}>{cab}<SemDados base="IW38OP (operações)" /></PaginaWcm>;

  const { ini, fim } = c.f, hoje = c.b.hoje;
  const { ops, ap, ordens } = execucaoDoRecorte(c);
  const r = ex.indicadores(ops, ordens, ap, ini, fim, hoje);
  const [aIni, aFim] = ex.periodoAnterior(ini, fim);
  const ra = ex.indicadores(ops, ordens, ap, aIni, aFim, hoje);
  const temIw47 = c.b.confirmacoes.dados != null;
  const visao = VISOES.includes(param(params, "visao")) ? param(params, "visao") : VISOES[0];
  const jan = r.janela_iw47;
  const txtJan = jan ? ` (executadas entre ${dataBr(jan[0])} e ${dataBr(jan[1])}, período coberto pela IW47)` : "";

  return (
    <PaginaWcm barra={barra(c)}>
      {cab}
      <Secao titulo="Resultado do período" destaque={descrever(ini, fim)}
        sub={`Variações contra ${descrever(aIni, aFim)} (período anterior de mesma duração). Passe o mouse no nome do indicador para ver a fórmula.`}>
        <GradeTiles>
          <Tile rotulo="Taxa de execução" valor={pct(r.taxa_execucao)} farol={farolPct(r.taxa_execucao)}
            variacao={variacaoPp(r.taxa_execucao, ra.taxa_execucao)}
            dica="Operações executadas ÷ operações programadas no período com data até hoje (canceladas fora). Farol: ≥ 90% na meta, ≥ 70% atenção." />
          <Tile rotulo="Executadas" valor={int(r.executadas)}
            detalhe={`de ${int(r.devidas)} devidas · ${int(r.programadas - r.devidas)} a vencer`}
            dica={`Executada = operação confirmada (CONF) ou com apontamento na IW47. ${int(r.encerradas_sem_conf)} operação(ões) foram encerradas sem confirmação e não contam como executadas.`} />
          <Tile rotulo="Atrasadas" valor={int(r.atrasadas)} detalhe="vencidas e não confirmadas" farol={r.atrasadas ? "vermelho" : "verde"}
            dica="Operações com data programada já passada que não foram confirmadas nem encerradas." />
          <Tile rotulo="Execução das ordens" valor={pct(r.taxa_ordens)} farol={farolPct(r.taxa_ordens)}
            variacao={variacaoPp(r.taxa_ordens, ra.taxa_ordens)}
            detalhe={r.ordens_devidas ? `${int(r.ordens_concluidas)} de ${int(r.ordens_devidas)} ordens` : undefined}
            dica="Ordens do IW38 com data-base no período (até hoje) concluídas (CONF + ENTE no IW38 ou na IW47, a mais recente) ÷ ordens devidas." />
          <Tile rotulo="HH real ÷ programada" valor={pct(r.aderencia_hh, 0)}
            detalhe={r.aderencia_hh != null ? `${horas(r.hh_reais)} reais de ${horas(r.hh_executadas_plan)}` : undefined}
            dica={`Trabalho planejado (IW38OP) das atividades executadas × horas apontadas na IW47 nelas${txtJan}.`} />
          <Tile rotulo="Com apontamento" valor={temIw47 ? pct(r.rastreadas) : "—"} detalhe={temIw47 ? "dá para saber quem fez" : "IW47 não encontrada"}
            dica={`Atividades executadas que têm apontamento de horas na IW47${txtJan}.`} />
          <Tile rotulo="Pessoas" valor={r.pessoas != null ? int(r.pessoas) : "—"}
            detalhe={r.hh_apontadas != null ? `${horas(r.hh_apontadas)} apontadas no período` : undefined}
            dica="Pessoas da Gestão de HH com apontamento na IW47 no período (data do apontamento)." />
          <Tile rotulo="Dias até executar" valor={num(r.dias_apos_programacao)} detalhe="da data programada ao fim real"
            dica="Média de dias entre a data programada da atividade e o fim real, nas executadas do período." />
        </GradeTiles>
      </Secao>

      <Secao titulo="Detalhes">
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        {visao === "Visão geral" && <VisaoGeral ops={ops} ini={ini} fim={fim} hoje={hoje} params={params} />}
        {visao === "Quem fez o quê" && (temIw47
          ? <QuemFez ap={ap} ops={ops} equipe={c.b.equipe.dados} ini={ini} fim={fim} sel={param(params, "pessoa")} />
          : <Aviso>Envie o export da <b>IW47</b> (apontamentos) em <Link href="/dados" className="font-medium underline">Fontes de dados</Link> para ver quem executou cada atividade.</Aviso>)}
        {visao === "Atividades" && <Atividades ops={ops} ini={ini} fim={fim} />}
      </Secao>
    </PaginaWcm>
  );
}

function VisaoGeral({ ops, ini, fim, hoje, params }: { ops: ex.Atividade[]; ini: number; fim: number; hoje: number;
  params: Record<string, string | string[] | undefined> }) {
  const sem = semanasGrafico(ex.semanal(ops, ini, fim, hoje));
  const agrupar = param(params, "agrupar") === "centroTrabalho" ? "centroTrabalho" : "setor";
  const grupos = ex.execucaoPor(ops, agrupar, ini, fim, hoje);
  const nat = ex.execucaoPor(ops, "natureza", ini, fim, hoje).slice(0, 8);
  const areas = ex.execucaoPor(ops, "area", ini, fim, hoje).slice(0, 8);
  const sits = ex.contarSituacoes(ops.filter((o) => ex.entre(o.inicio, ini, fim)));
  const tabelaGrupo = (g: ex.GrupoExecucao[], rot: string) => ({
    colunas: [rot, "Programadas", "Executadas", "Atrasadas", "HH programadas", "Taxa"],
    linhas: g.map((x) => [x.grupo || "—", x.programadas, x.executadas, x.atrasadas, num(x.hhProgramadas, 0), pct(x.taxa, 0)]),
  });
  const itens = (g: ex.GrupoExecucao[]) => g.map((x) => ({ rotulo: x.grupo || "—", valor: Math.round(x.taxa * 10) / 10,
    detalhe: `${int(x.executadas)} de ${int(x.programadas)} executadas`, cor: "serie-1" as const }));
  if (!sem.rotulos.length) return <p className="text-[14px] text-texto-3">Nenhuma atividade programada no período.</p>;
  return (
    <div className="space-y-4">
      <Quadro titulo="Situação das atividades do período" subtitulo="Todas as operações com data programada no período, inclusive as que ainda vão vencer">
        <Partes partes={sits.map((s) => ({ nome: s.situacao, valor: s.n, cor: COR_ATIVIDADE[s.situacao] }))} />
      </Quadro>
      <div className="grid gap-4 lg:grid-cols-2">
        <Grafico titulo="Programado × executado por semana" subtitulo="Atividades com data programada na semana (segunda a domingo)"
          dica="Barras empilhadas: executadas + não executadas = programadas da semana."
          legenda={<LegendaCores itens={[["Executadas", "serie-1"], ["Não executadas", "neutro"]]} />}
          tabela={{ colunas: ["Semana de", "Programadas", "Executadas", "Taxa"], linhas: sem.rotulos.map((s, i) => [s, sem.executadas[i] + sem.pendentes[i], sem.executadas[i], pct(sem.taxa[i])]) }}>
          <Colunas rotulos={sem.rotulos} empilhar formato="inteiro"
            series={[{ nome: "Executadas", valores: sem.executadas, cor: "serie-1" }, { nome: "Não executadas", valores: sem.pendentes, cor: "neutro" }]} />
        </Grafico>
        <Grafico titulo="Taxa de execução por semana" subtitulo="Executadas ÷ programadas que já venceram · linha verde = 90%"
          dica="Por semana: operações executadas ÷ operações programadas com data até hoje."
          tabela={{ colunas: ["Semana de", "Taxa"], linhas: sem.rotulos.map((s, i) => [s, pct(sem.taxa[i])]) }}>
          <Linhas rotulos={sem.rotulos} series={[{ nome: "Taxa de execução", valores: sem.taxa, cor: "serie-1" }]} meta={90} formato="%" area minimo={0} />
        </Grafico>
      </div>
      <Grafico titulo="Execução por" subtitulo="Taxa de execução das atividades devidas no período (até hoje) — ordenado pelo volume programado"
        acoes={<Opcoes param="agrupar" opcoes={AGRUPAR} atual={agrupar} params={params} />}
        tabela={tabelaGrupo(grupos, agrupar === "setor" ? "Setor" : "Centro de trabalho")}>
        {grupos.length ? <Barras itens={itens(grupos.slice(0, 20))} formato="%" max={100} larguraRotulo={180} />
          : <p className="text-[13px] text-texto-3">Nada devido no período.</p>}
        {grupos.length > 20 && <p className="mt-2 text-[12px] text-texto-3">Os 20 com mais atividades — veja todos na tabela.</p>}
      </Grafico>
      <div className="grid gap-4 lg:grid-cols-2">
        <Grafico titulo="Por tipo de trabalho" subtitulo="Natureza da ordem no IW38 · 8 com mais atividades" tabela={tabelaGrupo(nat, "Tipo de trabalho")}>
          {nat.length ? <Barras itens={itens(nat)} formato="%" max={100} /> : <p className="text-[13px] text-texto-3">Nada devido no período.</p>}
        </Grafico>
        <Grafico titulo="Por área" subtitulo="Localização da ordem no IW38 · 8 com mais atividades" tabela={tabelaGrupo(areas, "Área")}>
          {areas.length ? <Barras itens={itens(areas)} formato="%" max={100} /> : <p className="text-[13px] text-texto-3">Nada devido no período.</p>}
        </Grafico>
      </div>
    </div>
  );
}

const COLS_PESSOAS: Coluna[] = [
  { id: "pessoa", rotulo: "Pessoa", largura: 200 }, { id: "np", rotulo: "Nº pessoal", tipo: "codigo", largura: 100 },
  { id: "cargo", rotulo: "Cargo", largura: 160 }, { id: "area", rotulo: "Área", largura: 120 }, { id: "turma", rotulo: "Turma", largura: 70 },
  { id: "centro", rotulo: "Centro (mais apontado)", tipo: "codigo", largura: 150 },
  { id: "hh", rotulo: "HH apontadas", tipo: "barra", casas: 1, largura: 160 }, { id: "ordens", rotulo: "Ordens", tipo: "num", largura: 80 },
  { id: "ops", rotulo: "Operações", tipo: "num", largura: 90 }, { id: "dias", rotulo: "Dias c/ apont.", tipo: "num", largura: 100 },
  { id: "plano", rotulo: "% HH em plano", tipo: "pct", largura: 110, dica: "HH em ordens com plano de manutenção ÷ HH em ordens que estão no IW38OP" },
  { id: "ultimo", rotulo: "Último apontamento", tipo: "data", largura: 130 },
];
const COLS_DA_PESSOA: Coluna[] = [
  { id: "data", rotulo: "Data", tipo: "data" }, { id: "ordem", rotulo: "Ordem", tipo: "codigo" }, { id: "op", rotulo: "Operação", tipo: "codigo", largura: 80 },
  { id: "texto", rotulo: "Atividade", largura: 260 }, { id: "objeto", rotulo: "Objeto técnico", largura: 200 },
  { id: "equipamento", rotulo: "Equipamento", tipo: "codigo" }, { id: "natureza", rotulo: "Natureza", largura: 120 },
  { id: "centro", rotulo: "Centro de trabalho", tipo: "codigo", largura: 130 }, { id: "horas", rotulo: "Horas", tipo: "h" },
  { id: "situacao", rotulo: "Situação da atividade", tipo: "situacao" },
];

function QuemFez({ ap, ops, equipe, ini, fim, sel }: { ap: ex.Apontamento[]; ops: ex.Atividade[];
  equipe: import("@/lib/wcm/preparo").Pessoa[] | null; ini: number; fim: number; sel: string }) {
  const pes = ex.porPessoa(ap, ops, equipe, ini, fim);
  if (!pes.length) return <p className="text-[14px] text-texto-3">Nenhum apontamento na IW47 no período.</p>;
  const top = topPessoas(pes, 15);
  const p = sel ? pes.find((x) => x.np === sel) : undefined;
  const dela = p ? ex.atividadesDaPessoa(ap, ops, p.np, ini, fim) : [];
  return (
    <div className="space-y-4">
      <Grafico titulo="Quem mais apontou horas" subtitulo="15 pessoas com mais HH no período · em ordens com plano × fora de plano"
        legenda={<LegendaCores itens={[["Em plano", "serie-1"], ["Fora de plano / sem IW38OP", "serie-2"]]} />}
        tabela={{ colunas: ["Pessoa", "HH", "Em plano", "Fora"], linhas: top.map((t) => [t.rotulo, num(t.valor), num(t.plano), num(t.fora)]) }}>
        <Barras formato="h" larguraRotulo={200} itens={top.map((t) => ({ rotulo: t.rotulo, valor: t.valor, detalhe: t.detalhe,
          partes: [{ nome: "Em plano", valor: t.plano, cor: "serie-1" }, { nome: "Fora de plano", valor: t.fora, cor: "serie-2" }] }))} />
      </Grafico>
      <Quadro titulo="Por pessoa" subtitulo={`${int(pes.length)} pessoas apontaram horas no período (data do apontamento) · clique numa pessoa para ver as atividades que ela executou`}>
        <Tabela colunas={COLS_PESSOAS} arquivo="quem_fez_o_que" contagem="pessoas" altura={420}
          busca={{ campos: ["pessoa", "np", "cargo", "centro"], placeholder: "Buscar pessoa, matrícula, cargo…" }}
          facetas={[{ id: "turma", rotulo: "Turma" }, { id: "area", rotulo: "Área" }]}
          abrirParam={{ param: "pessoa", campo: "np", ancora: "pessoa" }}
          linhas={pes.map((x) => ({ pessoa: x.pessoa, np: x.np, cargo: x.cargo, area: x.area, turma: x.turma, centro: x.centroMaisApontado,
            hh: Math.round(x.hhApontadas * 10) / 10, ordens: x.ordens, ops: x.operacoes, dias: x.diasComApontamento,
            plano: x.pctHhEmPlano == null ? null : Math.round(x.pctHhEmPlano), ultimo: x.ultimoApontamento }))} />
      </Quadro>
      {p && (
        <Quadro id="pessoa" titulo={`${p.pessoa} (${p.np})`}
          subtitulo={`${num(p.hhApontadas)} h em ${int(p.ordens)} ordens / ${int(p.operacoes)} atividades · ${int(p.diasComApontamento)} dias com apontamento`}>
          <Tabela colunas={COLS_DA_PESSOA} cores={COR_ATIVIDADE} arquivo={`apontamentos_${p.np}`} contagem="apontamentos" altura={380}
            busca={{ campos: ["ordem", "texto", "objeto", "equipamento"], placeholder: "Buscar ordem, atividade, equipamento…" }}
            linhas={dela.map((a) => ({ data: a.data, ordem: a.ordem, op: a.operacao, texto: a.textoOperacao ?? a.texto, objeto: a.objeto,
              equipamento: a.equipamento, natureza: a.natureza, centro: a.centroTrabalho, horas: a.horas, situacao: a.situacao }))} />
        </Quadro>
      )}
    </div>
  );
}

const COLS_ATIV: Coluna[] = [
  { id: "inicio", rotulo: "Programada", tipo: "data" }, { id: "ordem", rotulo: "Ordem", tipo: "codigo" },
  { id: "op", rotulo: "Operação", tipo: "codigo", largura: 80 }, { id: "texto", rotulo: "Atividade", largura: 280 },
  { id: "objeto", rotulo: "Objeto técnico", largura: 200 }, { id: "equipamento", rotulo: "Equipamento", tipo: "codigo" },
  { id: "setor", rotulo: "Setor", largura: 120 }, { id: "centro", rotulo: "Centro de trabalho", tipo: "codigo", largura: 130 },
  { id: "natureza", rotulo: "Natureza", largura: 120 }, { id: "situacao", rotulo: "Situação", tipo: "situacao", largura: 200 },
  { id: "status", rotulo: "Status SAP", tipo: "codigo", largura: 150 }, { id: "quem", rotulo: "Executado por", largura: 200 },
  { id: "hh", rotulo: "HH plan.", tipo: "h" }, { id: "hhReal", rotulo: "HH real", tipo: "h" },
  { id: "fimReal", rotulo: "Fim real", tipo: "data" }, { id: "dias", rotulo: "Dias após a programação", tipo: "num", largura: 110 },
];

function Atividades({ ops, ini, fim }: { ops: ex.Atividade[]; ini: number; fim: number }) {
  const per = ex.filtrarAtividades(ops, ini, fim);
  const vis = per.slice(0, MAX_LINHAS);
  return (
    <Quadro titulo="Atividades do período" subtitulo="Pela data programada · busque por ordem, atividade, equipamento ou pessoa">
      {per.length > MAX_LINHAS && <Nota>{int(per.length)} atividades no período: aqui vão as {int(MAX_LINHAS)} primeiras pela data programada. Estreite o período ou os filtros do topo para ver o resto.</Nota>}
      <Tabela colunas={COLS_ATIV} cores={COR_ATIVIDADE} arquivo="atividades_execucao" contagem="atividades" resumoPor="situacao"
        busca={{ campos: ["ordem", "texto", "equipamento", "objeto", "quem"], placeholder: "ordem, atividade, equipamento, pessoa…" }}
        facetas={[{ id: "situacao", rotulo: "Situação", ordem: [...ex.SITUACOES] }, { id: "quem", rotulo: "Executado por", lista: true },
          { id: "centro", rotulo: "Centro" }]}
        linhas={vis.map((o) => ({ inicio: o.inicio, ordem: o.ordem, op: o.operacao, texto: o.textoOperacao, objeto: o.objeto,
          equipamento: o.equipamento, setor: o.setor, centro: o.centroTrabalho, natureza: o.natureza, situacao: o.situacao,
          status: o.statusSap, quem: o.executadoPor, hh: o.horas, hhReal: o.hhReal, fimReal: o.fimReal, dias: o.diasAposProgramacao }))} />
    </Quadro>
  );
}
