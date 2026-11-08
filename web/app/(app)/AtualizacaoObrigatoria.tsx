import { UserRoundCheck } from "lucide-react";

import { Marca } from "@/components/Marca";
import { IconeQuadro, Titulo } from "@/components/ui";
import { FormularioDados } from "./conta/FormularioDados";

/**
 * Atualização mensal obrigatória dos dados cadastrais: quem nunca confirmou ou passou de 1 mês desde a última
 * confirmação só usa o site depois de salvar nome completo e e-mail (regra em lib/auth/atualizacaoDados.ts).
 */
export function AtualizacaoObrigatoria({ nome, email, primeira, sair }: {
  nome: string; email: string; primeira: boolean; sair: () => Promise<void>;
}) {
  return (
    <div className="min-h-dvh bg-fundo">
      <header className="border-b border-borda">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 sm:px-8">
          <Marca />
          <form action={sair}><button className="text-[14px] text-texto-3 transition-colors hover:text-texto">Sair</button></form>
        </div>
      </header>
      <main id="conteudo" tabIndex={-1} className="relative focus:outline-none">
        <div aria-hidden className="pontos absolute inset-0" />
        <div className="relative mx-auto max-w-lg space-y-6 px-4 py-16">
          <IconeQuadro icone={UserRoundCheck} tom="verde" grande />
          <Titulo titulo={`Olá, ${(nome || "").split(" ")[0] || "tudo bem"}.`} destaque="Confirme os seus dados." />
          <p className="text-[15px] text-texto-3">
            {primeira ? "Antes de continuar, confirme o seu nome completo e o seu e-mail."
              : "Já faz 1 mês desde a última confirmação. Revise o seu nome completo e o seu e-mail para continuar."}{" "}
            A confirmação é pedida todo mês, contando a partir de quando você salvar.
          </p>
          <div className="rounded-cartao border border-borda bg-superficie p-5 shadow-flutuante">
            <FormularioDados nome={nome} email={email} />
          </div>
        </div>
      </main>
    </div>
  );
}
