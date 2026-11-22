import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Factory, Gauge, ShieldCheck } from "lucide-react";

import { LogoSim } from "@/components/Marca";
import { ObjetoSim } from "@/components/ObjetoSim";
import { AstronautaSim } from "@/components/AstronautaSim";
import { IntroFoguete } from "@/components/IntroFoguete";
import { OrbitasSim } from "@/components/OrbitasSim";
import { IconeQuadro, Pilula, Titulo } from "@/components/ui";
import { modo } from "@/lib/dados/fonte";
import { INATIVIDADE_MIN, MOTIVO } from "@/lib/auth/inatividade";
import { usuarioAtual } from "@/lib/auth/sessao";
import { caminhoDeVolta, PARAM_VOLTA } from "@/lib/auth/volta";
import { codigoConfiguracao, precisaPrimeiroAdmin } from "@/lib/auth/usuarios";
import { AbasEntrada } from "./AbasEntrada";
import { FormularioPrimeiroAdmin } from "./FormularioPrimeiroAdmin";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

const DESTAQUES = [
  { icone: Gauge, tom: "verde" as const, titulo: "Indicadores WCM", texto: "MTBF, MTTR, backlog e aderência num só lugar, sempre do export mais novo do SAP." },
  { icone: Boxes, tom: "azul" as const, titulo: "Estoque e materiais", texto: "O almoxarifado com a Descr Completa do Sysmat de cada item, sem limite de busca." },
  { icone: Factory, tom: "laranja" as const, titulo: "Gestão de ativos", texto: "Criticidade, saúde e ciclo de vida dos equipamentos da fábrica." },
  { icone: ShieldCheck, tom: "vermelho" as const, titulo: "Acesso por função", texto: "Cada pessoa vê só as abas liberadas para ela, conforme a função." },
];

export default async function Entrar(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  const volta = caminhoDeVolta(sp[PARAM_VOLTA]);
  if (await usuarioAtual()) redirect(volta || "/");
  const inativo = sp.motivo === MOTIVO;
  const demo = modo() === "demo";
  let primeiro = false, erroFonte = "";
  try {
    primeiro = !demo && (await precisaPrimeiroAdmin());
  } catch (e) {
    erroFonte = (e as Error).message;
  }
  return (
    // computador: tudo numa tela só (em tela baixa saem os destaques e o parágrafo); o formulário nunca é cortado
    <div className="flex min-h-dvh flex-col overflow-clip bg-fundo">
      <IntroFoguete />
      <header className="shrink-0 border-b border-borda">
        <div className="mx-auto flex h-12 max-w-[1240px] items-center gap-3 px-4 sm:px-8">
          <span className="font-display text-[15px] font-medium tracking-[-0.02em] text-texto">Central de Manutenção</span>
          <span className="text-[12px] text-texto-3">PCM · F26</span>
          {/* no computador o rodapé fica aqui, para a tela caber sem rolagem */}
          <span className="ml-auto hidden text-[12px] text-texto-4 lg:inline">
            Alpargatas · Fábrica 26 · <Link href="/privacidade" className="underline hover:text-texto-2">Privacidade</Link>
          </span>
        </div>
      </header>

      <main id="conteudo" tabIndex={-1} className="flex min-h-0 flex-1 flex-col focus:outline-none">
        <section className="relative flex-1 overflow-clip">
          <div aria-hidden className="pontos absolute inset-0" />
          <div className="relative mx-auto grid h-full max-w-[1240px] items-center gap-8 px-4 py-10 sm:px-8 lg:grid-cols-[1fr_minmax(0,440px)] lg:py-4 [@media(min-width:1024px)_and_(max-height:680px)]:py-1">
            <div className="max-w-[560px] space-y-4 lg:space-y-3">
              <div className="lg:hidden"><LogoSim largura={180} /></div>
              <div className="[@media(min-width:1024px)_and_(max-height:740px)]:hidden"><Pilula>SIM · Manutenção Profissional · F26</Pilula></div>
              <Titulo titulo="A manutenção da F26," destaque="em tempo real." className="lg:!text-[42px] lg:!leading-[1.05] [@media(min-width:1024px)_and_(max-height:740px)]:!text-[34px] [@media(min-width:1024px)_and_(max-height:680px)]:!text-[26px]" />
              <p className="text-[15px] leading-relaxed text-texto-3 [@media(min-width:1024px)_and_(max-height:860px)]:hidden">
                Estoque, ativos, ordens e indicadores num lugar só, lendo os exports do SAP assim que chegam. Entre com o seu Número Pessoal (NP) e a sua senha.
              </p>
              <div className={`${demo ? "max-w-sm" : "max-w-md"} rounded-cartao border border-borda bg-superficie p-5 shadow-flutuante lg:p-4`}>
                {inativo && (
                  <p role="status" className="mb-4 rounded-xl border border-borda bg-superficie-2 px-3.5 py-2.5 text-sm text-texto-2">
                    Você saiu por inatividade ({INATIVIDADE_MIN} minutos sem usar o site). Entre de novo para continuar.
                  </p>
                )}
                {erroFonte && (
                  <p role="alert" className="mb-4 rounded-xl border border-perigo-500/30 bg-perigo-500/10 px-3.5 py-2.5 text-sm text-perigo-500">
                    Não foi possível ler o repositório de dados: {erroFonte} Confira DADOS_GH_REPO e DADOS_GH_TOKEN na Vercel.
                  </p>
                )}
                {primeiro ? <FormularioPrimeiroAdmin pedeCodigo={!!codigoConfiguracao()} />
                  : <AbasEntrada demo={demo} volta={volta} />}
              </div>
            </div>
            <div className="relative hidden justify-center lg:flex">
              <div className="orbitas-entram absolute inset-0"><OrbitasSim /></div>
              <span aria-hidden className="onda-abertura pointer-events-none absolute left-1/2 top-1/2 size-[440px] rounded-full border-2 border-[var(--color-marca-300)] shadow-[0_0_60px_rgb(0_156_72/0.25)]" />
              <div className="logo-abre relative"><div className="logo-pulso"><ObjetoSim tamanho={440} /></div></div>
            </div>
          </div>
        </section>

        <section className="shrink-0">
          <div className="mx-auto max-w-[1240px] px-4 sm:px-8 [@media(min-width:1024px)_and_(max-height:880px)]:hidden">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {DESTAQUES.map((d) => (
                <div key={d.titulo} className="flex items-center gap-3 rounded-cartao border border-borda bg-superficie-2 p-3.5">
                  <IconeQuadro icone={d.icone} tom={d.tom} />
                  <div className="min-w-0">
                    <div className="font-display text-[14px] font-medium">{d.titulo}</div>
                    <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-texto-3 [@media(min-width:1024px)_and_(max-height:960px)]:hidden">{d.texto}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden lg:block"><AstronautaSim /></div>
          <p className="pb-3 pt-6 text-center text-[12px] text-texto-4 lg:hidden">
            Alpargatas · Fábrica 26 · Central de Manutenção · <Link href="/privacidade" className="underline hover:text-texto-2">Privacidade</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
