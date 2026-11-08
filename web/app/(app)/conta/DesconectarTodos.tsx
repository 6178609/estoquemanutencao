"use client";

import { BOTAO_SECUNDARIO } from "@/components/ui";

/** Desconectar todos os aparelhos pede confirmação antes (a ação encerra também a sessão atual). */
export function DesconectarTodos({ acao }: { acao: () => Promise<void> }) {
  return (
    <form action={acao} className="mt-5"
      onSubmit={(e) => { if (!confirm("Desconectar todos os aparelhos? Você também sairá deste aparelho e precisará entrar de novo.")) e.preventDefault(); }}>
      <button type="submit" className={BOTAO_SECUNDARIO}>Desconectar todos os aparelhos</button>
    </form>
  );
}
