import clsx from "clsx";

/** Faixa de números do recorte (cartões pequenos, borda fina; a fórmula fica na dica do rótulo). */
export function Numeros({ itens, colunas = 4 }: { itens: { rotulo: string; valor: string; detalhe?: string; dica?: string }[]; colunas?: 3 | 4 | 5 }) {
  return (
    <div className={clsx("grid grid-cols-2 gap-3", colunas === 3 ? "lg:grid-cols-3" : colunas === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
      {itens.map((i) => (
        <div key={i.rotulo} className="rounded-cartao border border-borda bg-superficie p-4">
          <div className="text-[12.5px] font-medium leading-snug text-texto-2" title={i.dica}>{i.rotulo}</div>
          <div className="num mt-2 font-display text-[24px] font-medium leading-none tracking-[-0.02em] sm:text-[26px]">{i.valor}</div>
          {i.detalhe && <div className="mt-1.5 text-[12px] leading-snug text-texto-3">{i.detalhe}</div>}
        </div>
      ))}
    </div>
  );
}

/** Nota curta abaixo de um bloco. */
export function Nota({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] leading-relaxed text-texto-3">{children}</p>;
}
