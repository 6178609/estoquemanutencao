import clsx from "clsx";

/** Campos de formulário no padrão do site. O foco é o contorno global (:focus-visible); aqui só muda a borda. */
export const ENTRADA =
  "h-11 w-full rounded-xl border border-borda-forte bg-superficie px-3 text-[15px] transition placeholder:text-texto-3 focus:border-[var(--acao)] disabled:opacity-50";

export function Campo({ rotulo, dica, className, ...p }: { rotulo: string; dica?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-texto">{rotulo}</span>
      <input {...p} className={ENTRADA} />
      {dica && <span className="mt-1 block text-[12px] text-texto-3">{dica}</span>}
    </label>
  );
}

export function Seletor({ rotulo, opcoes, vazio, dica, className, ...p }: {
  rotulo: string; opcoes: Record<string, string>; vazio?: string; dica?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-texto">{rotulo}</span>
      <select {...p} className={ENTRADA}>
        {vazio !== undefined && <option value="">{vazio}</option>}
        {Object.entries(opcoes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {dica && <span className="mt-1 block text-[12px] text-texto-3">{dica}</span>}
    </label>
  );
}

export function Mensagem({ tipo = "erro", children }: { tipo?: "erro" | "ok"; children: React.ReactNode }) {
  return (
    <p role={tipo === "erro" ? "alert" : "status"} className={clsx("rounded-xl border px-3.5 py-2.5 text-sm font-medium",
      tipo === "erro" ? "border-transparent bg-[var(--selo-critico-fundo)] text-[var(--selo-critico-texto)]" : "border-transparent bg-[var(--selo-bom-fundo)] text-[var(--selo-bom-texto)]")}>
      {children}
    </p>
  );
}
