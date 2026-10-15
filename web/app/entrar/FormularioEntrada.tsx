"use client";

import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, Sparkles, UserRound } from "lucide-react";
import { useActionState, useState } from "react";

import { INATIVIDADE_MIN } from "@/lib/auth/inatividade";

import { acaoDemo, acaoEntrar, type EstadoEntrada } from "./acoes";

export function FormularioEntrada({ demo }: { demo: boolean }) {
  const [estado, enviar, enviando] = useActionState<EstadoEntrada, FormData>(acaoEntrar, { erro: "", login: "" });
  const [ver, setVer] = useState(false);

  return (
    <div className="space-y-5">
      {demo && (
        <form action={acaoDemo}>
          <button className="group flex w-full items-center justify-between rounded-xl border border-borda bg-superficie-2 px-4 py-3.5 text-left transition hover:border-marca-300">
            <span>
              <span className="flex items-center gap-2 font-display font-medium text-marca-600 dark:text-marca-300">
                <Sparkles className="size-4" /> Entrar na demonstração
              </span>
              <span className="mt-0.5 block text-[12.5px] text-texto-3">Dados fictícios — o site ainda não está ligado ao repositório de dados.</span>
            </span>
            <ArrowRight className="size-4 text-texto-3 transition group-hover:translate-x-1" />
          </button>
        </form>
      )}

      <form action={enviar} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-texto-2">Número Pessoal (NP)</span>
          <span className="relative block">
            <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-texto-3" />
            <input name="login" inputMode="numeric" autoComplete="username" defaultValue={estado.login} required
              placeholder="Ex.: 6178609" disabled={demo}
              className="h-11 w-full rounded-xl border border-borda bg-superficie-2 pl-10 pr-3 text-[15px] outline-none transition placeholder:text-texto-3 focus:border-marca-500 focus:bg-superficie focus:ring-4 focus:ring-marca-500/12 disabled:opacity-50" />
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-texto-2">Senha</span>
          <span className="relative block">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-texto-3" />
            <input name="senha" type={ver ? "text" : "password"} autoComplete="current-password" required disabled={demo}
              className="h-11 w-full rounded-xl border border-borda bg-superficie-2 pl-10 pr-11 text-[15px] outline-none transition focus:border-marca-500 focus:bg-superficie focus:ring-4 focus:ring-marca-500/12 disabled:opacity-50" />
            <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? "Esconder senha" : "Mostrar senha"}
              className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2">
              {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </span>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-texto-3">
          <input type="checkbox" name="manter" className="size-4 rounded accent-marca-600" disabled={demo} /> Manter conectado neste aparelho (30 dias; sai sozinho após {INATIVIDADE_MIN} min sem uso)
        </label>
        {estado.erro && (
          <p role="alert" className="rounded-xl border border-perigo-500/30 bg-perigo-500/10 px-3.5 py-2.5 text-sm font-medium text-perigo-500">
            {estado.erro}
          </p>
        )}
        <button disabled={enviando || demo}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-marca-500 font-display text-[15px] font-medium text-white transition hover:bg-marca-600 disabled:cursor-not-allowed disabled:opacity-60">
          {enviando ? <LoaderCircle className="size-5 animate-spin" /> : <>Entrar <ArrowRight className="size-4" /></>}
        </button>
      </form>
      <p className="text-center text-[12.5px] text-texto-3">
        {demo ? "Sem acesso ou esqueceu a senha? Peça a um administrador do PCM."
          : "Ainda sem acesso? Use Solicitar acesso. Esqueceu a senha? Peça a um administrador do PCM."}
      </p>
    </div>
  );
}
