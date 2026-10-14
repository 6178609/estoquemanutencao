import clsx from "clsx";
import type { Metadata } from "next";

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
import { camposDeOrdenacao } from "@/lib/wcm/camposOrdenacao";
import { ARQ_LOTES, datasAlteradas, nomesDeAtivos } from "@/lib/wcm/programacao";

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
    sobre="Programação · IW38" subtitulo="Os ativos com ordem em cada dia (data-base de início do IW38): o campo de ordenação e o equipamento principal; abra o ativo para ver as ordens." />;
  const moldura = (filhos: React.ReactNode) => (
    <PaginaWcm barra={{ ...b, recorte: "Área, centro e tipo valem aqui; o período é o da página" }} periodo={false}>{filhos}</PaginaWcm>
  );
  const ordensBase = c.b.ordens.dados;
  if (!ordensBase) return moldura(<>{cab}<SemDados base="IW38 (ordens)" /></>);

  const hoje = c.b.hoje;
  const mesIni = hoje - (partes(hoje).dia - 1);
  const [ini, fim] = periodo(params, "cde", "cate", [mesIni, fimDoMes(mesIni)]);
  const iniJanela = cal.inicioSemana(ini), fimJanela = cal.inicioSemana(fim) + 6;

  // mudanças de data já feitas pelo robô do SAP que o IW38 exportado ainda não traz
  let ajustes: Record<string, [string, string]> = {};
  try { ajustes = datasAlteradas(await lerCadastro(ARQ_LOTES), c.b.ordens.atualizado); } catch { ajustes = {}; }

  // recorte global (área, centro, tipo) e só as ordens da janela do calendário
  const { areas, tipos } = c.f, centros = c.centros;
  const recortadas = ordensBase.filter((o) => (!areas.length || areas.includes(o.localizacao))
    && (!centros.length || centros.includes(o.centroTrabalho)) && (!tipos.length || tipos.includes(o.tipo)));
  const ajustadas = cal.comDatasAlteradas(recortadas, ajustes) ?? [];
  const naJanela = ajustadas.filter((o) => o.data != null && o.data >= iniJanela && o.data <= fimJanela);
  const ag = cal.agenda(naJanela, c.b.operacoes.dados, c.b.confirmacoes.dados, c.b.equipe.dados, hoje);

  // cada dia mostra os ATIVOS: campo de ordenação do IW38 (sem ele, o equipamento) + o equipamento principal
  const campoDe = await camposDeOrdenacao(ordensBase);
  const nomes = nomesDeAtivos(ordensBase.map((o) => ({ equipamento: o.equipamento, campo: campoDe.get(o.ordem) ?? "", objeto: o.objeto })),
    (c.b.equipamentos.dados ?? []).map((e) => [e.equipamento, e.denominacao]));
  const ativoDe = new Map(ordensBase.map((o) => {
    const campo = (campoDe.get(o.ordem) ?? "").trim().toUpperCase(), equip = (o.equipamento || "").trim().toUpperCase();
    const chave = campo || equip;
    return [o.ordem, { chave: chave || "Sem ativo", campo: !!campo, nome: (chave && nomes[chave]) || o.objeto || "" }];
  }));
  // filtros da página
  const busca = um(params, "cq");
  const selSit = params.csit !== undefined ? lista(params, "csit") : PADRAO_SIT;
  const selNat = lista(params, "cnat"), selTur = lista(params, "ctur"), selLoc = lista(params, "cloc");
  const selSet = lista(params, "cset"), selCt = lista(params, "cct");
  const centrosCal = [...new Set(ag.map((l) => l.centroTrabalho).filter(Boolean))].sort();
  const filtroPag = { situacoes: selSit, naturezas: selNat, turnos: selTur, localizacoes: selLoc, centros: selCt, setores: selSet };
  // a busca acha também o campo de ordenação e o nome do equipamento principal (o destaque de cada dia)
  const termo = busca.trim().toUpperCase();
  const doAtivo = (o: string) => { const a = ativoDe.get(o); return !!a && (a.chave.includes(termo) || a.nome.toUpperCase().includes(termo)); };
  const semBusca = cal.filtrarAgenda(ag, { busca: "", ...filtroPag });
  const porTexto = termo ? new Set(cal.filtrarAgenda(ag, { busca, ...filtroPag })) : null;
  const vis = porTexto ? semBusca.filter((l) => porTexto.has(l) || doAtivo(l.ordem)) : semBusca;
  const noPeriodo = vis.filter((l) => l.dia >= ini && l.dia <= fim);
  const r = cal.resumoAgenda(noPeriodo);
  const fimGrade = Math.min(fim, ini + cal.MAX_DIAS_GRADE - 1);
  const dias = cal.diasDoCalendario(vis, ini, fimGrade, hoje, null, fimGrade - ini < 14 ? 12 : 4);
  const semanas = Array.from({ length: dias.length / 7 }, (_, i) => dias.slice(i * 7, i * 7 + 7));

  const ativosDia = ativosPorDia(vis, ativoDe, fimGrade - ini < 14 ? 10 : 5);

  const controles = (
    <div className="space-y-2">
      <Controles controles={[
        { tipo: "periodo", de: "cde", ate: "cate", valorDe: iso(ini), valorAte: iso(fim), rotulo: "Período",
          atalhos: atalhos(hoje, ["Este mês", "Mês passado", "Próximo mês", "Esta semana", "Próxima semana", "Semana passada"]) },
        { tipo: "busca", chave: "cq", valor: busca, placeholder: "Campo de ordenação, ativo, ordem, texto, pessoa…" },
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
        sub="Uma linha por ativo no dia: o campo de ordenação (ou o equipamento, quando a ordem não tem campo) e o nome do equipamento principal, com quantas ordens ele tem. Clique no ativo para ver as ordens; a lista completa está abaixo.">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-texto-2">
          <span className="text-texto-3">Faixa à esquerda = a pior situação das ordens do ativo no dia:</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded-full" style={{ background: "var(--st-bom)" }} />Concluída</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded-full" style={{ background: "var(--st-critico)" }} />Atrasada</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded-full" style={{ background: "var(--borda-forte)" }} />Programada</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded-full" style={{ background: "var(--texto-4)" }} />Cancelada</span>
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
                {s.map((d) => <CelulaDia key={d.dia} d={d} ativos={ativosDia.get(d.dia) ?? null} />)}
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

// pior situação primeiro: é ela que pinta a faixa do ativo
const PESO: Record<string, number> = { [cal.ATRASADA]: 0, [cal.PROGRAMADA]: 1, [cal.CONCLUIDA]: 2, [cal.CANCELADA]: 3 };
const COR_SIT: Record<string, string> = { [cal.ATRASADA]: "var(--st-critico)", [cal.PROGRAMADA]: "var(--borda-forte)",
  [cal.CONCLUIDA]: "var(--st-bom)", [cal.CANCELADA]: "var(--texto-4)" };

interface OrdemDoAtivo { ordem: string; titulo: string; situacao: string; natureza: string; ajustada: boolean }
interface AtivoDoDia { chave: string; campo: boolean; nome: string; situacao: string; ordens: OrdemDoAtivo[] }
interface DiaAtivos { visiveis: AtivoDoDia[]; escondidos: AtivoDoDia[] }

/** Ordens distintas de cada dia agrupadas por ativo (campo de ordenação ou equipamento), o ativo com mais ordens primeiro. */
function ativosPorDia(ag: cal.ItemAgenda[], ativoDe: Map<string, { chave: string; campo: boolean; nome: string }>, max: number): Map<number, DiaAtivos> {
  const porDia = new Map<number, Map<string, AtivoDoDia>>();
  const vistas = new Set<string>();
  for (const l of ag) {
    const k = `${l.dia}|${l.ordem}`;
    if (vistas.has(k)) continue; // a agenda repete a ordem em cada turno que apontou
    vistas.add(k);
    const a = ativoDe.get(l.ordem) ?? { chave: "Sem ativo", campo: false, nome: "" };
    const dia = porDia.get(l.dia) ?? porDia.set(l.dia, new Map()).get(l.dia)!;
    const at = dia.get(a.chave) ?? dia.set(a.chave, { ...a, situacao: l.situacao, ordens: [] }).get(a.chave)!;
    at.ordens.push({ ordem: l.ordem, titulo: l.titulo, situacao: l.situacao, natureza: l.natureza, ajustada: l.ajustada });
    if ((PESO[l.situacao] ?? 9) < (PESO[at.situacao] ?? 9)) at.situacao = l.situacao;
  }
  const out = new Map<number, DiaAtivos>();
  for (const [d, m] of porDia) {
    const lista = [...m.values()].sort((x, y) => y.ordens.length - x.ordens.length || x.chave.localeCompare(y.chave, "pt-BR", { numeric: true }));
    for (const x of lista) x.ordens.sort((p, q) => (PESO[p.situacao] ?? 9) - (PESO[q.situacao] ?? 9) || p.ordem.localeCompare(q.ordem));
    out.set(d, { visiveis: lista.slice(0, max), escondidos: lista.slice(max) });
  }
  return out;
}

function LinhaAtivo({ a }: { a: AtivoDoDia }) {
  return (
    <details className="group rounded-md border border-borda bg-superficie text-[11.5px] leading-tight"
      style={{ borderLeft: `3px solid ${COR_SIT[a.situacao] ?? "var(--borda-forte)"}` }}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 pl-1.5 pr-1 [&::-webkit-details-marker]:hidden"
        title={`${a.chave}${a.nome ? " · " + a.nome : ""} — ${a.ordens.length} ordem(ns)`}>
        <span className="min-w-0 flex-1">
          <span className={clsx("block truncate font-mono font-semibold", !a.campo && "text-texto-2")}>{a.chave}</span>
          {a.nome && <span className="block truncate text-[10.5px] text-texto-3">{a.nome}</span>}
        </span>
        <span className="num shrink-0 rounded-full bg-superficie-3 px-1.5 text-[10.5px] font-medium text-texto-2">{a.ordens.length}</span>
      </summary>
      <ul className="space-y-0.5 border-t border-borda px-1.5 py-1 text-[10.5px]">
        {a.ordens.map((o) => (
          <li key={o.ordem} className={clsx("truncate", o.situacao === cal.CANCELADA && "line-through opacity-60")} title={`${o.ordem} · ${o.titulo} · ${o.situacao}`}>
            <span className="inline-block size-1.5 -translate-y-px rounded-full" style={{ background: COR_SIT[o.situacao] }} />{" "}
            <span className="num font-medium">{o.ordem}</span>{o.ajustada ? " ↻" : ""} <span className="text-texto-3">{o.titulo}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function CelulaDia({ d, ativos }: { d: cal.DiaDoCalendario; ativos: DiaAtivos | null }) {
  if (d.vazio) return <div className="min-h-[120px] border-r border-borda bg-superficie-2/50 last:border-r-0" />;
  const n = ativos ? ativos.visiveis.length + ativos.escondidos.length : 0;
  return (
    <div className={clsx("min-h-[120px] min-w-0 space-y-1 border-r border-borda p-1.5 last:border-r-0", d.fora && "opacity-50",
      d.hoje && "ring-2 ring-inset ring-[var(--serie-1)]")}>
      <div className="flex items-baseline justify-between gap-1 px-0.5">
        <span className="num font-display text-[15px] font-semibold">{d.numero}{(d.numero === 1 || d.hoje) && <span className="ml-1 text-[10px] font-medium text-texto-3">{d.mes}</span>}</span>
        <span className="truncate text-[10.5px] text-texto-3">{n ? `${n} ativo(s) · ${d.ordens} ordem(ns)` : "Sem programação"}</span>
      </div>
      {ativos?.visiveis.map((a) => <LinhaAtivo key={a.chave} a={a} />)}
      {!!ativos?.escondidos.length && (
        <details>
          <summary className="cursor-pointer list-none rounded-md px-1 py-0.5 text-[11px] font-medium text-texto-2 hover:bg-superficie-2">+{ativos.escondidos.length} ativo(s)</summary>
          <div className="mt-1 space-y-1">{ativos.escondidos.map((a) => <LinhaAtivo key={a.chave} a={a} />)}</div>
        </details>
      )}
    </div>
  );
}
