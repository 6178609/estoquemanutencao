"use client";

import { Printer } from "lucide-react";
import { useState } from "react";

import type { CalendarioMes } from "@/lib/paradas/calendarioVisao";

const h = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const NOME_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesLongo = (m: string) => `${NOME_MES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
const DIA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const ddmm = (d: number) => { const x = new Date(d * 86_400_000); return `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}`; };
const diaSem = (d: number) => DIA[new Date(d * 86_400_000).getUTCDay()];

/** Cor de cada grupo crítico (sempre com o nome do grupo escrito: a cor só ajuda). */
export const COR_GRUPO: Record<string, string> = {
  "DRY BLEND": "var(--serie-1)", BANBURY: "var(--serie-2)", "PRENSA/MOINHO SF": "var(--serie-3)", PELLET: "var(--serie-4)", "INJ EXP": "var(--seq-6)",
};

/** Visão "Calendário": um mês por vez, semanas de segunda a sábado, cartões por turno; imprime em A4 paisagem. */
export function Calendario({ meses }: { meses: CalendarioMes[] }) {
  const [i, setI] = useState(0);
  const c = meses[i];
  if (!c) return <p className="text-[13px] text-texto-3">Sem meses no horizonte.</p>;
  const r = c.resumo;
  return (
    <div className="calendario-paradas space-y-4">
      {/* impressão do mural: A4 paisagem, só o calendário */}
      <style>{"@media print{@page{size:A4 landscape;margin:7mm}body *{visibility:hidden}.calendario-paradas,.calendario-paradas *{visibility:visible}"
        + ".calendario-paradas{position:absolute;left:0;top:0;width:100%;font-size:9px}.calendario-paradas .cal-dia{break-inside:avoid}}"}</style>
      <div className="nao-imprimir flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-texto-3">Mês</span>
          <select value={i} onChange={(e) => setI(Number(e.target.value))} className="rounded-lg border border-borda bg-superficie px-2 py-1.5">
            {meses.map((m, k) => <option key={m.mes} value={k}>{mesLongo(m.mes)}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borda bg-superficie px-3 text-[13px] transition hover:bg-superficie-2">
          <Printer className="size-3.5" aria-hidden /> Imprimir (A4 paisagem)
        </button>
      </div>
      <h3 className="font-display text-[18px] font-medium">Programação de paradas · {mesLongo(c.mes).replace(/^./, (x) => x.toUpperCase())}</h3>
      {r && (
        <dl className="grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-4">
          {[["Carga IP19", r.carga], ["Capacidade", r.capacidade], ["Programado", r.programado], ["Ativos sem HH", r.semHh]].map(([t, v]) => {
            const x = v as { mec: number; ele: number };
            return (
              <div key={t as string} className="rounded-lg border border-borda bg-superficie px-3 py-2">
                <dt className="text-texto-3">{t as string}</dt>
                <dd className="tabular-nums font-medium">MEC {h(x.mec)} h · ELE {h(x.ele)} h</dd>
              </div>
            );
          })}
        </dl>
      )}
      <ul className="flex flex-wrap gap-3 text-[12px] text-texto-3" aria-label="Legenda dos grupos críticos">
        {Object.entries(COR_GRUPO).map(([g, cor]) => (
          <li key={g} className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-1.5 rounded-sm" style={{ background: cor }} />{g}</li>
        ))}
        <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-1.5 rounded-sm bg-[var(--borda-forte)]" />não crítico</li>
      </ul>
      {c.semanas.map((s) => (
        <section key={s.rotulo} aria-label={s.rotulo} className="space-y-1.5">
          <h4 className="text-[12px] font-medium text-texto-3">{s.rotulo}</h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6">
            {s.dias.map((d) => <DiaCal key={d.data} d={d} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function DiaCal({ d }: { d: CalendarioMes["semanas"][number]["dias"][number] }) {
  const titulo = `${diaSem(d.data)} ${ddmm(d.data)}`;
  if (!d.doMes) {
    return <div className="cal-dia hidden rounded-lg border border-dashed border-borda bg-superficie-2 px-2 py-1.5 text-[12px] text-texto-4 sm:block">{titulo}</div>;
  }
  const sem = d.condicao !== "util" && d.condicao !== "sabado";
  return (
    <div className="cal-dia min-w-0 rounded-lg border border-borda bg-superficie px-2 py-1.5" data-dia={d.data}>
      <p className="text-[12.5px] font-semibold">{titulo}</p>
      {!sem && <p className="text-[11px] tabular-nums text-texto-3">MEC {h(d.hhDia.mec[0])}/{h(d.hhDia.mec[1])} h · ELE {h(d.hhDia.ele[0])}/{h(d.hhDia.ele[1])} h</p>}
      {sem && <p className="mt-1 text-[12px] text-texto-3">{d.condicao === "feriado" ? `Feriado – ${d.feriado ?? ""}` : d.condicao === "antes" ? "Antes do início" : "Sem atuação"}</p>}
      {d.turnos.map((t) => (
        <div key={t.t} className="mt-1.5">
          <p className="text-[10.5px] uppercase tracking-wide text-texto-3">{t.t}º turno · {t.janela}</p>
          {!t.cartoes.length && <p className="text-[11.5px] text-texto-4">— vazio</p>}
          <ul className="mt-0.5 space-y-1">
            {t.cartoes.map((k) => (
              <li key={k.ativo} className="rounded-md border-l-4 bg-superficie-2 px-1.5 py-1 text-[11.5px] leading-snug"
                style={{ borderLeftColor: k.grupo ? COR_GRUPO[k.grupo] : "var(--borda-forte)", ...(k.alerta ? { outline: "2px solid var(--st-critico)" } : {}) }}>
                <span className="block font-semibold break-words">{k.rotulo}</span>
                <span className="block tabular-nums text-texto-3">MEC {h(k.hh.mec)} | ELE {h(k.hh.ele)} h{k.grupo ? ` · ${k.grupo}` : ""}</span>
                {k.marcas.length > 0 && <span className="block text-texto-3">{k.marcas.join(" · ")}</span>}
                {k.alerta && <span className="block font-semibold" style={{ color: "var(--selo-critico-texto)" }}>Regra quebrada (ver Programação)</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
