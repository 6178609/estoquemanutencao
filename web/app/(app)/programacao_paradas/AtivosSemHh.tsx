import type { LinhaSemHh } from "@/lib/paradas/visoes";

import { ddmmaaaa, h, mesBr } from "./comum";

export interface ChamadaSemHh { plano: string; item: string; data: number; ativo: string; equipamento: string; texto: string }
interface Retirado { mes: string; ativo: string; hh: { mec: number; ele: number }; motivo: string }

function Tabela({ titulo, colunas, linhas, vazio }: { titulo: string; colunas: string[]; linhas: (string | number)[][]; vazio: string }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[15px] font-medium">{titulo} <span className="text-texto-3">({linhas.length})</span></h3>
      <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
        <table className="w-full min-w-[720px] text-left text-[12.5px]">
          <caption className="sr-only">{titulo}</caption>
          <thead className="border-b border-borda bg-superficie-2 text-[11.5px] text-texto-3">
            <tr>{colunas.map((c) => <th key={c} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-borda tabular-nums">
            {linhas.map((l, i) => <tr key={i}>{l.map((v, k) => <td key={k} className={`px-3 py-1.5 ${k === 0 ? "font-medium" : ""}`}>{v}</td>)}</tr>)}
            {!linhas.length && <tr><td colSpan={colunas.length} className="px-3 py-5 text-center text-texto-3">{vazio}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Visão "Ativos sem HH" (V5): o que não coube nas paradas do mês, com o motivo; os retirados e as chamadas sem HH. */
export function AtivosSemHh({ semHh, retirados, chamadas }: { semHh: LinhaSemHh[]; retirados: Retirado[]; chamadas: ChamadaSemHh[] }) {
  return (
    <div className="space-y-6">
      <Tabela titulo="Ativos sem HH" vazio="Tudo coube nas paradas do horizonte."
        colunas={["Ativo", "Campo(s)", "Mês", "1ª data IP19", "HH MEC", "HH ELE", "HH total", "Itens", "Motivo"]}
        linhas={semHh.map((a) => [a.ativo, a.campos.join(", "), mesBr(a.mes), ddmmaaaa(a.primeiraData), h(a.hh.mec), h(a.hh.ele), h(a.total), a.itens, a.motivo])} />
      <Tabela titulo="Retirados" vazio="Nenhum ativo retirado."
        colunas={["Ativo", "Mês", "HH MEC", "HH ELE", "Motivo"]}
        linhas={retirados.map((x) => [x.ativo, mesBr(x.mes), h(x.hh.mec), h(x.hh.ele), x.motivo])} />
      <Tabela titulo="Chamadas sem HH (IP19 sem operação e sem plano anterior)" vazio="Nenhuma chamada sem HH."
        colunas={["Plano", "Item", "Data IP19", "Ativo", "Equipamento", "Texto"]}
        linhas={chamadas.map((x) => [x.plano, x.item, ddmmaaaa(x.data), x.ativo, x.equipamento, x.texto])} />
    </div>
  );
}
