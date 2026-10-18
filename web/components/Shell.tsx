"use client";

import clsx from "clsx";
import { ChevronsLeft, LoaderCircle, LogOut, Menu, Moon, Search, Sun, X } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Icone } from "./Icone";
import { Marca } from "./Marca";
import { FaixaMarca } from "./ui";

export interface ItemMenu {
  id: string;
  titulo: string;
  icone: string;
  href: string;
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

/** Girando ao lado da aba clicada enquanto ela abre (resposta imediata ao clique). */
function Abrindo() {
  const { pending } = useLinkStatus();
  return <LoaderCircle aria-hidden className={clsx("size-3.5 shrink-0 animate-spin text-menu-apoio transition-opacity", pending ? "opacity-100" : "opacity-0")} />;
}

function Navegacao({ grupos, aoNavegar, recolhido }: { grupos: { titulo: string; itens: ItemMenu[] }[];
  aoNavegar?: () => void; recolhido?: boolean }) {
  const rota = usePathname();
  // sem pré-carregar as ~20 abas ao abrir a página (cada uma é uma chamada ao servidor): só ao passar o mouse/focar
  const router = useRouter();
  const preparar = (href: string) => () => router.prefetch(href);
  // a própria rota ou uma subpágina dela ("/confiabilidade" não acende em "/confiabilidade_tipos")
  const ativo = (href: string) => (href === "/" ? rota === "/" : rota === href || rota.startsWith(`${href}/`));
  return (
    <nav className="space-y-5">
      <Link prefetch={false} href="/" onClick={aoNavegar}
        className={clsx("flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition",
          ativo("/") ? "bg-menu-2 font-semibold text-white shadow-[inset_3px_0_0_var(--menu-marcador)]" : "text-menu-texto hover:bg-white/8")}>
        <Icone nome="Home" className="size-4 shrink-0" strokeWidth={1.75} />{!recolhido && "Início"}
      </Link>
      {grupos.map((g) => (
        <div key={g.titulo}>
          {!recolhido && <div className="mb-1 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-menu-apoio">{g.titulo}</div>}
          <ul className="space-y-0.5">
            {g.itens.map((it) => (
              <li key={it.id}>
                <Link prefetch={false} href={it.href} onClick={aoNavegar} title={it.titulo}
                  onMouseEnter={preparar(it.href)} onFocus={preparar(it.href)}
                  className={clsx("flex min-h-11 items-center gap-3 rounded-lg px-3 py-[7px] text-[13.5px] transition",
                    ativo(it.href) ? "bg-menu-2 font-semibold text-white shadow-[inset_3px_0_0_var(--menu-marcador)]" : "text-menu-texto hover:bg-white/8")}>
                  <Icone nome={it.icone} className="size-4 shrink-0" strokeWidth={1.75} />
                  {!recolhido && <span className="flex-1 truncate">{it.titulo}</span>}
                  <Abrindo />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** "Grupo › Aba" da rota ativa, pela mesma regra do menu (exata ou subpágina; "/" só exata). Sem aba no menu: null. */
function caminhoDe(grupos: { titulo: string; itens: ItemMenu[] }[], rota: string): { grupo: string; aba: string } | null {
  if (rota === "/") return { grupo: "", aba: "Início" };
  let melhor: { grupo: string; aba: string; tam: number } | null = null;
  for (const g of grupos) {
    for (const it of g.itens) {
      const casa = it.href !== "/" && (rota === it.href || rota.startsWith(`${it.href}/`));
      if (casa && (!melhor || it.href.length > melhor.tam)) melhor = { grupo: g.titulo, aba: it.titulo, tam: it.href.length };
    }
  }
  return melhor ? { grupo: melhor.grupo, aba: melhor.aba } : null;
}

function BotaoTema({ claro }: { claro?: boolean }) {
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
      className={clsx("grid size-11 shrink-0 place-items-center rounded-lg transition",
        claro ? "text-texto-2 hover:bg-superficie-2" : "text-menu-texto hover:bg-white/8")}>
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
  const caminho = caminhoDe(grupos, rota);
  // a busca só aparece para quem pode abrir /busca (o layout já filtra os grupos por função)
  const temBusca = grupos.some((g) => g.itens.some((i) => i.id === "busca"));

  // rodapé com a pessoa e o sair: na barra lateral (recolhida em 72px, empilhado) e na gaveta do celular (sempre aberta)
  const rodape = (colapsado: boolean) => (
    <div className={clsx("flex gap-3 rounded-xl bg-menu-2 p-2", colapsado ? "flex-col items-center" : "items-center")}>
      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--menu-marcador)] font-display text-[13px] font-medium text-[#11240F]">
        {iniciais(pessoa.nome) || "?"}
      </div>
      {!colapsado && (
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-medium text-white">{pessoa.nome}</div>
          <div className="truncate text-[11.5px] text-menu-apoio">{pessoa.funcao} · {pessoa.perfil}</div>
        </div>
      )}
      <form action={sair}>
        <button aria-label="Sair" title="Sair" className="grid size-11 place-items-center rounded-lg text-menu-texto transition hover:bg-white/8">
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      {/* barra lateral (computador) */}
      <aside className={clsx("nao-imprimir sticky top-0 hidden h-dvh shrink-0 flex-col bg-menu text-menu-texto lg:flex",
        recolhido ? "w-[72px]" : "w-[256px]")}>
        <div className="flex items-center justify-between px-4 pb-4 pt-5">
          <Marca compacta={recolhido} claro />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <Navegacao grupos={grupos} recolhido={recolhido} />
        </div>
        <div className="space-y-2 border-t border-white/10 p-3">
          <div className={clsx("flex", recolhido ? "justify-center" : "justify-end")}>
            <button onClick={() => setRecolhido(!recolhido)} aria-label={recolhido ? "Expandir menu" : "Recolher menu"}
              className="grid size-11 place-items-center rounded-xl text-menu-texto transition hover:bg-white/8">
              <ChevronsLeft className={clsx("size-4 transition", recolhido && "rotate-180")} />
            </button>
          </div>
          {rodape(recolhido)}
        </div>
      </aside>

      {/* topo (celular) */}
      <header className="nao-imprimir sticky top-0 z-30 flex items-center justify-between bg-menu px-4 py-3 text-white lg:hidden">
        <Marca compacta claro />
        <div className="flex items-center gap-2">
          {temBusca && (
            <Link href="/busca" prefetch={false} aria-label="Buscar" title="Buscar"
              className="grid size-11 place-items-center rounded-xl text-white transition hover:bg-white/8">
              <Search className="size-5" />
            </Link>
          )}
          <BotaoTema />
          <button onClick={() => setAberto(true)} aria-label="Abrir menu" className="grid size-11 place-items-center rounded-xl text-white transition hover:bg-white/8">
            <Menu className="size-5" />
          </button>
        </div>
      </header>
      {aberto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAberto(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-[320px] flex-col bg-menu text-menu-texto shadow-flutuante">
            <div className="flex items-center justify-between p-4">
              <Marca claro />
              <button onClick={() => setAberto(false)} aria-label="Fechar menu" className="grid size-11 place-items-center rounded-xl text-white transition hover:bg-white/8">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4"><Navegacao grupos={grupos} aoNavegar={() => setAberto(false)} /></div>
            <div className="border-t border-white/10 p-3">{rodape(false)}</div>
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <FaixaMarca />
        {/* barra do computador: caminho da página à esquerda; busca e tema à direita */}
        <div className="nao-imprimir hidden items-center gap-4 border-b border-borda bg-superficie px-8 py-2.5 lg:flex">
          <nav aria-label="Caminho da página" className="min-w-0 flex-1 truncate text-[13.5px]">
            {caminho?.grupo && (<><span className="text-texto-3">{caminho.grupo}</span><span aria-hidden className="mx-1.5 text-texto-3">›</span></>)}
            {caminho && <span aria-current="page" className="font-medium text-texto">{caminho.aba}</span>}
          </nav>
          {temBusca && (
            <form action="/busca" method="get" role="search" className="w-full max-w-[360px]">
              <label htmlFor="busca-topo" className="sr-only">Buscar</label>
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-3" />
                <input id="busca-topo" type="search" name="q" placeholder="Buscar ordem, equipamento ou material"
                  className="h-11 w-full rounded-xl border border-borda bg-superficie-2 pl-10 pr-3 text-[13.5px] text-texto placeholder:text-texto-3 focus:border-[var(--acao)]" />
              </div>
            </form>
          )}
          <BotaoTema claro />
        </div>
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
