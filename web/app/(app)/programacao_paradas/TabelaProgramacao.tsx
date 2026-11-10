"use client";

import { useMemo, useState } from "react";

export interface LinhaTela {
  id: string; mes: string; data: string; dia: string; semana: number; turno: 1 | 2; ativo: string; equipamentos: string;
  hhMec: number; hhEle: number; parada: string; janela: string; marcas: string[]; itens: number; itensMes: number; datasIp19: string;
  tipo: string; grupo: string; acimaMec: number; acimaEle: number; campos: string; alertas: string[];
}

const h = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const NOME_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesBr = (m: string) => `${NOME_MES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

/** Visão "Programação" (V1): uma linha por ativo, dia e turno; só leitura nesta versão. */
export function TabelaProgramacao({ linhas, meses }: { linhas: LinhaTela[]; meses: string[] }) {
  const [mes, setMes] = useState(meses[0] ?? "");
  const [soAlerta, setSoAlerta] = useState(false);
  const vis = useMemo(() => linhas.filter((l) => (!mes || l.mes === mes) && (!soAlerta || l.alertas.length)), [linhas, mes, soAlerta]);
  const nAlertas = linhas.filter((l) => l.alertas.length).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <label className="flex items-center gap-2">
          <span className="text-texto-3">Mês da IP19</span>
          <select value={mes} onChange={(ev) => setMes(ev.target.value)} className="rounded-lg border border-borda bg-superficie px-2 py-1.5">
            {meses.map((m) => <option key={m} value={m}>{mesBr(m)}</option>)}
            <option value="">Todos</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={soAlerta} onChange={(ev) => setSoAlerta(ev.target.checked)} />
          <span>Só linhas com alerta ({nAlertas})</span>
        </label>
        <span className="text-texto-3">{vis.length} linha(s)</span>
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-cartao border border-borda bg-superficie">
        <table className="w-full min-w-[1500px] text-left text-[12.5px]">
          <caption className="sr-only">Programação de paradas: um ativo por dia e turno</caption>
          <thead className="sticky top-0 z-10 border-b border-borda bg-superficie-2 text-[11.5px] text-texto-3">
            <tr>
              {["Data", "Dia", "Sem.", "Turno", "Ativo", "Equipamentos", "Mês IP19", "HH MEC", "HH ELE", "HH total", "Parada", "Janela", "Situação",
                "Itens", "Datas IP19 no mês", "Tipo", "Grupo crítico", "Acima MEC/ELE", "Campo(s)", "Alerta"].map((c) => (
                <th key={c} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-borda tabular-nums">
            {vis.map((l) => {
              const alerta = l.alertas.length > 0;
              return (
                <tr key={l.id} style={alerta ? { backgroundColor: "var(--selo-critico-fundo)" } : undefined}>
                  <td className="whitespace-nowrap px-3 py-1.5">{l.data}</td>
                  <td className="px-3 py-1.5">{l.dia}</td>
                  <td className="px-3 py-1.5">{l.semana}</td>
                  <td className="px-3 py-1.5">{l.turno}º</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-medium">{l.ativo}</td>
                  <td className="max-w-[220px] truncate px-3 py-1.5 text-texto-3" title={l.equipamentos}>{l.equipamentos}</td>
                  <td className="px-3 py-1.5">{mesBr(l.mes)}</td>
                  <td className="px-3 py-1.5 text-right">{h(l.hhMec)}</td>
                  <td className="px-3 py-1.5 text-right">{h(l.hhEle)}</td>
                  <td className="px-3 py-1.5 text-right">{h(l.hhMec + l.hhEle)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{l.parada}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{l.janela}</td>
                  <td className="px-3 py-1.5">{l.marcas.join(" · ")}</td>
                  <td className="px-3 py-1.5 text-right">{l.itens} de {l.itensMes}</td>
                  <td className="max-w-[160px] truncate px-3 py-1.5" title={l.datasIp19}>{l.datasIp19}</td>
                  <td className="px-3 py-1.5">{l.tipo}</td>
                  <td className="px-3 py-1.5">{l.grupo}</td>
                  <td className="px-3 py-1.5 text-right">{l.acimaMec || l.acimaEle ? `${h(l.acimaMec)} / ${h(l.acimaEle)}` : ""}</td>
                  <td className="max-w-[180px] truncate px-3 py-1.5" title={l.campos}>{l.campos}</td>
                  <td className="px-3 py-1.5 font-medium" style={alerta ? { color: "var(--selo-critico-texto)" } : undefined}>{l.alertas.join("; ")}</td>
                </tr>
              );
            })}
            {!vis.length && <tr><td colSpan={20} className="px-3 py-6 text-center text-texto-3">Nenhuma linha neste filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
