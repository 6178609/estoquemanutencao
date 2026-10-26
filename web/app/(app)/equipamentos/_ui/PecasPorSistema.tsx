"use client";

import clsx from "clsx";
import { ChevronDown, Link2Off, LoaderCircle, PackageOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";

/** O que a lista precisa de cada peça (MB52 + catálogo Sysmat). */
export interface LinhaPeca {
  codigo: string; descricao: string; status: "ok" | "baixo" | "zerado" | "ausente"; texto: string; estoque: number | null; minimo: number | null;
  um: string; sysmat: string; fabricanteRef: string; depositos: string; descrCompleta: string; valor: number | null; substituto: string;
  cadastro: string; foto?: string | null;
  /** equipamento onde a peça está vinculada (o próprio ativo ou um subconjunto) */
  origem: string;
}
export interface GrupoPecas { chave: string; rotulo: string; pecas: LinhaPeca[] }

const COR = { ok: "var(--st-bom)", baixo: "var(--st-serio)", zerado: "var(--st-critico)", ausente: "var(--st-critico)" } as const;
const SITUACAO = { ok: "Em estoque", baixo: "Abaixo do mínimo", zerado: "Zerado", ausente: "Fora do almox." } as const;
const emFalta = (p: LinhaPeca) => p.status !== "ok";
const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/**
 * Peças de um ativo agrupadas por sistema: resumo com atalho para cada sistema, busca, "só em falta" e, em cada grupo,
 * uma tabela enxuta (código, descrição, saldo, situação) — o detalhe (Sysmat, fabricante, depósitos, descrição
 * completa, foto) abre ao tocar na linha. Grupos com peça em falta vêm primeiro e abertos.
 */
export function PecasPorSistema({ grupos, onDesvincular, mexendo, ocupado }: {
  grupos: GrupoPecas[]; onDesvincular?: (p: LinhaPeca) => void; mexendo?: string; ocupado?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [soFalta, setSoFalta] = useState(false);
  const [aberta, setAberta] = useState("");
  // grupos abertos: começa com os que têm falta (ou o único); depois, o que a pessoa abrir/fechar (não muda sozinho no refresh)
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(grupos.length === 1 ? grupos.map((g) => g.chave)
    : grupos.filter((g) => g.pecas.some(emFalta)).map((g) => g.chave)));
  const marcar = (chave: string, aberto: boolean) => setAbertos((s) => {
    if (s.has(chave) === aberto) return s;
    const n = new Set(s);
    if (aberto) n.add(chave); else n.delete(chave);
    return n;
  });

  const ordenados = useMemo(() => grupos.map((g) => ({ ...g, falta: g.pecas.filter(emFalta).length }))
    .sort((a, b) => Number(b.falta > 0) - Number(a.falta > 0) || Number(a.chave === "geral") - Number(b.chave === "geral")), [grupos]);
  const total = new Set(grupos.flatMap((g) => g.pecas.map((p) => p.codigo))).size;
  const faltaTotal = new Set(grupos.flatMap((g) => g.pecas.filter(emFalta).map((p) => p.codigo))).size;
  const termos = norm(busca).split(/\s+/).filter(Boolean);
  const passa = (p: LinhaPeca) => (!soFalta || emFalta(p)) && termos.every((t) => norm(`${p.codigo} ${p.descricao} ${p.fabricanteRef} ${p.sysmat}`).includes(t));
  const filtrando = soFalta || termos.length > 0;

  if (!total) return null;
  return (
    <div className="space-y-3">
      {/* resumo + atalhos */}
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-semibold">{n0.format(total)} peça(s)</span>
        <span className={clsx("rounded-full px-2 py-0.5 text-[12px] font-medium", faltaTotal ? "bg-[var(--selo-critico-fundo)] text-[var(--selo-critico-texto)]" : "bg-[var(--selo-bom-fundo)] text-[var(--selo-bom-texto)]")}>
          {faltaTotal ? `${n0.format(faltaTotal)} em falta` : "nada em falta"}
        </span>
        {ordenados.length > 1 && ordenados.map((g) => (
          <a key={g.chave} href={`#sis-${g.chave}`} onClick={() => marcar(g.chave, true)}
            title="Peças deste sistema (uma peça usada em dois sistemas conta nos dois)" className="inline-flex min-h-10 items-center gap-1 rounded-full border border-borda bg-superficie px-2.5 text-[12.5px] text-texto-2 hover:bg-superficie-2">
            {g.rotulo} <span className="num text-texto-3">{g.pecas.length}</span>
            {g.falta > 0 && <span className="num font-semibold text-[var(--selo-critico-texto)]">· {g.falta} falta</span>}
          </a>
        ))}
      </div>

      {/* busca e filtro */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Buscar peça</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-3" aria-hidden />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} type="search" placeholder="Buscar código, descrição ou fabricante…"
            className="h-10 w-full rounded-xl border border-borda bg-superficie-2 pl-9 pr-3 text-[14px] placeholder:text-texto-4 focus:border-[var(--acao)] focus:bg-superficie" />
        </label>
        <button type="button" onClick={() => setSoFalta((v) => !v)} aria-pressed={soFalta}
          className={clsx("inline-flex min-h-10 items-center rounded-full border px-3.5 text-[13px]",
            soFalta ? "border-transparent bg-tinta font-semibold text-tinta-texto" : "border-borda bg-superficie text-texto-2")}>
          Só em falta
        </button>
      </div>

      {/* grupos */}
      {ordenados.map((g) => {
        const linhas = g.pecas.filter(passa);
        if (filtrando && !linhas.length) return null;
        return (
          <details key={g.chave} id={`sis-${g.chave}`} open={filtrando || abertos.has(g.chave)}
            onToggle={(e) => { if (!filtrando) marcar(g.chave, (e.currentTarget as HTMLDetailsElement).open); }}
            className="group scroll-mt-24 overflow-hidden rounded-cartao border border-borda bg-superficie">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2.5 hover:bg-superficie-2 [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-4 shrink-0 text-texto-3 transition group-open:rotate-180" aria-hidden />
              <span className="font-medium">{g.rotulo}</span>
              <span className="num text-[13px] text-texto-3">{filtrando ? `${linhas.length} de ${g.pecas.length}` : g.pecas.length}</span>
              {g.falta > 0 && <span className="ml-auto rounded-full bg-[var(--selo-critico-fundo)] px-2 py-0.5 text-[12px] font-medium text-[var(--selo-critico-texto)]">{g.falta} em falta</span>}
            </summary>
            <table className="w-full border-t border-borda text-left text-[13.5px]">
              <thead className="sr-only sm:not-sr-only">
                <tr className="bg-superficie-2 text-[12px] text-texto-3">
                  <th scope="col" className="px-3 py-1.5 font-semibold sm:w-28 sm:px-4">Código</th>
                  <th scope="col" className="px-2 py-1.5 font-semibold">Descrição</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-semibold sm:w-24">Saldo</th>
                  <th scope="col" className="px-2 py-1.5 font-semibold sm:w-40"><span className="sr-only sm:not-sr-only">Situação</span></th>
                  {onDesvincular && <th scope="col" className="w-12"><span className="sr-only">Desvincular</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {linhas.map((p) => {
                  const id = `${g.chave}:${p.codigo}`;
                  const aberto = aberta === id;
                  return (
                    <Linha key={p.codigo} p={p} aberto={aberto} alternar={() => setAberta(aberto ? "" : id)}
                      onDesvincular={onDesvincular} mexendo={mexendo === p.codigo} ocupado={!!ocupado} />
                  );
                })}
              </tbody>
            </table>
          </details>
        );
      })}
      {filtrando && !ordenados.some((g) => g.pecas.some(passa)) && (
        <p className="rounded-cartao border border-dashed border-borda px-5 py-6 text-center text-[13.5px] text-texto-3">Nenhuma peça com este filtro.</p>
      )}
    </div>
  );
}

function Linha({ p, aberto, alternar, onDesvincular, mexendo, ocupado }: {
  p: LinhaPeca; aberto: boolean; alternar: () => void; onDesvincular?: (p: LinhaPeca) => void; mexendo: boolean; ocupado: boolean;
}) {
  const detalhe = [p.sysmat && `Sysmat ${p.sysmat}${p.cadastro && p.cadastro !== "Ativo" ? ` (${p.cadastro.toLowerCase()})` : ""}`,
    !p.sysmat && p.cadastro, p.fabricanteRef, p.um && `UM ${p.um}`, p.valor ? `valor em estoque ${brl.format(p.valor)}` : "",
    p.depositos && `depósitos ${p.depositos}`, p.substituto && `substituto ${p.substituto}`].filter(Boolean);
  return (
    <>
      <tr className={clsx("cursor-pointer transition hover:bg-superficie-2", aberto && "bg-superficie-2")} onClick={alternar}>
        <td className="px-3 py-2 align-top sm:px-4">
          <button type="button" onClick={(e) => { e.stopPropagation(); alternar(); }} aria-expanded={aberto}
            className="num font-mono text-[12.5px] text-acao underline-offset-2 hover:underline">{p.codigo}</button>
        </td>
        <td className="px-2 py-2 align-top"><span className="line-clamp-2">{p.descricao || "—"}</span></td>
        <td className="num px-2 py-2 text-right align-top">{p.estoque == null ? "—" : `${n0.format(p.estoque)}${p.um ? ` ${p.um}` : ""}`}</td>
        <td className="px-2 py-2 align-top">
          <span className="inline-flex items-center gap-1.5 text-[12.5px]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: COR[p.status] }} aria-hidden />
            <span className="sr-only sm:not-sr-only">{SITUACAO[p.status]}</span>
          </span>
        </td>
        {onDesvincular && (
          <td className="px-1 py-1 align-top">
            <button type="button" disabled={ocupado || mexendo} aria-label={`Desvincular ${p.codigo}`} title="Desvincular"
              onClick={(e) => { e.stopPropagation(); onDesvincular(p); }}
              className="grid size-10 place-items-center rounded-lg text-texto-3 transition hover:bg-superficie hover:text-[var(--selo-critico-texto)] disabled:opacity-50">
              {mexendo ? <LoaderCircle className="size-4 animate-spin" /> : <Link2Off className="size-4" />}
            </button>
          </td>
        )}
      </tr>
      {aberto && (
        <tr className="bg-superficie-2">
          <td colSpan={onDesvincular ? 5 : 4} className="px-4 pb-3 pt-0">
            <div className="flex gap-3 text-[12.5px] text-texto-2">
              {p.foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.foto} alt="" loading="lazy" className="size-20 shrink-0 rounded-xl border border-borda bg-white object-cover" />
              ) : (
                <span className="grid size-20 shrink-0 place-items-center rounded-xl bg-superficie text-texto-3"><PackageOpen className="size-6" aria-hidden /></span>
              )}
              <div className="min-w-0 space-y-1">
                <div>{p.texto}</div>
                {detalhe.length > 0 && <div>{detalhe.join(" · ")}</div>}
                {p.descrCompleta && <p className="whitespace-pre-line text-texto-3">{p.descrCompleta.split(/\s*;\s*/).filter(Boolean).join("\n")}</p>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
