import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Boxes, Factory, Gauge, ShieldCheck } from "lucide-react";

import { Marca } from "@/components/Marca";
import { Objeto } from "@/components/Objeto";
import { IconeQuadro, Pilula, Titulo } from "@/components/ui";
import { modo } from "@/lib/dados/fonte";
import { usuarioAtual } from "@/lib/auth/sessao";
import { codigoConfiguracao, precisaPrimeiroAdmin } from "@/lib/auth/usuarios";
import { AbasEntrada } from "./AbasEntrada";
import { FormularioPrimeiroAdmin } from "./FormularioPrimeiroAdmin";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

const DESTAQUES = [
  { icone: Gauge, tom: "verde" as const, titulo: "Indicadores WCM", texto: "MTBF, MTTR, backlog e aderência num só lugar, sempre do export mais novo do SAP." },
  { icone: Boxes, tom: "azul" as const, titulo: "Estoque e materiais", texto: "O almoxarifado com a Descr Completa do Sysmat de cada item, sem limite de busca." },
  { icone: Factory, tom: "laranja" as const, titulo: "Gestão de ativos", texto: "Criticidade, saúde e ciclo de vida dos equipamentos da fábrica." },
  { icone: ShieldCheck, tom: "vermelho" as const, titulo: "Acesso por função", texto: "Líder, analista, manutentor e terceiros: cada um vê só o que a função libera." },
];

export default async function Entrar() {
  if (await usuarioAtual()) redirect("/");
  const demo = modo() === "demo";
  let primeiro = false, erroFonte = "";
  try {
    primeiro = !demo && (await precisaPrimeiroAdmin());
  } catch (e) {
    erroFonte = (e as Error).message;
  }
  return (
    <div className="min-h-dvh bg-fundo">
      <header className="border-b border-borda">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 sm:px-8">
          <Marca />
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div aria-hidden className="pontos absolute inset-0" />
          <div className="relative mx-auto grid max-w-[1240px] items-center gap-10 px-4 py-14 sm:px-8 lg:grid-cols-[1fr_minmax(0,460px)] lg:py-20">
            <div className="max-w-[560px] space-y-6">
              <Pilula>SIM · Manutenção Profissional · F26</Pilula>
              <Titulo titulo="A manutenção da F26," destaque="em tempo real." className="lg:!text-[56px]" />
              <p className="text-[15.5px] leading-relaxed text-texto-3">
                Estoque, ativos, ordens e indicadores num lugar só, lendo os exports do SAP assim que chegam. Entre com o seu Número Pessoal (NP) e a sua senha.
              </p>
              <div className={`${demo ? "max-w-sm" : "max-w-md"} rounded-cartao border border-borda bg-superficie p-5 shadow-flutuante`}>
                {erroFonte && (
                  <p role="alert" className="mb-4 rounded-xl border border-perigo-500/30 bg-perigo-500/10 px-3.5 py-2.5 text-sm text-perigo-500">
                    Não consegui ler o repositório de dados: {erroFonte} Confira DADOS_GH_REPO e DADOS_GH_TOKEN na Vercel.
                  </p>
                )}
                {primeiro ? <FormularioPrimeiroAdmin pedeCodigo={!!codigoConfiguracao()} />
                  : <AbasEntrada demo={demo} />}
              </div>
            </div>
            <div className="hidden justify-center lg:flex"><Objeto tamanho={460} /></div>
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DESTAQUES.map((d) => (
              <div key={d.titulo} className="rounded-cartao border border-borda bg-superficie-2 p-6">
                <IconeQuadro icone={d.icone} tom={d.tom} />
                <div className="mt-5 font-display text-[15px] font-medium">{d.titulo}</div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-texto-3">{d.texto}</p>
              </div>
            ))}
          </div>
          <p className="mt-12 text-center text-[12.5px] text-texto-4">Alpargatas · Fábrica 26 · Central de Manutenção</p>
        </section>
      </main>
    </div>
  );
}
