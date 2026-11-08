"use client";

import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { Campo, Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO } from "@/components/ui";
import { acaoAtualizarDados, type EstadoDados } from "./acoes";

/** Nome completo e e-mail (obrigatórios): confirmados todo mês pela própria pessoa. */
export function FormularioDados({ nome, email }: { nome: string; email: string }) {
  const [estado, enviar, enviando] = useActionState<EstadoDados, FormData>(acaoAtualizarDados, { erro: "", ok: "" });
  const formulario = useRef<HTMLFormElement>(null);
  // o erro vai para o campo a que se refere e o foco volta para ele
  const campoDoErro = estado.erro ? (/e-mail/i.test(estado.erro) ? "email" : /nome|letras/i.test(estado.erro) ? "nome" : "") : "";
  const erroDe = (campo: string) => (campoDoErro === campo ? estado.erro : undefined);
  useEffect(() => {
    formulario.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [estado]);
  return (
    <form ref={formulario} action={enviar} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome completo" name="nome" defaultValue={nome} required maxLength={120} autoComplete="name"
          dica="Nome e sobrenome, como no crachá." erro={erroDe("nome")} />
        <Campo rotulo="E-mail" name="email" type="email" inputMode="email" defaultValue={email} required maxLength={120}
          autoComplete="email" spellCheck={false} placeholder="nome@empresa.com…" erro={erroDe("email")} />
      </div>
      {estado.erro && !campoDoErro && <Mensagem>{estado.erro}</Mensagem>}
      {estado.ok && <Mensagem tipo="ok">{estado.ok}</Mensagem>}
      <button disabled={enviando} className={BOTAO_PRIMARIO}>
        {enviando ? <><LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> Salvando…</>
          : <><CheckCircle2 className="size-4" aria-hidden="true" /> Confirmar meus dados</>}
      </button>
    </form>
  );
}
