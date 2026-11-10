import { Selo } from "@/components/ui";
import type { Conferencia } from "@/lib/paradas/conferencias";
import type { ResumoMes } from "@/lib/paradas/visoes";

const h = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const pct = (x: number) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const NOME_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesBr = (m: string) => `${NOME_MES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

/** Visão "Verificação": capacidade × programado por mês e as 11 conferências da planilha. */
export function Verificacao({ resumo, conferencias }: { resumo: ResumoMes[]; conferencias: Conferencia[] }) {
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
        <table className="w-full min-w-[760px] text-left text-[12.5px]">
          <thead className="border-b border-borda bg-superficie-2 text-[11.5px] text-texto-3">
            <tr>
              <th className="px-3 py-2 font-medium">Mês</th>
              <th className="px-3 py-2 text-right font-medium">Capacidade MEC / ELE</th>
              <th className="px-3 py-2 text-right font-medium">Programado MEC / ELE</th>
              <th className="px-3 py-2 text-right font-medium">Uso MEC / ELE</th>
              <th className="px-3 py-2 text-right font-medium">Carga IP19 MEC / ELE</th>
              <th className="px-3 py-2 text-right font-medium">Sem HH MEC / ELE</th>
              <th className="px-3 py-2 text-right font-medium">Saldo p/ backlog MEC / ELE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda tabular-nums">
            {resumo.map((m) => (
              <tr key={m.mes}>
                <td className="px-3 py-2 font-medium">{mesBr(m.mes)}</td>
                <td className="px-3 py-2 text-right">{h(m.capacidade.mec)} / {h(m.capacidade.ele)}</td>
                <td className="px-3 py-2 text-right">{h(m.programado.mec)} / {h(m.programado.ele)}</td>
                <td className="px-3 py-2 text-right">{pct(m.uso.mec)} / {pct(m.uso.ele)}</td>
                <td className="px-3 py-2 text-right">{h(m.carga.mec)} / {h(m.carga.ele)}</td>
                <td className="px-3 py-2 text-right">{h(m.semHh.mec)} / {h(m.semHh.ele)}</td>
                <td className="px-3 py-2 text-right">{h(m.backlog.mec)} / {h(m.backlog.ele)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="divide-y divide-borda rounded-cartao border border-borda bg-superficie" aria-label="Conferências">
        {conferencias.map((c) => (
          <li key={c.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4" data-conferencia={c.id}>
            <span className="w-10 shrink-0 font-mono text-[12px] text-texto-3">{c.id}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] text-texto">{c.texto}</p>
              {c.detalhe && <p className="mt-0.5 text-[12.5px] text-texto-3">{c.detalhe}</p>}
              <p className="mt-0.5 text-[11.5px] text-texto-3">Onde conferir: {c.abas}</p>
            </div>
            <Selo cor={c.resultado === "OK" ? "verde" : c.resultado === "VERIFICAR" ? "vermelho" : "cinza"}>{c.resultado}</Selo>
          </li>
        ))}
      </ol>
    </div>
  );
}
