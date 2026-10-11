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
    <nav className="space-y-5">
      <Link href="/" onClick={aoNavegar}
        className={clsx("relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition",
          ativo("/") ? "bg-superficie-3 font-medium text-texto" : "text-texto-2 hover:bg-superficie-2 hover:text-texto")}>
        {ativo("/") && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-marca-500" />}
        <Icone nome="Home" className="size-4 shrink-0" strokeWidth={1.75} />{!recolhido && "Início"}
      </Link>
      {grupos.map((g) => (
        <div key={g.titulo}>
          {!recolhido && <div className="mb-1 px-3 text-[11px] font-medium text-texto-4">{g.titulo}</div>}
          <ul className="space-y-0.5">
            {g.itens.map((it) => (
              <li key={it.id}>
                {it.externo && !it.href ? (
                  <span title={`${it.titulo} — em breve no site novo`}
                    className="flex cursor-default items-center gap-3 rounded-lg px-3 py-[7px] text-[13.5px] text-texto-4">
                    <Icone nome={it.icone} className="size-4 shrink-0" strokeWidth={1.75} />
                    {!recolhido && <><span className="flex-1 truncate">{it.titulo}</span><span className="text-[10.5px]">em breve</span></>}
                  </span>
                ) : it.externo ? (
                  <a href={it.href} title={it.titulo}
                    className="group flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13.5px] text-texto-3 transition hover:bg-superficie-2 hover:text-texto">
                    <Icone nome={it.icone} className="size-4 shrink-0" strokeWidth={1.75} />
                    {!recolhido && <><span className="flex-1 truncate">{it.titulo}</span>
                      <ArrowUpRight className="size-3.5 opacity-0 transition group-hover:opacity-100" /></>}
                  </a>
                ) : (
                  <Link href={it.href} onClick={aoNavegar} title={it.titulo}
                    className={clsx("relative flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13.5px] transition",
                      ativo(it.href) ? "bg-superficie-3 font-medium text-texto" : "text-texto hover:bg-superficie-2")}>
                    {ativo(it.href) && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-marca-500" />}
                    <Icone nome={it.icone} className="size-4 shrink-0" strokeWidth={1.75} />
                    {!recolhido && <><span className="flex-1 truncate">{it.titulo}</span>
                      <span className="size-1.5 rounded-full bg-marca-500" title="Já no site novo" /></>}
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
      className="grid size-9 place-items-center rounded-lg text-texto-2 transition hover:bg-superficie-2">
      {escuro ? <Sun className="size-4" strokeWidth={1.75} /> : <Moon className="size-4" strokeWidth={1.75} />}
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
    <div className="flex items-center gap-3 rounded-xl border border-borda bg-superficie-2 p-2">
      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-marca-500 font-display text-[13px] font-medium text-white">
        {iniciais(pessoa.nome) || "?"}
      </div>
      {!recolhido && (
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-medium">{pessoa.nome}</div>
          <div className="truncate text-[11.5px] text-texto-3">{pessoa.funcao} · {pessoa.perfil}</div>
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
      <aside className={clsx("nao-imprimir sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-borda bg-superficie lg:flex",
        recolhido ? "w-[72px]" : "w-[256px]")}>
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
          <div className="nao-imprimir border-b border-borda bg-superficie-2 px-4 py-2 text-center text-[13px] text-texto-2">
            <span className="mr-2 inline-block size-1.5 -translate-y-0.5 rounded-full bg-alp-amarelo" />
            Modo demonstração — dados fictícios. Ligue o repositório de dados nas variáveis da Vercel para ver os dados reais.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
