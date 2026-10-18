"use client";

import clsx from "clsx";
import { Link2, Link2Off, LoaderCircle, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Mensagem } from "@/components/Campos";
import { BOTAO_COMPACTO } from "@/components/ui";

import { SeloPeca } from "../equipamentos/SeloPeca";
import { alterarPecas, buscarMateriaisMro } from "./acoes";
import type { PecaMro } from "./logica";

const ENTRADA = "h-10 w-full rounded-xl border border-borda bg-superficie-2 px-3 pl-9 text-[14px] transition placeholder:text-texto-4 focus:border-[var(--acao)] focus:bg-superficie";

/** Peças de um ativo: lista com a situação no estoque e, para quem edita, buscar na base de material e vincular/desvincular. */
export function PecasAtivo({ tag, pecas, edita }: { tag: string; pecas: PecaMro[]; edita: boolean }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  const [ocupado, iniciar] = useTransition();
  const [mexendo, setMexendo] = useState("");
  const [busca, setBusca] = useState("");
  const [cand, setCand] = useState<{ itens: PecaMro[]; total: number; semBase: boolean } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!edita) return;
    if (espera.current) clearTimeout(espera.current);
    let vivo = true;
    espera.current = setTimeout(async () => {
      setBuscando(true);
      const r = await buscarMateriaisMro(busca);
      if (vivo) { setCand(r); setBuscando(false); }
    }, busca ? 300 : 0);
    return () => { vivo = false; if (espera.current) clearTimeout(espera.current); };
  }, [busca, edita]);

  const vinculados = new Set(pecas.map((p) => p.codigo));
  function mudar(codigo: string, vincular: boolean) {
    setErro("");
    setMexendo(codigo);
    iniciar(async () => {
      const r = await alterarPecas(tag, vincular ? [codigo] : [], vincular ? [] : [codigo]);
      if ("erro" in r) setErro(r.erro);
      else router.refresh();
      setMexendo("");
    });
  }

  const lista = (
    <div className="min-w-0">
      <div className="mb-2 text-[12.5px] font-medium text-texto-2">Peças vinculadas ({pecas.length})</div>
      {!pecas.length ? (
        <p className="rounded-xl border border-dashed border-borda px-3 py-6 text-center text-[13px] text-texto-3">
          Nenhuma peça vinculada a este ativo{edita ? ". Busque na base de material ao lado e clique em Vincular." : "."}
        </p>
      ) : (
        <ul className="max-h-80 divide-y divide-borda overflow-y-auto rounded-xl border border-borda">
          {pecas.map((p) => (
            <li key={p.codigo} className="flex items-center gap-2 px-3 py-2 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[12.5px] text-alp-azul">{p.codigo}</span><SeloPeca p={p} />
                </div>
                <div className="truncate text-texto-2">{p.descricao || "—"}</div>
                <Detalhe p={p} />
              </div>
              {edita && (
                <button type="button" disabled={ocupado} onClick={() => mudar(p.codigo, false)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-texto-3 hover:bg-superficie-2 hover:text-texto disabled:opacity-50">
                  {mexendo === p.codigo ? <LoaderCircle className="size-3.5 animate-spin" /> : <Link2Off className="size-3.5" />} Desvincular
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (!edita) return lista;
  return (
    <div className="space-y-3">
      {erro && <Mensagem>{erro}</Mensagem>}
      <div className="grid gap-4 lg:grid-cols-2">
        {lista}
        <div className="min-w-0">
          <div className="mb-2 text-[12.5px] font-medium text-texto-2">Vincular da MB52 e do catálogo Sysmat</div>
          {cand?.semBase ? <p className="text-[13px] text-texto-3">Envie o export do <b>MB52</b> ou o catálogo <b>Sysmat</b> em Fontes de dados para vincular peças.</p> : (
            <>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-3" />
                <input className={ENTRADA} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar código, descrição, Sysmat ou fabricante…" />
                {buscando && <LoaderCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-texto-3" />}
              </label>
              <ul className="mt-2 h-64 overflow-y-auto rounded-xl border border-borda">
                {cand && !cand.itens.length && <li className="px-3 py-3 text-[13px] text-texto-3">Nenhum material encontrado.</li>}
                {cand?.itens.map((p) => {
                  const on = vinculados.has(p.codigo);
                  return (
                    <li key={p.codigo} className="flex items-center gap-2.5 border-b border-borda px-3 py-2 text-[13px] last:border-b-0">
                      <span className="font-mono text-[12.5px] text-alp-azul">{p.codigo}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate" title={p.descricao}>{p.descricao || "—"}</span>
                        <span className="block truncate text-[11.5px] text-texto-3">{[p.noMb52 ? p.texto : "só no Sysmat", p.sysmat && `Sysmat ${p.sysmat}`, p.fabricanteRef].filter(Boolean).join(" · ")}</span>
                      </span>
                      <button type="button" disabled={ocupado || on} onClick={() => mudar(p.codigo, true)}
                        className={on
                          ? "inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-[color:var(--st-bom)] transition disabled:cursor-default"
                          : clsx(BOTAO_COMPACTO, "shrink-0")}>
                        {mexendo === p.codigo ? <LoaderCircle className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />} {on ? "Vinculada" : "Vincular"}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {cand && cand.total > cand.itens.length && (
                <p className="mt-1.5 text-[12px] text-texto-3">Mostrando {cand.itens.length} de {cand.total.toLocaleString("pt-BR")} materiais — refine a busca.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** O que a MB52 e o Sysmat dizem da peça (unidade, valor, depósitos, código Sysmat, fabricante, descrição completa). */
function Detalhe({ p }: { p: PecaMro }) {
  const partes = [p.um && `UM ${p.um}`, p.valor ? `valor ${brl.format(p.valor)}` : "", p.depositos && `dep. ${p.depositos}`,
    p.sysmat && `Sysmat ${p.sysmat}${p.cadastro && p.cadastro !== "Ativo" ? ` (${p.cadastro.toLowerCase()})` : ""}`,
    !p.sysmat && p.cadastro, p.fabricanteRef, p.substituto && `substituto ${p.substituto}`].filter(Boolean);
  if (!partes.length && !p.descrCompleta) return null;
  return (
    <div className="mt-0.5 text-[11.5px] leading-snug text-texto-3">
      {partes.join(" · ")}
      {p.descrCompleta && <details className="mt-0.5"><summary className="cursor-pointer select-none hover:text-texto-2">descrição completa (Sysmat)</summary>
        <p className="mt-1 whitespace-pre-line text-texto-2">{p.descrCompleta.split(/\s*;\s*/).filter(Boolean).join("\n")}</p></details>}
    </div>
  );
}
