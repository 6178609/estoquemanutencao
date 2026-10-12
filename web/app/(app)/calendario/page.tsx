import clsx from "clsx";
import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Colunas, Grafico, Partes } from "@/components/graficos";
import { Aviso, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho, Kpi } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { lerCadastro } from "@/lib/dados/cadastros";
import { inteiro } from "@/lib/formato";
import * as cal from "@/lib/wcm/calendario";
import { barra, contexto } from "@/lib/wcm/contexto";
import { descrever } from "@/lib/wcm/filtros";
import { NAT_BACKLOG, NAT_PLANO } from "@/lib/wcm/preparo";
import { dataBr, partes, SETORES, setorDoCentro } from "@/lib/wcm/util";

import { Controles } from "../planos/_comum/Controles";
import { atalhos, contagem, fimDoMes, iso, lista, periodo, um, type Params } from "../planos/_comum/params";
import { TabelaLonga } from "../planos/_comum/TabelaLonga";
import { ARQ_LOTES, datasAlteradas } from "../programacao/logica";

export const metadata: Metadata = { title: "Calendário de ordens" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PADRAO_SIT = [cal.PROGRAMADA, cal.ATRASADA, cal.CONCLUIDA];
const MAX_LISTA = 5000;
const NATUREZAS = [NAT_PLANO, NAT_BACKLOG];

export default async function Calendario(props: { searchParams: Promise<Params> }) {
  await exigir("calendario");
  const params = await props.searchParams;
  const c = await contexto(params);
  const b = barra(c);
  const cab = <Cabecalho titulo="Calendário de ordens," destaque="o que está alocado em cada dia."
    sobre="Programação · IW38" subtitulo="As ordens em cada dia (data-base de início do IW38), por turno, com quem apontou (IW47) e a duração planejada (IW38OP)." />;
  const moldura = (filhos: React.ReactNode) => (
    <PaginaWcm barra={{ ...b, recorte: "Área, centro e tipo valem aqui; o período é o da página" }} periodo={false}>{filhos}</PaginaWcm>
  );
  const ordensBase = c.b.ordens.dados;
  if (!ordensBase) return moldura(<>{cab}<SemDados base="IW38 (ordens)" /></>);

  const hoje = c.b.hoje;
  const mesIni = hoje - (partes(hoje).dia - 1);
  const [ini, fim] = periodo(params, "cde", "cate", [mesIni, fimDoMes(mesIni)]);
  const iniJanela = cal.inicioSemana(ini), fimJanela = cal.inicioSemana(fim) + 6;

  // mudanças de data feitas pelo robô (Programação do mês) que o IW38 exportado ainda não traz
  let ajustes: Record<string, [string, string]> = {};
  try { ajustes = datasAlteradas(await lerCadastro(ARQ_LOTES), c.b.ordens.atualizado); } catch { ajustes = {}; }

  // recorte global (área, centro, tipo) e só as ordens da janela do calendário
  const { areas, tipos } = c.f, centros = c.centros;
  const recortadas = ordensBase.filter((o) => (!areas.length || areas.includes(o.localizacao))
    && (!centros.length || centros.includes(o.centroTrabalho)) && (!tipos.length || tipos.includes(o.tipo)));
  const ajustadas = cal.comDatasAlteradas(recortadas, ajustes) ?? [];
  const naJanela = ajustadas.filter((o) => o.data != null && o.data >= iniJanela && o.data <= fimJanela);
  const ag = cal.agenda(naJanela, c.b.operacoes.dados, c.b.confirmacoes.dados, c.b.equipe.dados, hoje);

  // filtros da página
  const busca = um(params, "cq");
  const selSit = params.csit !== undefined ? lista(params, "csit") : PADRAO_SIT;
  const selNat = lista(params, "cnat"), selTur = lista(params, "ctur"), selLoc = lista(params, "cloc");
  const selSet = lista(params, "cset"), selCt = lista(params, "cct");
  const centrosCal = [...new Set(ag.map((l) => l.centroTrabalho).filter(Boolean))].sort();
  const vis = cal.filtrarAgenda(ag, { busca, situacoes: selSit, naturezas: selNat, turnos: selTur, localizacoes: selLoc,
    centros: selCt, setores: selSet });
  const noPeriodo = vis.filter((l) => l.dia >= ini && l.dia <= fim);
  const r = cal.resumoAgenda(noPeriodo);
  const fimGrade = Math.min(fim, ini + cal.MAX_DIAS_GRADE - 1);
  const dias = cal.diasDoCalendario(vis, ini, fimGrade, hoje, null, fimGrade - ini < 14 ? 12 : 4);
  const semanas = Array.from({ length: dias.length / 7 }, (_, i) => dias.slice(i * 7, i * 7 + 7));

  const controles = (
    <div className="space-y-2">
      <Controles controles={[
        { tipo: "periodo", de: "cde", ate: "cate", valorDe: iso(ini), valorAte: iso(fim), rotulo: "Período",
          atalhos: atalhos(hoje, ["Este mês", "Mês passado", "Próximo mês", "Esta semana", "Próxima semana", "Semana passada"]) },
        { tipo: "busca", chave: "cq", valor: busca, placeholder: "Ordem, equipamento, texto, pessoa, centro…" },
      ]} />
      <Controles controles={[
        { tipo: "multi", chave: "csit", rotulo: "Situação", valor: selSit, opcoes: cal.SITUACOES.map((s) => ({ valor: s, n: ag.filter((l) => l.situacao === s).length })) },
        { tipo: "multi", chave: "cnat", rotulo: "Tipo de trabalho", valor: selNat, opcoes: NATUREZAS.map((n) => ({ valor: n })) },
        { tipo: "multi", chave: "ctur", rotulo: "Turno", valor: selTur, opcoes: cal.ORDEM_TURNOS.map((t) => ({ valor: t })) },
        { tipo: "multi", chave: "cset", rotulo: "Setor", valor: selSet, opcoes: SETORES.filter((s) => centrosCal.some((x) => setorDoCentro(x) === s)).map((s) => ({ valor: s })) },
        { tipo: "multi", chave: "cct", rotulo: "Centro de trabalho", valor: selCt,
          opcoes: contagem(ag.filter((l) => !selSet.length || selSet.includes(setorDoCentro(l.centroTrabalho))).map((l) => l.centroTrabalho)) },
        { tipo: "pilulas", chave: "cloc", rotulo: "Localização", valor: selLoc, opcoes: contagem(ag.map((l) => l.localizacao)).slice(0, 12) },
      ]} />
    </div>
  );

  // ordens por dia e situação (uma vez por ordem)
  const diasPer: number[] = [];
  for (let d = ini; d <= fim && diasPer.length < 120; d++) diasPer.push(d);
  // ordens distintas por dia e situação — contadas uma vez (antes recontava a agenda inteira para cada célula)
  const ordensDiaSit = new Map<string, Set<string>>();
  for (const l of noPeriodo) {
    const k = `${l.dia}|${l.situacao}`;
    let c = ordensDiaSit.get(k);
    if (!c) ordensDiaSit.set(k, (c = new Set()));
    c.add(l.ordem);
  }
  const porSit = new Map<string, number[]>();
  const porDia = (sit: string) => {
    let v = porSit.get(sit);
    if (!v) porSit.set(sit, (v = diasPer.map((d) => ordensDiaSit.get(`${d}|${sit}`)?.size ?? 0)));
    return v;
  };
  const primeira = new Map<string, cal.ItemAgenda>();
  for (const l of noPeriodo) if (!primeira.has(l.ordem)) primeira.set(l.ordem, l);
  const unicas = [...primeira.values()];
  const nAjust = Object.keys(ajustes).length;
  const turnoOrdens = new Map<string, Set<string>>();
  for (const l of noPeriodo) { let c = turnoOrdens.get(l.turno); if (!c) turnoOrdens.set(l.turno, (c = new Set())); c.add(l.ordem); }
  const porTurno = new Map([...turnoOrdens].map(([t, c]) => [t, c.size]));

  return moldura(
    <>
      {cab}
      {controles}
      <p className="-mt-6 text-[12.5px] text-texto-3">{descrever(ini, fim)} · o período é o desta página (pode incluir datas futuras); área, centro de trabalho e tipo de ordem seguem a barra de filtros.</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="Ordens" valor={inteiro(r.ordens)} detalhe="ordens distintas no período" />
        <Kpi rotulo="Concluídas" valor={inteiro(r.concluidas)} detalhe={r.ordens ? `${Math.round((r.concluidas / r.ordens) * 100)}% das ordens` : undefined}
          dica="Concluída no IW38 (CONF + ENTE) ou com CONF + ENTE na IW47." />
        <Kpi rotulo="Atrasadas" valor={inteiro(r.atrasadas)} detalhe="abertas com o dia já passado" dica="Abertas/liberadas com a data-base de início já passada." />
        <Kpi rotulo="HH planejado" valor={`${inteiro(r.horas)} h`} detalhe="trabalho planejado (IW38OP)" />
        <Kpi rotulo="Sem IW47" valor={inteiro(r.semIw47)} detalhe="sem apontamento ainda" dica="Ordens sem apontamento na IW47: aparecem com o centro de trabalho e as pessoas previstas." />
      </div>

      <Secao titulo={descrever(ini, fim)} destaque="· dia a dia"
        sub={'Passe o mouse num cartão para ver a ordem, o texto e a situação. O turno vem da turma (Gestão de HH) de quem apontou na IW47; ordens sem apontamento ficam em "Sem executante" com o centro de trabalho.'}
        acoes={<Link href="/programacao" className="inline-flex items-center gap-1.5 rounded-lg border border-borda px-3 py-2 text-[13px] text-texto-2 hover:bg-superficie-2 hover:text-texto"><CalendarClock className="size-4" />Programação do mês</Link>}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-texto-2">
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-[3px] border" style={{ background: FUNDO[NAT_PLANO], borderColor: "var(--borda)" }} />Plano de manutenção</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-[3px] border" style={{ background: FUNDO[NAT_BACKLOG], borderColor: "var(--borda)" }} />Backlog</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded-full" style={{ background: "var(--st-bom)" }} />Concluída</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded-full" style={{ background: "var(--st-critico)" }} />Atrasada</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded-full" style={{ background: "var(--borda-forte)" }} />Programada</span>
          <span className="inline-flex items-center gap-1.5"><span className="line-through">Cancelada</span></span>
          {nAjust > 0 && <span>↻ = data alterada pelo robô do SAP ({nAjust} ordem(ns)), ainda não no IW38 exportado</span>}
        </div>
        {fimGrade < fim && <Aviso tom="azul">Período longo: o calendário mostra as 9 primeiras semanas (até {dataBr(fimGrade)}). Os números acima e a lista abaixo valem para o período inteiro.</Aviso>}
        <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
          <div className="min-w-[880px]">
            <div className="grid grid-cols-7 border-b border-borda bg-superficie-2">
              {cal.DIAS.map((d) => <div key={d} className="py-2 text-center text-[11px] font-semibold tracking-[0.06em] text-texto-3">{d}</div>)}
            </div>
            {semanas.map((s, i) => (
              <div key={i} className="grid grid-cols-7 border-b border-borda last:border-b-0">
                {s.map((d) => <CelulaDia key={d.dia} d={d} />)}
              </div>
            ))}
          </div>
        </div>
      </Secao>

      {noPeriodo.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Grafico titulo="Ordens por dia" subtitulo="Pela data-base de início · cada ordem conta uma vez no dia"
            legenda={<div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-texto-2">
              {([[cal.CONCLUIDA, "st-bom"], [cal.ATRASADA, "st-critico"], [cal.PROGRAMADA, "serie-1"]] as const).map(([n, k]) => (
                <span key={n} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: `var(--${k})` }} />{n}</span>))}</div>}
            tabela={{ colunas: ["Dia", cal.CONCLUIDA, cal.ATRASADA, cal.PROGRAMADA, cal.CANCELADA], linhas: diasPer.map((d, i) => [dataBr(d), porDia(cal.CONCLUIDA)[i], porDia(cal.ATRASADA)[i], porDia(cal.PROGRAMADA)[i], porDia(cal.CANCELADA)[i]]) }}>
            <Colunas rotulos={diasPer.map((d) => dataBr(d).slice(0, 5))} empilhar formato="inteiro" rotular="nenhum" altura={220}
              series={[{ nome: cal.CONCLUIDA, valores: porDia(cal.CONCLUIDA), cor: "st-bom" }, { nome: cal.ATRASADA, valores: porDia(cal.ATRASADA), cor: "st-critico" },
                { nome: cal.PROGRAMADA, valores: porDia(cal.PROGRAMADA), cor: "serie-1" }]} />
          </Grafico>
          <div className="space-y-4 rounded-cartao border border-borda bg-superficie p-5">
            <div>
              <div className="font-display text-[15px] font-medium">Tipo de trabalho</div>
              <div className="mb-3 mt-0.5 text-[12.5px] text-texto-3">Ordens do período</div>
              <Partes partes={[{ nome: NAT_PLANO, valor: unicas.filter((l) => l.natureza === NAT_PLANO).length, cor: "serie-1" },
                { nome: NAT_BACKLOG, valor: unicas.filter((l) => l.natureza === NAT_BACKLOG).length, cor: "serie-2" }]} />
            </div>
            <div>
              <div className="font-display text-[15px] font-medium">Por turno</div>
              <div className="mb-3 mt-0.5 text-[12.5px] text-texto-3">Linhas da agenda (uma ordem aparece em cada turno que apontou)</div>
              <ul className="space-y-1.5 text-[13px]">
                {cal.ORDEM_TURNOS.map((t, _i, todos) => {
                  const n = porTurno.get(t) ?? 0;
                  const max = Math.max(1, ...todos.map((x) => porTurno.get(x) ?? 0));
                  return (
                    <li key={t} className="grid grid-cols-[150px_1fr_44px] items-center gap-2">
                      <span className="truncate text-texto-2">{t}</span>
                      <span className="h-2 rounded-full bg-superficie-3"><span className="block h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: "var(--serie-1)" }} /></span>
                      <span className="num text-right font-medium">{inteiro(n)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}

      <Secao titulo="Lista das ordens do período" destaque={`· ${inteiro(r.ordens)} ordens`} sub="Uma linha por ordem e turno. Baixe em CSV para abrir no Excel.">
        {noPeriodo.length > MAX_LISTA && <Aviso>A lista mostra as {inteiro(MAX_LISTA)} primeiras linhas; refine os filtros para ver o resto.</Aviso>}
        <TabelaLonga altura={460} csv={`calendario_ordens_${iso(ini).replaceAll("-", "")}_${iso(fim).replaceAll("-", "")}`} vazio="Nenhuma ordem no período e filtro."
          colunas={[{ titulo: "Dia", largura: 96 }, { titulo: "Turno", largura: 150 }, { titulo: "Ordem", largura: 100 }, { titulo: "Título", largura: 220 },
            { titulo: "Texto", largura: 240 }, { titulo: "Tipo", largura: 64 }, { titulo: "Natureza", largura: 150 }, { titulo: "Situação", largura: 110 },
            { titulo: "Situação da ordem", largura: 160 }, { titulo: "Quem", largura: 280 }, { titulo: "Duração", largura: 90 },
            { titulo: "Setor", largura: 120 }, { titulo: "Centro de trabalho", largura: 130 }, { titulo: "Localização", largura: 140 }]}
          linhas={noPeriodo.slice(0, MAX_LISTA).map((l) => [dataBr(l.dia), l.turno, l.ordem, (l.ajustada ? "↻ " : "") + l.titulo, l.texto, l.tipo, l.natureza,
            { t: l.situacao, forte: l.situacao === cal.ATRASADA }, l.situacaoOrdem, l.quem, cal.duracao(l.duracaoH),
            setorDoCentro(l.centroTrabalho), l.centroTrabalho, l.localizacao])} />
      </Secao>
    </>,
  );
}

const FUNDO: Record<string, string> = {
  [NAT_PLANO]: "color-mix(in srgb, var(--serie-1) 11%, var(--superficie))",
  [NAT_BACKLOG]: "color-mix(in srgb, var(--serie-2) 13%, var(--superficie))",
};
const BORDA: Record<string, string> = { concluida: "var(--st-bom)", atrasada: "var(--st-critico)", cancelada: "var(--texto-4)", "": "var(--borda-forte)" };

function Cartao({ k }: { k: cal.Cartao }) {
  return (
    <div title={k.dica} className={clsx("rounded-md border border-borda py-1 pl-2 pr-1.5 text-[11.5px] leading-tight", k.borda === "cancelada" && "opacity-60")}
      style={{ background: k.fundo === "backlog" ? FUNDO[NAT_BACKLOG] : FUNDO[NAT_PLANO], borderLeft: `3px solid ${BORDA[k.borda]}` }}>
      <div className={clsx("truncate font-medium", k.borda === "cancelada" && "line-through")}>{k.titulo}</div>
      <div className="truncate text-[10.5px] text-texto-3">{k.item.ordem}{k.quem ? ` · ${k.quem}` : ""}</div>
    </div>
  );
}

function Turno({ t, escondidos }: { t: cal.TurnoDoDia; escondidos?: boolean }) {
  const cartoes = escondidos ? t.escondidos : t.visiveis;
  if (!cartoes.length) return null;
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.05em] text-texto-3">{t.turno}</div>
      {cartoes.map((k) => <Cartao key={`${k.item.ordem}-${k.item.turno}`} k={k} />)}
    </div>
  );
}

function CelulaDia({ d }: { d: cal.DiaDoCalendario }) {
  if (d.vazio) return <div className="min-h-[120px] border-r border-borda bg-superficie-2/50 last:border-r-0" />;
  return (
    <div className={clsx("min-h-[120px] min-w-0 space-y-1.5 border-r border-borda p-1.5 last:border-r-0", d.fora && "opacity-50",
      d.hoje && "ring-2 ring-inset ring-[var(--serie-1)]")}>
      <div className="flex items-baseline justify-between gap-1 px-0.5">
        <span className="num font-display text-[15px] font-semibold">{d.numero}{(d.numero === 1 || d.hoje) && <span className="ml-1 text-[10px] font-medium text-texto-3">{d.mes}</span>}</span>
        <span className="truncate text-[10.5px] text-texto-3">{d.total || "Sem programação"}</span>
      </div>
      {d.turnos.map((t) => <Turno key={t.turno} t={t} />)}
      {d.escondidos > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none rounded-md px-1 py-0.5 text-[11px] font-medium text-texto-2 hover:bg-superficie-2">+{d.escondidos} ordem(ns)</summary>
          <div className="mt-1 space-y-1.5">{d.turnos.map((t) => <Turno key={t.turno} t={t} escondidos />)}</div>
        </details>
      )}
    </div>
  );
}
