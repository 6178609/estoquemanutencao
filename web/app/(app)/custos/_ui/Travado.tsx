import { brlCurto } from "@/lib/formato";
import type { travado } from "@/lib/wcm/custo360";

type Etapas = ReturnType<typeof travado>;

const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
/** Verde, azul, vermelho e escuro (marca) para as etapas 1 a 4; o verde leva texto escuro (contraste). */
const COR: Record<1 | 2 | 3 | 4, { fundo: string; texto: string }> = {
  1: { fundo: "var(--st-bom)", texto: "var(--texto)" },
  2: { fundo: "var(--serie-1)", texto: "var(--tinta-texto)" },
  3: { fundo: "var(--st-critico)", texto: "var(--tinta-texto)" },
  4: { fundo: "var(--color-marca-800)", texto: "var(--tinta-texto)" },
};

/**
 * Onde o custo está travado: etapas numeradas, com valor e barra proporcional. Etapa sem ordem/requisição some;
 * a etapa 4 é contagem (concluídas sem custo lançado), sem R$. Sem etapa restante, o cartão some.
 */
export function Travado({ etapas }: { etapas: Etapas }) {
  const vis = etapas.filter((e) => e.qtd > 0);
  if (!vis.length) return null;
  const comValor = vis.filter((e) => e.valor != null);
  const total = comValor.reduce((s, e) => s + (e.valor ?? 0), 0);
  const maior = Math.max(0, ...comValor.map((e) => e.valor ?? 0));

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-cartao border border-borda bg-superficie">
      <div className="bg-marca-800 p-5 text-white">
        <div className="text-[11.5px] font-medium tracking-[0.12em] text-white/85">TRAVADO</div>
        <div className="num mt-2 font-display text-[30px] font-medium leading-none tracking-[-0.02em]">{comValor.length ? brlCurto(total) : "—"}</div>
        <div className="mt-1.5 text-[12.5px] text-white/85">{comValor.length ? "soma das etapas com valor" : "sem etapa com valor em R$"}</div>
      </div>

      <ol className="flex flex-col gap-4 p-5">
        {vis.map((e) => {
          const cor = COR[e.etapa];
          const rotulo = e.etapa === 1 ? "Requisições pendentes · fábrica inteira" : e.rotulo;
          const comR = e.valor != null;
          return (
            <li key={e.etapa} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-medium"
                style={{ background: cor.fundo, color: cor.texto }} aria-hidden>{e.etapa}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 text-[12.5px] text-texto-2">
                  <span className="min-w-0">{rotulo}</span>
                  <span className="num shrink-0 font-medium text-texto">{comR ? brlCurto(e.valor) : `${n0.format(e.qtd)} ${e.qtd === 1 ? "ordem" : "ordens"}`}</span>
                </div>
                {comR && (
                  <>
                    <div aria-hidden className="mt-1.5 h-2 rounded-full bg-superficie-3">
                      <div className="h-full rounded-full" style={{ width: `${maior ? (Math.max(0, e.valor ?? 0) / maior) * 100 : 0}%`, background: cor.fundo }} />
                    </div>
                    <div className="mt-1 text-[12px] text-texto-3">{n0.format(e.qtd)} {e.etapa === 1 ? (e.qtd === 1 ? "requisição" : "requisições") : (e.qtd === 1 ? "ordem" : "ordens")}</div>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
