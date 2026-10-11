"use client";

import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, Sparkles, UserRound } from "lucide-react";
import { useActionState, useState } from "react";

import { acaoDemo, acaoEntrar, type EstadoEntrada } from "./acoes";

export function FormularioEntrada({ demo, siteAtual }: { demo: boolean; siteAtual: string | null }) {
  const [estado, enviar, enviando] = useActionState<EstadoEntrada, FormData>(acaoEntrar, { erro: "", login: "" });
  const [ver, setVer] = useState(false);

  return (
    <div className="space-y-6">
      {demo && (
        <form action={acaoDemo}>
          <button className="group flex w-full items-center justify-between rounded-2xl border border-marca-200 bg-marca-50 px-5 py-4 text-left transition hover:border-marca-400 hover:shadow-flutuante dark:border-marca-800 dark:bg-marca-900/30">
            <span>
              <span className="flex items-center gap-2 font-display font-semibold text-marca-800 dark:text-marca-200">
                <Sparkles className="size-4" /> Entrar na demonstração
              </span>
              <span className="mt-0.5 block text-sm text-texto-2">Dados fictícios — o site ainda não está ligado ao repositório de dados.</span>
            </span>
            <ArrowRight className="size-5 text-marca-700 transition group-hover:translate-x-1" />
          </button>
        </form>
      )}

      <form action={enviar} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-texto-2">Número Pessoal (NP)</span>
          <span className="relative block">
            <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-texto-3" />
            <input name="login" inputMode="numeric" autoComplete="username" defaultValue={estado.login} required
              placeholder="Ex.: 6178609" disabled={demo}
              className="h-12 w-full rounded-xl border border-borda bg-superficie pl-10 pr-3 text-[15px] outline-none transition placeholder:text-texto-3 focus:border-marca-500 focus:ring-4 focus:ring-marca-500/15 disabled:opacity-50" />
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-texto-2">Senha</span>
          <span className="relative block">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-texto-3" />
            <input name="senha" type={ver ? "text" : "password"} autoComplete="current-password" required disabled={demo}
              className="h-12 w-full rounded-xl border border-borda bg-superficie pl-10 pr-11 text-[15px] outline-none transition focus:border-marca-500 focus:ring-4 focus:ring-marca-500/15 disabled:opacity-50" />
            <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? "Esconder senha" : "Mostrar senha"}
              className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2">
              {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-texto-2">
          <input type="checkbox" name="manter" className="size-4 rounded accent-marca-600" disabled={demo} /> Manter conectado neste aparelho (30 dias)
        </label>
        {estado.erro && (
          <p role="alert" className="rounded-xl border border-perigo-500/30 bg-perigo-500/10 px-3.5 py-2.5 text-sm font-medium text-perigo-500">
            {estado.erro}
          </p>
        )}
        <button disabled={enviando || demo}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-marca-600 font-display text-[15px] font-semibold text-white shadow-cartao transition hover:bg-marca-700 disabled:cursor-not-allowed disabled:opacity-60">
          {enviando ? <LoaderCircle className="size-5 animate-spin" /> : <>Entrar <ArrowRight className="size-4" /></>}
        </button>
      </form>
      <p className="text-center text-sm text-texto-3">
        Use o mesmo NP e senha do site atual.
        {siteAtual && (<> Sem acesso? Peça em <a href={siteAtual} className="font-medium text-acao-500 hover:underline">Solicitar acesso</a>.</>)}
      </p>
    </div>
  );
}
