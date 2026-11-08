"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { Campo, Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO } from "@/components/ui";
import { acaoTrocarSenha, type EstadoSenha } from "./acoes";

export function FormularioSenha({ pedirAtual }: { pedirAtual: boolean }) {
  const [estado, enviar, enviando] = useActionState<EstadoSenha, FormData>(acaoTrocarSenha, { erro: "", ok: "" });
  const formulario = useRef<HTMLFormElement>(null);
  // o erro vai para o campo a que se refere (senha atual, nova senha ou repetição) e o foco volta para ele
  const campoDoErro = estado.erro ? (/atual/i.test(estado.erro) ? "atual" : /conferem/i.test(estado.erro) ? "s2"
    : /caracteres|letras/i.test(estado.erro) ? "s1" : "") : "";
  const erroDe = (campo: string) => (campoDoErro === campo ? estado.erro : undefined);
  useEffect(() => {
    formulario.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [estado]);
  return (
    <form ref={formulario} action={enviar} className="space-y-4" key={estado.ok}>
      {pedirAtual && <Campo rotulo="Senha atual" name="atual" type="password" required autoComplete="current-password" erro={erroDe("atual")} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nova senha" name="s1" type="password" required autoComplete="new-password"
          dica="Mínimo de 8 caracteres, com letras e números." erro={erroDe("s1")} />
        <Campo rotulo="Repita a nova senha" name="s2" type="password" required autoComplete="new-password" erro={erroDe("s2")} />
      </div>
      {estado.erro && !campoDoErro && <Mensagem>{estado.erro}</Mensagem>}
      {estado.ok && <Mensagem tipo="ok">{estado.ok}</Mensagem>}
      <button disabled={enviando} className={BOTAO_PRIMARIO}>
        {enviando ? <><LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> Salvando…</> : <><KeyRound className="size-4" /> Salvar senha</>}
      </button>
    </form>
  );
}
