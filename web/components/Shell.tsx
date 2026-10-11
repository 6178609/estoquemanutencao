"use client";

import clsx from "clsx";
import { ArrowUpRight, ChevronsLeft, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Icone } from "./Icone";
import { Marca } from "./Marca";

export interface ItemMenu {
  id: string;
  titulo: string;
  icone: string;
  href: string;
  externo: boolean;
  parcial?: string;
}

export interface Pessoa {
  nome: string;
  funcao: string;
  perfil: string;
  demo: boolean;
}

function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function Navegacao({ grupos, aoNavegar, recolhido }: { grupos: { titulo: string; itens: ItemMenu[] }[];
  aoNavegar?: () => void; recolhido?: boolean }) {
  const rota = usePathname();
  const ativo = (href: string) => (href === "/" ? rota === "/" : rota.startsWith(href));
  return (
    <nav className="space-y-6">
      <Link href="/" onClick={aoNavegar}
        className={clsx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
          ativo("/") ? "bg-marca-600 text-white shadow-cartao" : "text-texto-2 hover:bg-superficie-2 hover:text-texto")}>
        <Icone nome="Home" className="size-4 shrink-0" />{!recolhido && "Início"}
      </Link>
      {grupos.map((g) => (
        <div key={g.titulo}>
          {!recolhido && <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-3">{g.titulo}</div>}
          <ul className="space-y-0.5">
            {g.itens.map((it) => (
              <li key={it.id}>
                {it.externo && !it.href ? (
                  <span title={`${it.titulo} — em breve no site novo`}
                    className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2 text-sm text-texto-3/70">
                    <Icone nome={it.icone} className="size-4 shrink-0 opacity-50" />
                    {!recolhido && <><span className="flex-1 truncate">{it.titulo}</span><span className="text-[10px] font-semibold uppercase tracking-wide">em breve</span></>}
                  </span>
                ) : it.externo ? (
                  <a href={it.href} title={`${it.titulo} — ainda no site atual`}
                    className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-texto-3 transition hover:bg-superficie-2 hover:text-texto-2">
                    <Icone nome={it.icone} className="size-4 shrink-0 opacity-70" />
                    {!recolhido && <><span className="flex-1 truncate">{it.titulo}</span>
                      <ArrowUpRight className="size-3.5 opacity-0 transition group-hover:opacity-100" /></>}
                  </a>
                ) : (
                  <Link href={it.href} onClick={aoNavegar} title={it.titulo}
                    className={clsx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                      ativo(it.href) ? "bg-marca-600 text-white shadow-cartao" : "text-texto hover:bg-superficie-2")}>
                    <Icone nome={it.icone} className="size-4 shrink-0" />
                    {!recolhido && <><span className="flex-1 truncate">{it.titulo}</span>
                      <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        ativo(it.href) ? "bg-white/20" : "bg-marca-100 text-marca-800 dark:bg-marca-900/50 dark:text-marca-200")}>novo</span></>}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function BotaoTema() {
  const [escuro, setEscuro] = useState<boolean | null>(null);
  useEffect(() => {
    let salvo: string | null = null;
    try { salvo = localStorage.getItem("tema"); } catch { /* sem armazenamento */ }
    const e = salvo ? salvo === "escuro" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.tema = e ? "escuro" : "claro";
    setEscuro(e);
  }, []);
  const trocar = () => {
    const e = !escuro;
    document.documentElement.dataset.tema = e ? "escuro" : "claro";
    try { localStorage.setItem("tema", e ? "escuro" : "claro"); } catch { /* sem armazenamento */ }
    setEscuro(e);
  };
  return (
    <button onClick={trocar} aria-label="Alternar tema claro/escuro"
      className="grid size-9 place-items-center rounded-xl text-texto-2 transition hover:bg-superficie-2">
      {escuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function Shell({ grupos, pessoa, sair, children }: {
  grupos: { titulo: string; itens: ItemMenu[] }[];
  pessoa: Pessoa;
  sair: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [recolhido, setRecolhido] = useState(false);
  const rota = usePathname();
  useEffect(() => setAberto(false), [rota]);

  const rodape = (
    <div className="flex items-center gap-3 rounded-2xl border border-borda bg-superficie p-2.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-marca-500 to-acao-500 font-display text-sm font-bold text-white">
        {iniciais(pessoa.nome) || "?"}
      </div>
      {!recolhido && (
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold">{pessoa.nome}</div>
          <div className="truncate text-xs text-texto-3">{pessoa.funcao} · {pessoa.perfil}</div>
        </div>
      )}
      <form action={sair}>
        <button aria-label="Sair" title="Sair" className="grid size-8 place-items-center rounded-lg text-texto-3 transition hover:bg-superficie-2 hover:text-perigo-500">
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* barra lateral (computador) */}
      <aside className={clsx("nao-imprimir sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-borda bg-superficie/80 backdrop-blur lg:flex",
        recolhido ? "w-[76px]" : "w-[272px]")}>
        <div className="flex items-center justify-between px-4 pb-4 pt-5">
          <Marca compacta={recolhido} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <Navegacao grupos={grupos} recolhido={recolhido} />
        </div>
        <div className="space-y-2 border-t border-borda p-3">
          <div className={clsx("flex", recolhido ? "flex-col items-center gap-1" : "items-center justify-between")}>
            <BotaoTema />
            <button onClick={() => setRecolhido(!recolhido)} aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
              className="grid size-9 place-items-center rounded-xl text-texto-2 transition hover:bg-superficie-2">
              <ChevronsLeft className={clsx("size-4 transition", recolhido && "rotate-180")} />
            </button>
          </div>
          {rodape}
        </div>
      </aside>

      {/* topo (celular) */}
      <header className="nao-imprimir sticky top-0 z-30 flex items-center justify-between border-b border-borda bg-superficie/85 px-4 py-3 backdrop-blur lg:hidden">
        <Marca compacta />
        <div className="flex items-center gap-1">
          <BotaoTema />
          <button onClick={() => setAberto(true)} aria-label="Abrir menu" className="grid size-9 place-items-center rounded-xl hover:bg-superficie-2">
            <Menu className="size-5" />
          </button>
        </div>
      </header>
      {aberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAberto(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] flex-col bg-superficie shadow-flutuante">
            <div className="flex items-center justify-between p-4">
              <Marca />
              <button onClick={() => setAberto(false)} aria-label="Fechar menu" className="grid size-9 place-items-center rounded-xl hover:bg-superficie-2">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4"><Navegacao grupos={grupos} aoNavegar={() => setAberto(false)} /></div>
            <div className="border-t border-borda p-3">{rodape}</div>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">
        {pessoa.demo && (
          <div className="nao-imprimir border-b border-sol-400/40 bg-sol-400/15 px-4 py-2 text-center text-sm font-medium text-texto">
            Modo demonstração — dados fictícios. Ligue o repositório de dados nas variáveis da Vercel para ver os dados reais.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
