"use client";

import { Download, History, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BOTAO_COMPACTO, Selo } from "@/components/ui";
import type { HistoricoMaterial } from "@/lib/dados/historicoIw13";
import { csvHistorico, LINHAS_POR_PAGINA, totalValor } from "@/lib/estoque/historicoIw13";
import { brl, numero } from "@/lib/formato";

const dataBr = (d: string) => (d ? d.split("-").reverse().join("/") : "—");

function baixar(material: string, h: HistoricoMaterial) {
  const blob = new Blob(["﻿" + csvHistorico(material, h.linhas, h.comValor)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `retiradas_iw13_${material}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Barras mês a mês (12 meses); o valor de cada mês vai no rótulo acessível e no título (passar o mouse ou focar). */
function Barras({ meses, um }: { meses: { chave: string; rotulo: string; quantidade: number }[]; um: string }) {
  const max = Math.max(1, ...meses.map((m) => Math.abs(m.quantidade)));
  return (
    <figure className="mt-3">
      <div role="list" aria-label="Retirado por mês nos últimos 12 meses" className="flex h-24 items-end gap-1 border-b border-[var(--eixo)]">
        {meses.map((m) => {
          const q = Math.max(0, m.quantidade);
          const t = `${m.rotulo}: ${numero(m.quantidade)} ${um}`;
          return (
            <div key={m.chave} role="listitem" tabIndex={0} aria-label={t} title={t}
              className="group relative flex h-full flex-1 items-end rounded-t outline-none focus-visible:ring-2 focus-visible:ring-[var(--foco)]">
              <div className="w-full rounded-t bg-[var(--serie-1)] transition-opacity group-hover:opacity-80"
                style={{ height: q ? `${Math.max(4, (q / max) * 100)}%` : "2px", opacity: q ? 1 : 0.25 }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1 text-[10.5px] text-texto-3" aria-hidden>
        {meses.map((m, k) => <span key={m.chave} className="flex-1 text-center">{k % 2 === 1 || meses.length <= 6 ? m.rotulo.slice(0, 3) : ""}</span>)}
      </div>
      <figcaption className="sr-only">Quantidade líquida retirada em cada mês (devoluções abatidas).</figcaption>
    </figure>
  );
}

/**
 * Histórico de retiradas (IW13) no detalhamento do material: resumo dos 12 meses, barras por mês e a tabela das
 * retiradas (50 por vez, "ver mais"), com a ordem da IW38, o selo de quebra e a validação da UBM; o valor só aparece
 * quando o servidor manda (quem vê a aba Custos). Regras em lib/estoque/historicoIw13.ts.
 */
export function HistoricoRetiradas({ material }: { material: string }) {
  const codigo = material.trim();
  const [h, setH] = useState<HistoricoMaterial | null>(null);
  const [erro, setErro] = useState("");
  const [mostrar, setMostrar] = useState(LINHAS_POR_PAGINA);

  // o componente é montado com key = código do material: trocar de material começa do zero
  useEffect(() => {
    let vivo = true;
    fetch(`/api/estoque/historico?m=${encodeURIComponent(codigo)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) setErro(j.erro || "Não foi possível ler o histórico agora.");
        else setH(j as HistoricoMaterial);
      }, () => vivo && setErro("Não foi possível ler o histórico agora."));
    return () => { vivo = false; };
  }, [codigo]);

  const titulo = (
    <h3 className="mb-3 flex items-center gap-2 font-display font-bold"><History className="size-4 text-texto-3" strokeWidth={1.75} />Histórico de retiradas (IW13)</h3>
  );
  if (erro) return <section data-historico>{titulo}<p role="alert" className="text-sm text-[var(--selo-critico-texto)]">{erro}</p></section>;
  if (!h) return <section data-historico>{titulo}<p className="flex items-center gap-2 text-sm text-texto-3"><LoaderCircle className="size-4 animate-spin" /> Lendo a IW13…</p></section>;
  if (!h.temIw13) {
    return (
      <section data-historico>{titulo}
        <p className="rounded-2xl bg-superficie-2 px-4 py-3 text-sm text-texto-2">Envie a IW13 em <Link prefetch={false} href="/dados" className="font-medium underline">Fontes de dados</Link> para ver as retiradas deste material.</p>
      </section>
    );
  }
  const r = h.resumo!;
  const um = r.um || "";
  const visiveis = h.linhas.slice(0, mostrar);
  const valor12m = h.comValor && h.preco != null ? Math.round(r.total * h.preco * 100) / 100 : null;
  const cartoes = [
    { r: "Retirado em 12 meses", v: `${numero(r.total)} ${um}`, d: r.devolvido ? `${numero(r.devolvido)} devolvido(s) abatido(s)` : "" },
    { r: "Média por mês", v: `${numero(r.mediaMes)} ${um}`, d: "" },
    { r: "Último consumo", v: dataBr(r.ultimo), d: "" },
    { r: "Ordens (12 meses)", v: String(r.ordens), d: "" },
    ...(h.comValor ? [{ r: "Valor em 12 meses", v: valor12m == null ? "sem preço" : brl(valor12m), d: h.preco == null ? "" : `${brl(h.preco)}/${um || "UM"}` }] : []),
  ];

  return (
    <section data-historico>
      {titulo}
      {h.linhas.length === 0 ? (
        <p className="rounded-2xl bg-superficie-2 px-4 py-3 text-sm text-texto-2">Nenhuma retirada deste material na IW13 carregada.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {cartoes.map((c) => (
              <div key={c.r} className="rounded-2xl bg-superficie-2 p-3.5">
                <div className="text-xs text-texto-3">{c.r}</div>
                <div className="num mt-1 font-display text-lg font-bold">{c.v}</div>
                {c.d && <div className="mt-0.5 text-[11.5px] text-texto-3">{c.d}</div>}
              </div>
            ))}
          </div>
          <Barras meses={r.meses} um={um} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-texto-3">{h.linhas.length} linha(s) da IW13, da mais recente à mais antiga. Devolução (Tomados negativo) aparece com sinal de menos e é abatida do total.</p>
            <button type="button" onClick={() => baixar(codigo, h)} className={BOTAO_COMPACTO}><Download className="size-4" /> Excel (CSV)</button>
          </div>
          <div className="mt-2 overflow-x-auto rounded-2xl border border-borda">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead className="bg-superficie-2 text-[12px] text-texto-3">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Data</th>
                  <th scope="col" className="px-3 py-2 font-medium">Ordem</th>
                  <th scope="col" className="px-3 py-2 font-medium">Equipamento</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Qtd.</th>
                  {h.comValor && <th scope="col" className="px-3 py-2 text-right font-medium">Valor</th>}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l, k) => (
                  <tr key={`${l.ordem}-${l.data}-${k}`} className="border-t border-borda align-top">
                    <td className="num whitespace-nowrap px-3 py-2">{dataBr(l.data)}</td>
                    <td className="px-3 py-2">
                      <div className="num font-mono">{l.ordem}{l.tipo && <span className="ml-1.5 font-sans text-texto-3">{l.tipo}</span>}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {l.quebra && <Selo cor="vermelho">Quebra</Selo>}
                        {l.devolucao && <Selo cor="amarelo">Devolução</Selo>}
                        {l.origem === "ubm" && <Selo cor="verde">Veio da UBM{l.armario ? ` · ${l.armario}` : ""}</Selo>}
                        {l.origem === "almox" && <Selo>Veio do Almox</Selo>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="num font-mono">{l.equipamento || "—"}</div>
                      {(l.denominacao || l.textoOrdem) && <div className="text-[12px] text-texto-3">{l.denominacao || l.textoOrdem}</div>}
                    </td>
                    <td className={`num whitespace-nowrap px-3 py-2 text-right font-semibold ${l.devolucao ? "text-[var(--selo-serio-texto)]" : ""}`}>{numero(l.quantidade)} {l.um}</td>
                    {h.comValor && <td className="num whitespace-nowrap px-3 py-2 text-right">{l.valor == null ? "—" : brl(l.valor)}</td>}
                  </tr>
                ))}
              </tbody>
              {h.comValor && (
                <tfoot className="border-t border-borda bg-superficie-2 text-[12.5px]">
                  <tr><td colSpan={4} className="px-3 py-2 text-texto-3">Valor de todas as linhas (quantidade × preço médio atual)</td>
                    <td className="num px-3 py-2 text-right font-semibold">{(() => { const t = totalValor(h.linhas); return t == null ? "sem preço" : brl(t); })()}</td></tr>
                </tfoot>
              )}
            </table>
          </div>
          {h.linhas.length > mostrar && (
            <button type="button" onClick={() => setMostrar((n) => n + LINHAS_POR_PAGINA)} className={`${BOTAO_COMPACTO} mt-2`}>
              Ver mais ({h.linhas.length - mostrar} restante(s))
            </button>
          )}
        </>
      )}
    </section>
  );
}
