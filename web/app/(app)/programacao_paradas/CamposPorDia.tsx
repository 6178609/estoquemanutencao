"use client";

import { useState } from "react";

import { listaDeCampos, type CamposDoDia } from "@/lib/paradas/visoes";

import { ddmmaaaa, mesBr, mesDoDia } from "./comum";
import { BotaoCopiar } from "./Copiar";

/** Visão "Campos por dia" (V4): os campos de ordenação das máquinas que param em cada dia, prontos para colar no SAP. */
export function CamposPorDia({ dias, meses }: { dias: CamposDoDia[]; meses: string[] }) {
  const [mes, setMes] = useState(meses[0] ?? "");
  const vis = dias.filter((d) => mesDoDia(d.data) === mes);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-texto-3">Mês</span>
          <select value={mes} onChange={(e) => setMes(e.target.value)} className="rounded-lg border border-borda bg-superficie px-2 py-1.5">
            {meses.map((m) => <option key={m} value={m}>{mesBr(m)}</option>)}
          </select>
        </label>
        <BotaoCopiar texto={listaDeCampos(vis)} rotulo={`Copiar lista do mês (${mesBr(mes)})`} />
      </div>
      <ul className="divide-y divide-borda rounded-cartao border border-borda bg-superficie" aria-label="Campos de ordenação por dia">
        {vis.map((d) => (
          <li key={d.data} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-4" data-campos-dia={d.data}>
            <div className="w-40 shrink-0 text-[12.5px]">
              <p className="font-semibold">{d.dia} {ddmmaaaa(d.data)}</p>
              <p className="text-texto-3">Semana {d.semana} · {d.maquinas} máquina(s)</p>
              <p className="text-texto-3">{d.situacao}</p>
            </div>
            <div className="min-w-0 flex-1 space-y-1 text-[12.5px]">
              {d.t1.length > 0 && <p><span className="text-texto-3">1º turno: </span>{d.t1.join(" · ")}</p>}
              {d.t2.length > 0 && <p><span className="text-texto-3">2º turno: </span>{d.t2.join(" · ")}</p>}
              <p className="break-all font-mono text-[12px] text-texto-2">{d.lista}</p>
            </div>
            <BotaoCopiar texto={d.lista} rotulo={`Copiar lista de ${ddmmaaaa(d.data)}`} compacto />
          </li>
        ))}
        {!vis.length && <li className="px-3 py-6 text-center text-[13px] text-texto-3">Nenhuma parada neste mês.</li>}
      </ul>
    </div>
  );
}
