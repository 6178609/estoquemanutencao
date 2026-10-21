"use client";

import clsx from "clsx";
import { LoaderCircle, Save } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";

import { Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";
import { casaBusca, chave, normalizarBusca } from "@/lib/dados/texto";
import { mostrarBr } from "@/lib/numeroBr";

import { salvarPessoasPadrao, type Resposta } from "../acoes";
import { validarSolicitantes } from "../validacao";

/** Filtro "Pessoas (requisições)" da aba Custos: escolhe quem solicita (endereço pes) e, se puder, grava o padrão. */

export interface OpcaoPessoa { nome: string; qtd: number }
export interface FiltroPessoasProps { disponiveis: OpcaoPessoa[]; ativos: string[]; padrao: string[]; podeSalvarPadrao: boolean }

const CAMPO = "h-9 w-full min-w-0 rounded-lg border border-borda bg-superficie-2 px-2.5 text-[13px] transition focus:border-[var(--acao)] focus:bg-superficie";

const mesmoConjunto = (a: string[], b: string[]) => {
  const x = new Set(a.map(chave)), y = new Set(b.map(chave));
  return x.size === y.size && [...x].every((k) => y.has(k));
};

export function FiltroPessoas({ disponiveis, ativos, padrao, podeSalvarPadrao }: FiltroPessoasProps) {
  const router = useRouter();
  const rota = usePathname();
  const params = useSearchParams();
  const painelId = useId();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Record<string, string>>({}); // chave → nome como ficou marcado
  const [primeiros, setPrimeiros] = useState<Set<string>>(new Set()); // o que estava marcado ao abrir: vem primeiro na lista
  const [msg, setMsg] = useState<Resposta | null>(null);
  const [pend, iniciar] = useTransition();

  const linhas = useMemo(() => {
    const naBase = new Set(disponiveis.map((o) => chave(o.nome)));
    const extras = new Map<string, OpcaoPessoa>();
    for (const nome of ativos) {
      const k = chave(nome);
      if (!naBase.has(k) && !extras.has(k)) extras.set(k, { nome, qtd: 0 });
    }
    return [...disponiveis, ...extras.values()]
      .map((o, i) => ({ ...o, k: chave(o.nome), i }))
      .sort((a, b) => (primeiros.has(a.k) ? 0 : 1) - (primeiros.has(b.k) ? 0 : 1) || a.i - b.i);
  }, [disponiveis, ativos, primeiros]);
  const visiveis = busca.trim() ? linhas.filter((o) => casaBusca(normalizarBusca(o.nome), busca)) : linhas;

  const marcados = Object.values(sel);
  const n = marcados.length;
  const erroPadrao = validarSolicitantes(marcados);
  const usandoOutra = !mesmoConjunto(ativos, padrao);
  const voltarHref = (() => {
    const p = new URLSearchParams(params.toString());
    p.delete("pes");
    const q = p.toString();
    return q ? `${rota}?${q}` : rota;
  })();

  function abrir() {
    const s = Object.fromEntries(ativos.map((nome) => [chave(nome), nome]));
    setSel(s);
    setPrimeiros(new Set(Object.keys(s)));
    setBusca("");
    setMsg(null);
    setAberto(true);
  }

  function alternar(k: string, nome: string) {
    setSel((s) => {
      const t = { ...s };
      if (k in t) delete t[k]; else t[k] = nome;
      return t;
    });
  }

  function aplicar() {
    const p = new URLSearchParams(params.toString());
    p.delete("pes");
    if (n) for (const nome of marcados) p.append("pes", nome);
    else p.append("pes", "todas");
    setAberto(false);
    iniciar(() => router.push(`${rota}?${p.toString()}`, { scroll: false }));
  }

  function salvarPadrao() {
    iniciar(async () => {
      const r = await salvarPessoasPadrao(marcados);
      setMsg(r);
      if (!r.erro) router.refresh();
    });
  }

  const rotulo = `Pessoas (requisições): ${ativos.length ? ativos.length : "todas"}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={clsx(BOTAO_SECUNDARIO, "h-10")} aria-expanded={aberto} aria-controls={painelId}
          onClick={() => (aberto ? setAberto(false) : abrir())}>
          {rotulo}
        </button>
        {usandoOutra && !aberto && (
          <p className="text-[13px] text-texto-3">
            Usando seleção do filtro — padrão: {padrao.length ? padrao.length : "todas"}.{" "}
            <Link href={voltarHref} scroll={false} prefetch={false} className="font-medium text-texto-2 underline">voltar ao padrão</Link>
          </p>
        )}
      </div>

      {aberto && (
        <div id={painelId} className="space-y-4 rounded-cartao border border-borda bg-superficie p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-0 max-w-sm flex-1">
              <span className="sr-only">Buscar pessoa</span>
              <input type="search" placeholder="Buscar pessoa…" className={clsx(CAMPO, "h-10")} value={busca} onChange={(e) => setBusca(e.target.value)} />
            </label>
            <span className="num pb-2 text-[13px] text-texto-2">{n === 1 ? "1 marcada" : `${n} marcadas`}</span>
          </div>

          <div className="max-h-[320px] overflow-y-auto overflow-x-hidden rounded-lg border border-borda">
            {visiveis.map((o) => {
              const marcado = o.k in sel;
              return (
                <label key={o.k} className={clsx("flex min-w-0 cursor-pointer items-start gap-3 border-borda px-4 py-2.5 not-first:border-t", marcado && "bg-marca-500/5")}>
                  <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--acao)]" checked={marcado}
                    onChange={() => alternar(o.k, o.nome)} />
                  <span className="min-w-0 flex-1 break-words">
                    <span className="text-[13.5px] font-medium">{o.nome}</span>
                    <span className="block text-[12px] text-texto-3">
                      {o.qtd ? (o.qtd === 1 ? "1 requisição" : `${mostrarBr(o.qtd)} requisições`) : "(sem requisições na base)"}
                    </span>
                  </span>
                </label>
              );
            })}
            {!visiveis.length && (
              <p className="px-4 py-6 text-center text-[13px] text-texto-3">
                {busca.trim() ? "Nenhuma pessoa com esse nome." : "Nenhuma requisição na base."}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={BOTAO_PRIMARIO} disabled={pend} onClick={aplicar}>Aplicar</button>
            <button type="button" className={BOTAO_SECUNDARIO} disabled={pend || !n} onClick={() => setSel({})}>Limpar</button>
            {podeSalvarPadrao && (
              <button type="button" className={BOTAO_SECUNDARIO} disabled={pend || !!erroPadrao} onClick={salvarPadrao}>
                {pend ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar como padrão
              </button>
            )}
          </div>
          {erroPadrao && <p className="text-[12.5px] text-[var(--st-critico)]">{erroPadrao}</p>}
          {msg && <Mensagem tipo={msg.erro ? "erro" : "ok"}>{msg.erro || msg.ok}</Mensagem>}
        </div>
      )}
    </div>
  );
}
