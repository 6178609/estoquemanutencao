import type { Metadata } from "next";

import { Colunas, Grafico, Partes } from "@/components/graficos";
import { AbasVisao, Aviso, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho, Kpi } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { brl, brlCurto, dataHora, inteiro } from "@/lib/formato";
import { barra, contexto } from "@/lib/wcm/contexto";
import { descrever } from "@/lib/wcm/filtros";
import * as planos from "@/lib/wcm/planos";
import { dataBr, partes } from "@/lib/wcm/util";

import { Controles } from "./_comum/Controles";
import { GavetaUrl } from "./_comum/GavetaUrl";
import { atalhos, contagem, fimDoMes, hrefCom, iso, lista, periodo, um, type Params } from "./_comum/params";
import { TabelaLonga, type Celula } from "./_comum/TabelaLonga";
import { COR_SITUACAO, EXPLICA, estiloCelula } from "./cores";
import { GradePlanos, type LinhaGrade } from "./GradePlanos";

export const metadata: Metadata = { title: "Planos de manutenção" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VISOES = ["Calendário semanal", "Tabela por semana"];
const MAX_LINHAS = 3000;
const p2 = (n: number) => String(n).padStart(2, "0");
const pct = (a: planos.Aderencia) => (a.taxa == null ? "—" : `${Math.round(a.taxa * 100)}%`);

export default async function Planos(props: { searchParams: Promise<Params> }) {
  await exigir("planos");
  const params = await props.searchParams;
  const c = await contexto(params);
  const b = barra(c);
  const cab = <Cabecalho titulo="Planos de manutenção," destaque="o calendário semanal de cada plano."
    sobre="Programação · IP19" subtitulo="As chamadas dos planos (IP19) semana a semana entre as datas escolhidas, cruzadas com as ordens do IW38 para saber o que foi executado." />;
  const moldura = (filhos: React.ReactNode) => (
    <PaginaWcm barra={{ ...b, recorte: "Centro de trabalho e tipo de ordem valem aqui; o período é o da página" }} periodo={false}>{filhos}</PaginaWcm>
  );
  const ch = c.chamadas;
  if (!ch) return moldura(<>{cab}<SemDados base="IP19 (planos de manutenção)" /></>);

  const hoje = c.b.hoje;
  const temIp19 = !!c.b.cruas.ip19.dados?.length;
  const temIw38 = !!c.b.ordens.dados?.length;
  const fonte = temIp19 ? `IP19 de ${dataHora(c.b.cruas.ip19.atualizado)}${temIw38 ? " · cruzada com o IW38" : ""}`
    : `ordens com plano do IW38 de ${dataHora(c.b.ordens.atualizado)}`;

  // filtros: período próprio (pode incluir semanas futuras); centro e tipo vêm da barra global
  const mesIni = hoje - (partes(hoje).dia - 1);
  let minimo: number | null = null, maximo: number | null = null;
  for (const x of ch) if (x.data != null) {
    if (minimo == null || x.data < minimo) minimo = x.data;
    if (maximo == null || x.data > maximo) maximo = x.data;
  }
  // vindo da Buscar (?q=… sem período): todas as datas do plano procurado
  const padraoPer: [number, number] = um(params, "q") && !um(params, "pde") && !um(params, "pate") && minimo != null && maximo != null
    ? [minimo, Math.max(maximo, hoje)] : [mesIni, fimDoMes(mesIni)];
  const [ini, fim] = periodo(params, "pde", "pate", padraoPer);
  const busca = um(params, "q"), selCtr = lista(params, "pctr"), selSit = lista(params, "psit"), selAtv = lista(params, "patv");
  const globais = planos.filtrarChamadas(ch, { inicio: ini, fim, centrosGlobais: c.centros, tiposGlobais: c.f.tipos });
  const doPeriodo = planos.noIntervalo(globais, ini, fim);
  const filtro = planos.filtrarChamadas(globais, { inicio: ini, fim, busca, centros: selCtr, situacoes: selSit, atividades: selAtv });
  const noPeriodo = planos.noIntervalo(filtro, ini, fim);
  const r = planos.resumoPeriodo(noPeriodo, hoje);

  const visao = VISOES.includes(um(params, "visao")) ? um(params, "visao") : VISOES[0];
  const cal = planos.montarCalendario(filtro, ini, fim);
  const linhas = planos.atrasadosPrimeiro(cal.linhas);
  const semanaHoje = planos.colunaDaSemana(hoje, ini, fim);
  const iAtual = semanaHoje ? cal.semanas.indexOf(semanaHoje) : -1;
  const periodos = cal.segundas.map((s) => `${dataBr(s).slice(0, 5)} a ${dataBr(s + 6)}`);
  const marcas = planos.marcasDosMeses(cal.segundas);
  const hrefBase = hrefCom(params, { plano: null });
  const cortadas = linhas.length > MAX_LINHAS;
  const visiveis = linhas.slice(0, MAX_LINHAS);

  const controles = (
    <Controles limpar={["plano"]} controles={[
      { tipo: "periodo", de: "pde", ate: "pate", valorDe: iso(ini), valorAte: iso(fim), rotulo: "Data planejada",
        atalhos: atalhos(hoje, ["Este mês", "Mês passado", "Próximo mês", "Próximos 90 dias", "Ano atual", "Tudo"], minimo, maximo) },
      { tipo: "busca", chave: "q", valor: busca, placeholder: "Nº do plano, descrição, equipamento…" },
      { tipo: "multi", chave: "pctr", rotulo: "Centro de trabalho", valor: selCtr, opcoes: contagem(doPeriodo.map((x) => x.centroTrabalho)) },
      { tipo: "multi", chave: "psit", rotulo: "Situação", valor: selSit,
        opcoes: planos.SITUACOES.map((s) => ({ valor: s, n: doPeriodo.filter((x) => x.situacao === s).length })) },
      { tipo: "multi", chave: "patv", rotulo: "Atividade", valor: selAtv, opcoes: contagem(doPeriodo.map((x) => x.atividade)) },
    ]} />
  );

  // carga por semana (as 4 situações que são trabalho; saltadas e sem status ficam na tabela)
  const carga = planos.cargaSemanal(filtro, ini, fim);
  const SERIES = [planos.CONCLUIDA, planos.ABERTA, planos.ATRASADA, planos.PROGRAMADA] as const;
  const rotCarga = cal.semanas.map((s) => (s === semanaHoje ? `${s}*` : s));
  const valCarga = (sit: string) => cal.semanas.map((s) => carga.filter((x) => x.semana === s && x.situacao === sit).reduce((t, x) => t + x.chamadas, 0));

  // plano aberto na gaveta
  const chavePlano = um(params, "plano");
  const det = chavePlano ? planos.detalhePlano(filtro, chavePlano, hoje) : null;
  const descPlano = chavePlano ? (linhas.find((l) => l.plano === chavePlano)?.descricao ?? det?.chamadas[0]?.texto ?? "") : "";

  const legenda = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-texto-2">
      {planos.SITUACOES.map((s) => {
        const e = estiloCelula(s);
        return (
          <span key={s} className="inline-flex items-center gap-1.5" title={EXPLICA[s]}>
            <span className="grid size-4 place-items-center rounded-[4px] border text-[9.5px] font-semibold" style={{ background: e.background, borderColor: e.border, color: e.color }}>{planos.SIMBOLO[s]}</span>
            {s}
          </span>
        );
      })}
      {semanaHoje && <span className="inline-flex items-center gap-1.5"><span className="h-4 w-0 border-l-2 border-dashed" style={{ borderColor: "var(--st-bom)" }} />semana atual ({semanaHoje})</span>}
    </div>
  );

  return moldura(
    <>
      {cab}
      {!temIp19 && (
        <Aviso tom="azul">A exportação da <b>IP19</b> ainda não está no repositório de dados. Enquanto isso, o calendário mostra as <b>ordens do IW38 que têm plano</b> —
          só o que já virou ordem. Para ver também as chamadas futuras, envie o export da IP19 em <a href="/dados" className="font-medium underline">Fontes de dados</a>.</Aviso>
      )}
      <div className="space-y-3">
        {controles}
        <p className="text-[12.5px] text-texto-3">{descrever(ini, fim)} · fonte: {fonte}. O período é o desta página (pode incluir semanas futuras); centro de trabalho e tipo de ordem seguem a barra de filtros.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="Planos no período" valor={inteiro(r.planos)} detalhe="planos (e itens) com chamada entre as datas" />
        <Kpi rotulo="Chamadas no período" valor={inteiro(r.chamadas)} detalhe={`${inteiro(r.programadas)} ainda por vir`} />
        <Kpi rotulo="Aderência até hoje" valor={pct(r.aderencia)} detalhe={`${inteiro(r.aderencia.concluidas)} de ${inteiro(r.aderencia.vencidas)} vencidas`}
          dica="Chamadas com data até hoje que foram concluídas ÷ chamadas com data até hoje (saltadas e canceladas não contam)." />
        <Kpi rotulo="Atrasadas" valor={inteiro(r.atrasadas)} detalhe="data já passou e não foi concluída" tom="vermelho" />
        <Kpi rotulo="Custo das ordens" valor={temIw38 ? brlCurto(r.custoReal) : "—"} detalhe={temIw38 ? brl(r.custoReal) : "sem IW38"}
          dica="Custo real (IW38) das ordens geradas pelas chamadas do período." />
      </div>

      <Secao titulo={`Calendário de ${descrever(ini, fim)}`} destaque={`· ${inteiro(linhas.length)} planos`}
        sub="Uma linha por plano, uma coluna por semana (S01 = 1ª semana ISO do ano). A cor mostra a pior situação da semana; o número, quantas chamadas caíram nela. Planos com atraso primeiro. Ciclo com * = estimado pelo intervalo entre as chamadas.">
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        {legenda}
        {cortadas && <Aviso>Muitos planos no filtro: a grade mostra os {inteiro(MAX_LINHAS)} primeiros (atrasados primeiro). Use a busca ou os filtros para ver o resto.</Aviso>}
        {!linhas.length ? <p className="rounded-cartao border border-borda bg-superficie p-6 text-[14px] text-texto-3">Nenhum plano com chamada nesse período e filtro.</p>
          : visao === VISOES[0] ? (
            <GradePlanos semanas={cal.semanas} periodos={periodos} atual={iAtual >= 0 ? iAtual : null} hrefBase={hrefBase} selecionado={chavePlano || undefined}
              meses={Object.entries(marcas).map(([s, m]) => [cal.semanas.indexOf(s), m] as [number, string])}
              csv={`calendario_planos_${iso(ini).replaceAll("-", "")}_${iso(fim).replaceAll("-", "")}`}
              linhas={linhasGrade(visiveis, filtro, cal.semanas, ini, fim)} />
          ) : (
            <TabelaLonga altura={620} csv={`calendario_planos_${iso(ini).replaceAll("-", "")}_${iso(fim).replaceAll("-", "")}`}
              colunas={[{ titulo: "Plano", largura: 110, fixa: true }, { titulo: "Descrição", largura: 240 }, { titulo: "Atras.", largura: 64, num: true, dica: "Chamadas atrasadas no período" },
                ...cal.semanas.map((s, j) => ({ titulo: s === semanaHoje ? `${s}•` : s, largura: s.includes("/") ? 56 : 44, centro: true, dica: `Semana de ${periodos[j]}` })),
                { titulo: "Equipamento", largura: 200 }, { titulo: "Centro", largura: 100 }, { titulo: "Ciclo", largura: 100 }, { titulo: "Chamadas", largura: 84, num: true }]}
              links={visiveis.map((l) => `${hrefBase}${hrefBase === "?" ? "" : "&"}plano=${encodeURIComponent(l.plano)}`)}
              linhas={visiveis.map((l): Celula[] => [l.plano, l.descricao, l.atrasadas,
                ...cal.semanas.map((s): Celula => {
                  const sit = l.situacao[s];
                  if (!sit) return "";
                  const e = estiloCelula(sit);
                  return { t: l.texto[s], fundo: e.background, cor: e.color, dica: sit };
                }), l.equipamento, l.centro, l.ciclo, l.chamadas])} />
          )}
      </Secao>

      {carga.length > 0 && (
        <Grafico titulo="Chamadas por semana" subtitulo="Carga de trabalho dos planos no período · * semana atual · saltadas e sem status estão na tabela"
          legenda={<div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-texto-2">{SERIES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: s === planos.PROGRAMADA ? "var(--texto-4)" : `var(--${COR_SITUACAO[s]})` }} />{s}</span>))}</div>}
          tabela={{ colunas: ["Semana", "Período", ...planos.SITUACOES], linhas: cal.semanas.map((s, j) => [s, periodos[j], ...planos.SITUACOES.map((x) => valCarga(x)[j])]) }}>
          <Colunas rotulos={rotCarga} empilhar formato="inteiro" altura={230} rotular="nenhum"
            series={SERIES.map((s) => ({ nome: s, valores: valCarga(s), cor: COR_SITUACAO[s] }))} />
        </Grafico>
      )}

      {chavePlano && det && (
        <GavetaUrl parametro="plano" titulo={`Plano ${chavePlano}`} subtitulo={descPlano}>
          <DetalhePlano det={det} hoje={hoje} temIw38={temIw38} />
        </GavetaUrl>
      )}
    </>,
  );
}

/** Linhas do calendário → células compactas para o navegador (com as datas e ordens da dica). */
function linhasGrade(ls: planos.LinhaCalendario[], ch: planos.ChamadaClassificada[], semanas: string[], ini: number, fim: number): LinhaGrade[] {
  const desc = Object.fromEntries(ls.map((l) => [l.plano, l.descricao]));
  const idx = new Map(semanas.map((s, j) => [s, j]));
  const porPlano = new Map<string, LinhaGrade["c"]>();
  for (const x of planos.celulas(ch, ini, fim, ls.map((l) => l.plano), desc)) {
    const c = porPlano.get(x.chave) ?? porPlano.set(x.chave, []).get(x.chave)!;
    c.push([idx.get(x.semana)!, planos.SITUACOES.indexOf(x.situacao), x.chamadas, x.datas, x.ordens]);
  }
  return ls.map((l) => ({ k: l.plano, d: l.descricao, a: l.atrasadas, e: l.equipamento, ct: l.centro, ci: l.ciclo, n: l.chamadas,
    c: porPlano.get(l.plano) ?? [] }));
}

function DetalhePlano({ det, hoje, temIw38 }: { det: planos.DetalhePlano; hoje: number; temIw38: boolean }) {
  const d = det.chamadas;
  if (!d.length) return <p className="text-[14px] text-texto-3">Nenhuma chamada deste plano no filtro atual.</p>;
  const tem = (f: (x: planos.ChamadaClassificada) => unknown) => d.some((x) => { const v = f(x); return v != null && v !== "" && v !== 0; });
  const cols: [string, (x: planos.ChamadaClassificada) => Celula, number?][] = [
    ["Data planejada", (x) => dataBr(x.dataPlanejada), 104],
    ["Data chamada", (x) => dataBr(x.dataChamada), 104],
    ["Data conclusão", (x) => dataBr(x.dataConclusao), 104],
    ["Semana", (x) => (x.semana != null ? `S${p2(x.semana)}/${String(x.ano).slice(2)}` : ""), 76],
    ["Situação", (x) => { const e = estiloCelula(x.situacao); return { t: `${planos.SIMBOLO[x.situacao]} ${x.situacao}`, fundo: e.background, cor: e.color }; }, 150],
    ["Ordem", (x) => x.ordem, 100], ["Situação IW38", (x) => x.situacaoIw38, 120],
    ["Custo real", (x) => (temIw38 ? brl(x.custoReal) : ""), 110], ["Tipo de programação", (x) => x.tipoProgramacao, 200],
    ["Atividade", (x) => x.atividade, 110], ["Pacote", (x) => x.pacote, 90], ["Operações", (x) => x.operacoes, 90],
    ["Horas", (x) => (x.horas ? Math.round(x.horas * 10) / 10 : ""), 70], ["Objeto técnico", (x) => x.objeto, 200],
    ["Centro de trabalho", (x) => x.centroTrabalho, 120],
  ];
  const usadas = cols.filter(([, f], i) => i < 5 || tem(f));
  const sit = planos.SITUACOES.map((s) => ({ nome: s, valor: d.filter((x) => x.situacao === s).length, cor: COR_SITUACAO[s] })).filter((p) => p.valor);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Kpi rotulo="Chamadas (todas as datas)" valor={inteiro(d.length)} />
        <Kpi rotulo="Aderência até hoje" valor={pct(det.aderencia)} detalhe={`${det.aderencia.concluidas} de ${det.aderencia.vencidas} vencidas`} />
        <Kpi rotulo="Próxima chamada" valor={det.proxima != null ? dataBr(det.proxima) : "—"} detalhe={det.proxima != null ? `em ${det.proxima - hoje} dia(s)` : undefined} />
        <Kpi rotulo="Custo das ordens" valor={temIw38 ? brlCurto(det.custoReal) : "—"} detalhe={temIw38 ? brl(det.custoReal) : undefined} />
      </div>
      <div>
        <div className="mb-2 text-[13px] font-medium text-texto-2">Chamadas por situação</div>
        <Partes partes={sit.slice(0, 6)} />
      </div>
      <TabelaLonga altura={420} csv="chamadas_plano" colunas={usadas.map(([t, , w]) => ({ titulo: t, largura: w }))}
        linhas={d.map((x) => usadas.map(([, f]) => f(x)))} />
    </>
  );
}
