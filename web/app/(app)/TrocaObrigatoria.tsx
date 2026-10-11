import { KeyRound } from "lucide-react";

import { Marca } from "@/components/Marca";
import { IconeQuadro, Titulo } from "@/components/ui";
import { FormularioSenha } from "./conta/FormularioSenha";

/** Primeiro acesso ou senha redefinida pelo administrador: a pessoa define a senha dela antes de usar o site. */
export function TrocaObrigatoria({ nome, sair }: { nome: string; sair: () => Promise<void> }) {
  return (
    <div className="min-h-dvh bg-fundo">
      <header className="border-b border-borda">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 sm:px-8">
          <Marca />
          <form action={sair}><button className="text-[14px] text-texto-3 transition hover:text-texto">Sair</button></form>
        </div>
      </header>
      <main className="relative">
        <div aria-hidden className="pontos absolute inset-0" />
        <div className="relative mx-auto max-w-lg space-y-6 px-4 py-16">
          <IconeQuadro icone={KeyRound} tom="verde" grande />
          <Titulo titulo={`Olá, ${nome.split(" ")[0]}.`} destaque="Defina a sua senha." />
          <p className="text-[15px] text-texto-3">A senha que você recebeu é provisória. Escolha uma senha pessoal para continuar.</p>
          <div className="rounded-cartao border border-borda bg-superficie p-5 shadow-flutuante">
            <FormularioSenha pedirAtual={false} />
          </div>
        </div>
      </main>
    </div>
  );
}
