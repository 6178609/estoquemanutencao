import { brlCurto } from "@/lib/formato";
import type { concentracao } from "@/lib/wcm/custo360";

type Conc = NonNullable<ReturnType<typeof concentracao>>;

const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/**
 * Concentração: quanto do custo está nos 10% dos equipamentos de maior custo (mínimo 1). Com 1 a 9 equipamentos,
 * "10%" seria um só: a frase diz "o equipamento de maior custo". Sem equipamento com custo, o cartão some.
 */
export function Concentracao({ conc, nomeEq, campoEq }: {
  conc: Conc | null; nomeEq: Map<string, string>; campoEq: (codigo: string) => string;
}) {
  if (!conc || conc.nAtivos <= 0) return null;
  const pct = Math.min(100, conc.pctCusto10);
  const grupo = conc.top.length;
  const poucos = conc.nAtivos < 10;
  const barraAtivos = Math.min(100, (grupo / conc.nAtivos) * 100);

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-cartao border border-borda bg-superficie p-5">
      <div>
        <div className="font-display text-[15px] font-medium">Concentração do custo</div>
        <div className="mt-0.5 text-[12.5px] text-texto-3">Quanto do custo cai em poucos equipamentos</div>
      </div>

      <div>
        <div className="num font-display text-[34px] font-medium leading-none tracking-[-0.02em]">{nf1.format(pct)}%</div>
        <div className="mt-1 text-[13px] text-texto-2">do custo</div>
        <p className="mt-2 text-[13px] leading-snug text-texto-2">
          {poucos
            ? <>{nf1.format(pct)}% do custo <b className="font-medium text-texto">está no equipamento de maior custo</b>.</>
            : <>{nf1.format(pct)}% do custo <b className="font-medium text-texto">está em apenas 10% dos ativos ({n0.format(conc.nAtivos)})</b>.</>}
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-[12px] text-texto-2"><span>Custo nos mais caros</span><span className="num">{nf1.format(pct)}%</span></div>
          <div aria-hidden className="mt-1 h-1.5 rounded-full bg-superficie-3">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--serie-1)" }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[12px] text-texto-2"><span>Equipamentos desse grupo</span><span className="num">{grupo} de {n0.format(conc.nAtivos)}</span></div>
          <div aria-hidden className="mt-1 h-1.5 rounded-full bg-superficie-3">
            <div className="h-full rounded-full" style={{ width: `${barraAtivos}%`, background: "var(--serie-3)" }} />
          </div>
        </div>
      </div>

      <div>
        <div className="text-[11.5px] font-medium tracking-[0.04em] text-texto-3">MAIORES CUSTOS</div>
        <ol className="mt-1">
          {conc.top.slice(0, 4).map((t) => {
            const campo = campoEq(t.equip);
            const nome = nomeEq.get(t.equip) ?? "";
            return (
              <li key={t.equip} className="flex items-baseline justify-between gap-3 border-t border-borda py-2 text-[13px]">
                <div className="min-w-0">
                  <div className="truncate font-medium">{campo || nome || t.equip}</div>
                  <div className="truncate text-[12px] text-texto-3">{campo ? `${t.equip}${nome ? ` · ${nome}` : ""}` : t.equip}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="num font-medium">{brlCurto(t.custo)}</div>
                  <div className="num text-[12px] text-texto-3">{brlCurto(t.porOrdem)} por ordem</div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
