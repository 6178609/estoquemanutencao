"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { useActionState } from "react";

import { Campo, Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO } from "@/components/ui";
import { acaoTrocarSenha, type EstadoSenha } from "./acoes";

export function FormularioSenha({ pedirAtual }: { pedirAtual: boolean }) {
  const [estado, enviar, enviando] = useActionState<EstadoSenha, FormData>(acaoTrocarSenha, { erro: "", ok: "" });
  return (
    <form action={enviar} className="space-y-4" key={estado.ok}>
      {pedirAtual && <Campo rotulo="Senha atual" name="atual" type="password" required autoComplete="current-password" />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nova senha" name="s1" type="password" required autoComplete="new-password"
          dica="Mínimo de 8 caracteres, com letras e números." />
        <Campo rotulo="Repita a nova senha" name="s2" type="password" required autoComplete="new-password" />
      </div>
      {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
      {estado.ok && <Mensagem tipo="ok">{estado.ok}</Mensagem>}
      <button disabled={enviando} className={BOTAO_PRIMARIO}>
        {enviando ? <LoaderCircle className="size-5 animate-spin" /> : <><KeyRound className="size-4" /> Salvar senha</>}
      </button>
    </form>
  );
}
