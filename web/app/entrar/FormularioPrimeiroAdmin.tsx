"use client";

import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { useActionState } from "react";

import { Campo, Mensagem, Seletor } from "@/components/Campos";
import { acaoPrimeiroAdmin, type EstadoPrimeiro } from "./acoes";

const FUNCOES_ADMIN = { lider: "Líder de manutenção", analista: "Analista" };

export function FormularioPrimeiroAdmin({ pedeCodigo }: { pedeCodigo: boolean }) {
  const [estado, enviar, enviando] = useActionState<EstadoPrimeiro, FormData>(acaoPrimeiroAdmin,
    { erro: "", nome: "", login: "", funcao: "" });
  return (
    <form action={enviar} className="space-y-4">
      <div className="flex gap-3 rounded-xl border border-borda bg-superficie-2 px-3.5 py-3 text-[13px] text-texto-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-marca-500" />
        <span><b>Primeiro acesso.</b> O site está ligado ao repositório de dados, que ainda não tem usuários: crie a conta
          de <b>administrador</b>. Depois, cadastre a equipe em <b>Usuários</b>.</span>
      </div>
      <Campo rotulo="Seu nome" name="nome" defaultValue={estado.nome} required autoComplete="name" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Número Pessoal (NP)" name="login" defaultValue={estado.login} required inputMode="numeric"
          placeholder="Ex.: 6178609" autoComplete="username" />
        <Seletor rotulo="Função" name="funcao" opcoes={FUNCOES_ADMIN} defaultValue={estado.funcao || "lider"} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Senha" name="senha" type="password" required autoComplete="new-password" />
        <Campo rotulo="Repita a senha" name="senha2" type="password" required autoComplete="new-password" />
      </div>
      <p className="-mt-2 text-[12px] text-texto-3">Mínimo de 8 caracteres, com letras e números.</p>
      {pedeCodigo && (
        <Campo rotulo="Código de configuração" name="codigo" required autoComplete="off" spellCheck={false}
          dica="Os 6 últimos caracteres do token do GitHub (github_pat_…) colocado na Vercel. Só quem configurou o site sabe." />
      )}
      {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
      <button disabled={enviando}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-marca-500 font-display text-[15px] font-medium text-white transition hover:bg-marca-600 disabled:cursor-not-allowed disabled:opacity-60">
        {enviando ? <LoaderCircle className="size-5 animate-spin" /> : <>Criar administrador <ArrowRight className="size-4" /></>}
      </button>
    </form>
  );
}
