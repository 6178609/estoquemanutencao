"use client";

import clsx from "clsx";
import { AlertTriangle, CalendarCheck, CalendarDays, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

import { Seletor } from "@/components/Campos";
import { Cartao, Kpi, Selo } from "@/components/ui";
import { alertasDoCalendario, resumoAlertasCalendario } from "@/lib/agendaHh/analise";
import {
  type Alerta, type ItemCalendario, type Periodo, type Programacao, type Tecnico, TURNOS_PROGRAMACAO, calendario, comparar, deIso,
  diaDaSemana, formatarHoras, formatarMinutos, mesCurto, periodoDaVisao, ROTULO_STATUS,
} from "@/lib/agendaHh/regras";

import { SeletorPeriodo } from "./Comparativo";

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const SEMANA_LONGA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const OPCOES_TURNO: Record<string, string> = { ...Object.fromEntries(TURNOS_PROGRAMACAO.map((t) => [t, t])), "sem turno": "Sem turno" };

/** Status → cor da faixa à esquerda do item (concluída verde, reprogramada laranja, programada azul). */
const BORDA_STATUS: Record<string, string> = {
  concluida: "border-l-[var(--st-bom)]", reprogramada: "border-l-[var(--serie-2)]", programada: "border-l-[var(--serie-1)]",
};

export function Calendario({ tecnicos, programacoes, hoje, aoAbrir }: {
  tecnicos: Tecnico[]; programacoes: Programacao[]; hoje: string;
  /** Abre a programação para edição (num grupo com várias, a pessoa escolhe qual); sem ela, os itens são só leitura. */
  aoAbrir?: (id: string) => void;
}) {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDaVisao("mes", hoje));
  const [area, setArea] = useState("");
  const [turno, setTurno] = useState("");
  const [soComProgramacao, setSoComProgramacao] = useState(false);

  const areas = useMemo(() => [...new Set(programacoes.map((p) => p.area).filter(Boolean))].sort(comparar), [programacoes]);
  const areaAtiva = areas.includes(area) ? area : "";
  const filtros = useMemo(() => ({ area: areaAtiva, turno }), [areaAtiva, turno]);
  const cal = useMemo(() => calendario(programacoes, periodo, filtros), [programacoes, periodo, filtros]);
  const porId = useMemo(() => new Map(programacoes.map((p) => [p.id, p])), [programacoes]);
  const alertasDia = useMemo(() => alertasDoCalendario(tecnicos, programacoes, periodo, filtros), [tecnicos, programacoes, periodo, filtros]);
  const resumo = useMemo(() => resumoAlertasCalendario(alertasDia), [alertasDia]);

  const vazios = cal.datas.length ? diaDaSemana(cal.datas[0]) : 0;
  const datas = soComProgramacao ? cal.datas.filter((d) => cal.dias.has(d) || alertasDia.has(d)) : cal.datas;

  return (
    <div className="space-y-5">
      <Cartao className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} hoje={hoje} rotulo="calendario" />
          <Seletor rotulo="Área de atuação" name="calendario-area" vazio="Todas as áreas" value={areaAtiva}
            opcoes={Object.fromEntries(areas.map((a) => [a, a]))} onChange={(e) => setArea(e.target.value)} />
          <Seletor rotulo="Turno da programação" name="calendario-turno" vazio="Todos os turnos" value={turno} opcoes={OPCOES_TURNO}
            onChange={(e) => setTurno(e.target.value)} />
        </div>
        <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13.5px] text-texto-2">
          <input type="checkbox" checked={soComProgramacao} onChange={(e) => setSoComProgramacao(e.target.checked)} className="size-4 accent-[var(--acao)]" />
          Mostrar só os dias com programação
        </label>
      </Cartao>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Dias no período" valor={String(cal.datas.length)} icone={CalendarDays} tom="azul" />
        <Kpi rotulo="Dias com programação" valor={String(cal.diasComProgramacao)} icone={CalendarCheck} tom="verde" />
        <Kpi rotulo="Equipamentos relacionados" valor={String(cal.equipamentos)} icone={Wrench} tom="laranja" />
        <Kpi rotulo="Dias com alerta" valor={String(resumo.dias)} icone={AlertTriangle} tom="vermelho"
          status={resumo.dias ? { cor: "vermelho", texto: "Rever programação" } : { cor: "verde", texto: "Sem alertas" }}
          detalhe={resumo.dias ? `${resumo.sobrecarga} acima da jornada · ${resumo.foraDoDia} em dia sem expediente` : undefined}
          dica="Técnico com mais horas programadas do que as do dia, ou programado em fim de semana, férias ou folga. Concluídas não contam." />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-texto-2" aria-label="Legenda do calendário">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded-full bg-[var(--serie-1)]" />Programada</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded-full bg-[var(--serie-2)]" />Reprogramada</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-1 rounded-full bg-[var(--st-bom)]" />Concluída</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-[3px] border-2 border-[var(--st-critico)]" />Dia com alerta</span>
      </div>

      <section aria-label="Calendário de programação" className="rounded-cartao border border-borda bg-superficie p-2 sm:p-3">
        <div className={clsx("mb-2 hidden grid-cols-7 gap-2 text-center text-[12px] font-medium text-texto-3", !soComProgramacao && "lg:grid")} aria-hidden>
          {SEMANA.map((d) => <span key={d}>{d}</span>)}
        </div>
        <ol className={clsx("grid grid-cols-1 gap-2 sm:grid-cols-2", !soComProgramacao && "lg:grid-cols-7")}>
          {!soComProgramacao && Array.from({ length: vazios }, (_, i) => <li key={`v${i}`} aria-hidden className="hidden lg:block" />)}
          {datas.map((d) => (
            <Dia key={d} data={d} hoje={hoje} itens={cal.dias.get(d) ?? []} alertas={alertasDia.get(d) ?? []} turnoAtivo={turno} aoAbrir={aoAbrir} porId={porId} />
          ))}
        </ol>
        {!cal.total && (
          <div className="px-4 py-6 text-center">
            <h3 className="font-display text-[15px] font-medium">Nenhuma programação no período</h3>
            <p className="mt-1 text-[13px] text-texto-3">As datas continuam visíveis para facilitar o planejamento.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Dia({ data, hoje, itens, alertas, turnoAtivo, aoAbrir, porId }: {
  data: string; hoje: string; itens: ItemCalendario[]; alertas: Alerta[]; turnoAtivo: string; aoAbrir?: (id: string) => void;
  porId: Map<string, Programacao>;
}) {
  const w = diaDaSemana(data);
  const fimDeSemana = w === 0 || w === 6;
  const sobrecarga = alertas.filter((a) => a.motivo === "sobrecarga");
  const fora = alertas.filter((a) => a.motivo !== "sobrecarga");
  const nomesAlerta = new Set(alertas.map((a) => a.nome.toLocaleLowerCase("pt-BR")));
  const ehHoje = data === hoje;
  const grupos: [string, string][] = [["1º turno", "1º turno"], ["2º turno", "2º turno"], ["", "Sem turno"]];
  const total = itens.reduce((s, i) => s + i.minutos, 0);
  return (
    <li aria-current={ehHoje ? "date" : undefined}
      className={clsx("flex min-h-[120px] min-w-0 flex-col rounded-xl border p-2.5",
        alertas.length ? "border-2 border-[var(--st-critico)]" : ehHoje ? "border-2 border-[var(--acao)]" : "border-borda",
        fimDeSemana && !itens.length ? "bg-superficie-2" : "bg-superficie")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <strong className="num font-display text-[20px] leading-none">{deIso(data)?.getUTCDate()}</strong>
          <span className="text-[12px] text-texto-3">{mesCurto(data)}</span>
          <span className={clsx("text-[12px] text-texto-3", !fimDeSemana && "lg:hidden")}>· {SEMANA[w]}</span>
          <span className="sr-only">{SEMANA_LONGA[w]}{ehHoje ? ", hoje" : ""}</span>
        </div>
        {total > 0 && <span className="num text-[11.5px] text-texto-3" title="Tempo programado no dia">{formatarMinutos(total)}</span>}
      </div>

      {alertas.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="flex flex-wrap gap-1">
            {sobrecarga.length > 0 && <Selo cor="vermelho"><AlertTriangle className="size-3" aria-hidden />Acima da jornada</Selo>}
            {[...new Set(fora.map((a) => a.motivo))].map((m) => <Selo key={m} cor="laranja">Em {m}</Selo>)}
          </div>
          <ul className="space-y-0.5 text-[11.5px] leading-snug text-[var(--selo-critico-texto)]">
            {alertas.map((a) => (
              <li key={`${a.tecnicoId}-${a.motivo}`} className="break-words">
                <b className="font-semibold">{a.nome}</b>:{" "}
                {a.motivo === "sobrecarga" ? `${formatarHoras(a.programado)} programadas / ${formatarHoras(a.disponivel)} no dia`
                  : `${formatarHoras(a.programado)} em dia de ${a.motivo}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex-1 space-y-2">
        {!itens.length ? <span className="text-[12px] text-texto-4">Sem programação</span> : grupos.map(([t, rotulo]) => {
          const g = itens.filter((i) => i.turno === t);
          if (!g.length && (t === "" || turnoAtivo)) return null;
          return (
            <div key={rotulo}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-texto-3">{rotulo}</div>
              {g.length ? (
                <ul className="space-y-1">
                  {g.map((i) => <Item key={i.id + i.turno} item={i} alerta={i.tecnicos.some((n) => nomesAlerta.has(n.toLocaleLowerCase("pt-BR")))} aoAbrir={aoAbrir} porId={porId} />)}
                </ul>
              ) : <span className="text-[12px] text-texto-4">Sem programação</span>}
            </div>
          );
        })}
      </div>
    </li>
  );
}

function Item({ item, alerta, aoAbrir, porId }: { item: ItemCalendario; alerta: boolean; aoAbrir?: (id: string) => void;
  porId: Map<string, Programacao> }) {
  const [escolher, setEscolher] = useState(false);
  const varias = item.ids.length > 1;
  const detalhe = `${item.tecnicos.join(", ") || "Sem técnico"} • ${formatarMinutos(item.minutos)}${item.quantidade > 1 ? ` • ${item.quantidade} programações` : ""}`;
  const conteudo = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <Wrench className="size-3.5 shrink-0 text-texto-3" aria-hidden />
        <strong className="min-w-0 break-words text-[12.5px] font-semibold text-texto">{item.equipamento}</strong>
        {alerta && <AlertTriangle className="size-3.5 shrink-0 text-[var(--selo-critico-texto)]" aria-label="Técnico com alerta neste dia" />}
      </span>
      <span className="block break-words text-[11.5px] text-texto-3">{detalhe}</span>
    </>
  );
  const cls = clsx("block w-full min-w-0 rounded-lg border border-l-4 border-borda px-2 py-1.5 text-left",
    BORDA_STATUS[item.status] ?? "border-l-[var(--texto-4)]", alerta ? "bg-[var(--selo-critico-fundo)]" : "bg-superficie-2");
  const titulo = item.descricoes.join(" • ") || undefined;
  return (
    <li>
      {aoAbrir ? (
        <button type="button" onClick={() => (varias ? setEscolher((v) => !v) : aoAbrir(item.id))} title={titulo}
          aria-expanded={varias ? escolher : undefined} className={clsx(cls, "min-h-11 transition hover:border-borda-forte")}>{conteudo}</button>
      ) : <div title={titulo} className={cls}>{conteudo}</div>}
      {aoAbrir && varias && escolher && (
        <ul className="mt-1 space-y-1 pl-2" aria-label={`Escolha qual programação de ${item.equipamento} abrir`}>
          {item.ids.map((id) => {
            const p = porId.get(id);
            if (!p) return null;
            return (
              <li key={id}>
                <button type="button" onClick={() => { setEscolher(false); aoAbrir(id); }}
                  className="block min-h-11 w-full min-w-0 rounded-lg border border-borda bg-superficie px-2 py-1.5 text-left text-[11.5px] transition hover:border-borda-forte">
                  <span className="block break-words font-semibold text-texto">Ordem {p.ordem || "—"} · {ROTULO_STATUS[p.status]}</span>
                  <span className="block break-words text-texto-3">{p.tecnicoNome || "Sem técnico"} • {formatarMinutos(p.minutos)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}
