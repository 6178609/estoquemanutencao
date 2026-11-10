"use client";

import { useState } from "react";

import type { LinhaSaldo, ResumoMes } from "@/lib/paradas/visoes";

import { ddmmaaaa, h, mesBr, mesDoDia } from "./comum";

const par = (x: { mec: number; ele: number }) => `${h(x.mec)} / ${h(x.ele)}`;

/** Visão "Saldo HH" (V3): dia a dia, por turno, o HH usado × capacidade e o saldo que sobra para o backlog. */
export function SaldoHh({ saldo, resumo }: { saldo: LinhaSaldo[]; resumo: ResumoMes[] }) {
  const [mes, setMes] = useState(resumo[0]?.mes ?? "");
  const dias = saldo.filter((l) => mesDoDia(l.data) === mes);
  const r = resumo.find((x) => x.mes === mes);
  const comAcima = dias.some((l) => l.acima.mec + l.acima.ele > 0);
  const ativos = (t: LinhaSaldo["t1"]) => t.ativos.map((a) => a.ativo).join(", ");
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-[13px]">
        <span className="text-texto-3">Mês</span>
        <select value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-lg border border-borda bg-superficie px-2 py-1.5">
          {resumo.map((x) => <option key={x.mes} value={x.mes}>{mesBr(x.mes)}</option>)}
        </select>
      </label>
      {r && (
        <dl className="grid grid-cols-2 gap-2 text-[12.5px] sm:grid-cols-3 lg:grid-cols-6">
          {([["Carga IP19", r.carga], ["Capacidade", r.capacidade], ["Programado", r.programado], ["Saldo (cap − carga)", r.saldo],
            ["Saldo p/ backlog", r.backlog], ["Ativos sem HH", r.semHh]] as const).map(([t, v]) => (
            <div key={t} className="rounded-lg border border-borda bg-superficie px-3 py-2">
              <dt className="text-texto-3">{t} <span className="text-texto-4">MEC / ELE</span></dt>
              <dd className="tabular-nums font-medium">{par(v)} h</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="max-h-[70vh] overflow-auto rounded-cartao border border-borda bg-superficie">
        <table className="w-full min-w-[1300px] text-left text-[12px]">
          <caption className="sr-only">Saldo de HH dia a dia, por turno</caption>
          <thead className="sticky top-0 z-10 bg-superficie-2 text-[11px] text-texto-3">
            <tr className="border-b border-borda">
              <th scope="col" rowSpan={2} className="px-2 py-1.5 font-medium">Data</th>
              <th scope="col" rowSpan={2} className="px-2 py-1.5 font-medium">Dia</th>
              <th scope="col" rowSpan={2} className="px-2 py-1.5 font-medium">Situação</th>
              <th scope="colgroup" colSpan={4} className="border-l border-borda px-2 py-1.5 text-center font-medium">1º turno (MEC / ELE)</th>
              <th scope="colgroup" colSpan={4} className="border-l border-borda px-2 py-1.5 text-center font-medium">2º turno (MEC / ELE)</th>
              <th scope="colgroup" colSpan={2} className="border-l border-borda px-2 py-1.5 text-center font-medium">Saldo p/ backlog</th>
              {comAcima && <th scope="col" rowSpan={2} className="border-l border-borda px-2 py-1.5 font-medium">Acima do limite</th>}
            </tr>
            <tr className="border-b border-borda">
              {["Ativos", "Cap.", "HH", "Saldo", "Ativos", "Cap.", "HH", "Saldo"].map((x, i) => (
                <th key={i} scope="col" className={`px-2 py-1.5 font-medium ${i % 4 === 0 ? "border-l border-borda" : ""}`}>{x}</th>
              ))}
              <th scope="col" className="border-l border-borda px-2 py-1.5 font-medium">MEC / ELE</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda tabular-nums">
            {dias.map((l) => {
              const sem = l.condicao !== "util" && l.condicao !== "sabado";
              return (
                <tr key={l.data} className={sem ? "bg-superficie-2 text-texto-3" : undefined}>
                  <td className="whitespace-nowrap px-2 py-1">{ddmmaaaa(l.data)}</td>
                  <td className="px-2 py-1">{l.dia}</td>
                  <td className="whitespace-nowrap px-2 py-1">{l.situacao}</td>
                  {[l.t1, l.t2].map((t, i) => [
                    <td key={`a${i}`} className="max-w-[220px] border-l border-borda px-2 py-1" title={ativos(t)}>{ativos(t)}</td>,
                    <td key={`c${i}`} className="whitespace-nowrap px-2 py-1">{par(t.cap)}</td>,
                    <td key={`h${i}`} className="whitespace-nowrap px-2 py-1">{par(t.hh)}</td>,
                    <td key={`s${i}`} className="whitespace-nowrap px-2 py-1" style={t.saldo.mec < 0 || t.saldo.ele < 0 ? { color: "var(--selo-critico-texto)" } : undefined}>{par(t.saldo)}</td>,
                  ])}
                  <td className="whitespace-nowrap border-l border-borda px-2 py-1">{par(l.backlog)}</td>
                  <td className="px-2 py-1 font-medium">{h(l.total)}</td>
                  {comAcima && <td className="whitespace-nowrap border-l border-borda px-2 py-1">{l.acima.mec + l.acima.ele > 0 ? par(l.acima) : ""}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-texto-3">No dia do DRY BLEND o 1º turno não entra no saldo para o backlog (a máquina para sozinha nele).</p>
    </div>
  );
}
