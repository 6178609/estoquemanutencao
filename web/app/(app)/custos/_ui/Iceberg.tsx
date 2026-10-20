import Link from "next/link";

import { brlCurto } from "@/lib/formato";
import type { iceberg } from "@/lib/wcm/custo360";

type Ice = ReturnType<typeof iceberg>;

const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/**
 * Iceberg do custo: em cima da água, o custo visível (ordens); embaixo, o que não aparece na ordem.
 * Cada linha some quando não há dado; a parada só aparece com quebras no recorte.
 */
export function Iceberg({ ice, temIw47 }: { ice: Ice; temIw47: boolean }) {
  const parada = ice.paradaHoras != null;
  const semCusto = parada && ice["paradaR$"] == null;
  const linhas = [
    temIw47 ? { chave: "iw47", rotulo: "Horas de serviço (IW47)", valor: `${nf1.format(ice.horasServico)} h`, detalhe: "apontadas no período" } : null,
    ice.requisicoes != null ? { chave: "req", rotulo: "Requisições pendentes", valor: brlCurto(ice.requisicoes), detalhe: "fábrica inteira" } : null,
    ice.estoque != null ? { chave: "est", rotulo: "Estoque", valor: brlCurto(ice.estoque), detalhe: "fábrica inteira · valor do MB52" } : null,
  ].filter((x) => x != null);

  return (
    <section className="flex flex-col overflow-hidden rounded-cartao bg-marca-800 p-5 text-white">
      <div className="text-[11.5px] font-medium tracking-[0.12em] text-white/75">ICEBERG DO CUSTO</div>
      <div className="num mt-2 font-display text-[30px] font-medium leading-none tracking-[-0.02em]">{brlCurto(ice.visivel)}</div>
      <div className="mt-1.5 text-[12.5px] text-white/75">custo visível: ordens do período</div>

      <div className="my-5 flex items-center gap-2 text-[11px] text-white/75">
        <span className="h-px flex-1 border-t border-dashed border-white/70" />
        nível da água
        <span className="h-px flex-1 border-t border-dashed border-white/70" />
      </div>

      {parada && (
        <div className="rounded-cartao border-l-4 bg-white/[0.08] p-4" style={{ borderLeftColor: "var(--serie-4)" }}>
          <div className="text-[12.5px] font-medium text-white/85">Parada das quebras</div>
          {semCusto ? (
            <>
              <div className="num mt-1.5 font-display text-[22px] font-medium leading-none" style={{ color: "var(--serie-4)" }}>
                {nf1.format(ice.paradaHoras ?? 0)} h
              </div>
              <p className="mt-2 text-[12.5px] leading-snug text-white/85">
                Cadastre o custo do par e os pares por hora em{" "}
                <Link href="/metas" prefetch={false} className="font-medium underline underline-offset-2">Metas e parâmetros</Link>{" "}
                para ver quanto custa essa parada.
              </p>
            </>
          ) : (
            <>
              <div className="num mt-1.5 font-display text-[24px] font-medium leading-none" style={{ color: "var(--serie-4)" }}>
                {brlCurto(ice["paradaR$"])}
              </div>
              <div className="mt-1.5 text-[12px] text-white/75">{nf1.format(ice.paradaHoras ?? 0)} h paradas nas quebras</div>
            </>
          )}
        </div>
      )}

      {linhas.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {linhas.map((l) => (
            <div key={l.chave} className="min-w-0 rounded-cartao bg-white/[0.08] p-3">
              <div className="text-[11.5px] leading-snug text-white/80">{l.rotulo}</div>
              <div className="num mt-1 font-display text-[17px] font-medium leading-none">{l.valor}</div>
              <div className="mt-1 text-[11px] leading-snug text-white/65">{l.detalhe}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
