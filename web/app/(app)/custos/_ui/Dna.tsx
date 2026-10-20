import clsx from "clsx";

import { Grafico } from "@/components/graficos";
import { brl, brlCurto } from "@/lib/formato";
import type { dnaPorFamilia } from "@/lib/wcm/custo360";

type Familias = ReturnType<typeof dnaPorFamilia>;

const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
/** Rampa --seq do mais forte ao mais claro; texto escuro nas faixas claras para manter o contraste. */
const FUNDO = ["var(--seq-6)", "var(--seq-5)", "var(--seq-4)", "var(--seq-3)", "var(--seq-2)"];
const TEXTO = ["var(--tinta-texto)", "var(--tinta-texto)", "var(--texto)", "var(--texto)", "var(--texto)"];

/**
 * DNA do custo: mosaico das famílias de máquina (maior bloco ocupa 2 linhas); "Demais" em barra fina embaixo.
 * Some sem custo positivo com equipamento; blocos negativos (estornos) ficam fora do mosaico.
 */
export function Dna({ familias }: { familias: Familias }) {
  const total = familias.reduce((s, f) => s + f.valor, 0);
  const blocos = familias.filter((f) => f.familia !== "Demais" && f.valor > 0);
  const demais = familias.find((f) => f.familia === "Demais" && f.valor > 0);
  if (!(total > 0) || !blocos.length) return null;

  return (
    <Grafico titulo="DNA do custo" subtitulo="Famílias de máquina · tamanho = parcela do custo com equipamento"
      tabela={{ colunas: ["Família", "Custo", "% do custo"], linhas: familias.map((f) => [f.familia, brl(f.valor), `${nf1.format(f.pct)}%`]) }}>
      <div className="grid auto-rows-[4.75rem] grid-cols-2 gap-1.5">
        {blocos.map((f, i) => (
          <div key={f.familia} title={`${f.familia} · ${brl(f.valor)}`}
            className={clsx("flex min-w-0 flex-col justify-between rounded-md p-2.5", i === 0 && "row-span-2")}
            style={{ background: FUNDO[i] ?? FUNDO[FUNDO.length - 1], color: TEXTO[i] ?? TEXTO[TEXTO.length - 1] }}>
            <span className="line-clamp-2 break-words text-[12.5px] font-medium leading-tight">{f.familia}</span>
            <span>
              <span className="num block font-display text-[18px] font-medium leading-none">{nf1.format(f.pct)}%</span>
              <span className="num mt-1 block text-[11.5px] opacity-90">{brlCurto(f.valor)}</span>
            </span>
          </div>
        ))}
      </div>
      {demais && (
        <div className="mt-3">
          <div className="flex justify-between gap-3 text-[12.5px] text-texto-2">
            <span>Demais</span>
            <span className="num">{nf1.format(demais.pct)}% · {brlCurto(demais.valor)}</span>
          </div>
          <div aria-hidden className="mt-1.5 h-1.5 rounded-full bg-superficie-3">
            <div className="h-full rounded-full bg-marca-500" style={{ width: `${Math.min(100, demais.pct)}%` }} />
          </div>
        </div>
      )}
    </Grafico>
  );
}
