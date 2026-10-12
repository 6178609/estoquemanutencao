import clsx from "clsx";

/** Faixa de números do filtro (os st.metric da versão Streamlit): rótulo, valor, detalhe; fórmula na dica. */
export function Numeros({ itens, colunas = 5 }: { itens: { rotulo: string; valor: string; detalhe?: string; dica?: string; alerta?: boolean }[];
  colunas?: 3 | 4 | 5 }) {
  return (
    <div className={clsx("grid grid-cols-2 gap-3", colunas === 3 ? "lg:grid-cols-3" : colunas === 4 ? "lg:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-5")}>
      {itens.map((i) => (
        <div key={i.rotulo} title={i.dica} className="min-w-0 rounded-cartao border border-borda bg-superficie p-4">
          <div className="text-[12.5px] font-medium leading-snug text-texto-2">{i.rotulo}</div>
          <div className="num mt-1.5 truncate font-display text-[24px] font-medium leading-none tracking-[-0.02em]">
            {i.alerta && <span className="mr-1.5 inline-block size-2 -translate-y-1 rounded-full" style={{ background: "var(--st-critico)" }} aria-label="atenção" />}
            {i.valor}
          </div>
          {i.detalhe && <div className="mt-1.5 text-[12px] leading-snug text-texto-3">{i.detalhe}</div>}
        </div>
      ))}
    </div>
  );
}
