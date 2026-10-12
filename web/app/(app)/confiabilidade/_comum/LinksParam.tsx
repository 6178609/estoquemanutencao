/** Escolha por endereço (?<chave>=…) mantendo os filtros e a visão — como o AbasVisao, para outro parâmetro. */
export function LinksParam({ chave, opcoes, atual, params, rotulo }: { chave: string; opcoes: string[]; atual: string;
  params: Record<string, string | string[] | undefined>; rotulo?: string }) {
  const base = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (k === chave || v == null ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x]))));
  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label={rotulo}>
      {rotulo && <span className="mr-1 text-[12.5px] text-texto-3">{rotulo}</span>}
      {opcoes.map((o) => {
        const p = new URLSearchParams(base);
        p.set(chave, o);
        return (
          <a key={o} href={`?${p.toString()}`} aria-current={o === atual ? "true" : undefined}
            className={o === atual ? "rounded-full bg-superficie-3 px-3 py-1.5 text-[13px] font-medium text-texto" : "rounded-full px-3 py-1.5 text-[13px] text-texto-3 transition hover:text-texto"}>
            {o}
          </a>
        );
      })}
    </nav>
  );
}
