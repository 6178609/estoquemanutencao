import clsx from "clsx";

/** Campos de formulário no padrão do site. O foco é o contorno global (:focus-visible); aqui só muda a borda. */
export const ENTRADA =
  "h-11 w-full rounded-xl border border-borda-forte bg-superficie px-3 text-[15px] transition placeholder:text-texto-3 focus:border-[var(--acao)] disabled:opacity-50";
/** Campo com erro: a mesma entrada, com a borda na cor crítica do tema. */
const ENTRADA_ERRO = ENTRADA.replace("border-borda-forte", "border-[var(--selo-critico-texto)]");

/**
 * Id do texto de erro, derivado do `id` ou `name` do campo (ou, na falta dos dois, do rótulo). Este arquivo não é cliente,
 * então não usa `useId`: o id sai do próprio campo e é estável entre renderizações.
 */
function idErro(base: string): string {
  const slug = base.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `erro-${slug || "campo"}`;
}

/** Texto de erro logo abaixo do campo; `aria-describedby` do campo aponta para ele. */
function TextoErro({ id, texto }: { id: string; texto: string }) {
  return <span id={id} className="mt-1 block text-[12px] font-medium text-[var(--selo-critico-texto)]">{texto}</span>;
}

export function Campo({ rotulo, dica, erro, className, ...p }: { rotulo: string; dica?: string; erro?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = idErro(p.id ?? p.name ?? rotulo);
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-texto">{rotulo}</span>
      <input {...p} className={erro ? ENTRADA_ERRO : ENTRADA} aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? clsx(p["aria-describedby"], id) : p["aria-describedby"]} />
      {erro ? <TextoErro id={id} texto={erro} /> : dica && <span className="mt-1 block text-[12px] text-texto-3">{dica}</span>}
    </label>
  );
}

export function Seletor({ rotulo, opcoes, vazio, dica, erro, className, ...p }: {
  rotulo: string; opcoes: Record<string, string>; vazio?: string; dica?: string; erro?: string;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = idErro(p.id ?? p.name ?? rotulo);
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-texto">{rotulo}</span>
      <select {...p} className={erro ? ENTRADA_ERRO : ENTRADA} aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? clsx(p["aria-describedby"], id) : p["aria-describedby"]}>
        {vazio !== undefined && <option value="">{vazio}</option>}
        {Object.entries(opcoes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {erro ? <TextoErro id={id} texto={erro} /> : dica && <span className="mt-1 block text-[12px] text-texto-3">{dica}</span>}
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
