import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Boxes, Factory, Gauge, ShieldCheck } from "lucide-react";

import { Marca } from "@/components/Marca";
import { modo } from "@/lib/dados/fonte";
import { usuarioAtual } from "@/lib/auth/sessao";
import { FormularioEntrada } from "./FormularioEntrada";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

const DESTAQUES = [
  { icone: Gauge, titulo: "Indicadores WCM", texto: "MTBF, MTTR, backlog e aderência num só lugar." },
  { icone: Boxes, titulo: "Estoque e materiais", texto: "Almoxarifado com a ficha técnica completa do Sysmat." },
  { icone: Factory, titulo: "Gestão de ativos", texto: "Criticidade, saúde e ciclo de vida dos equipamentos." },
  { icone: ShieldCheck, titulo: "Acesso por função", texto: "Cada pessoa vê só o que a função dela libera." },
];

export default async function Entrar() {
  if (await usuarioAtual()) redirect("/");
  const demo = modo() === "demo";
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#06281a] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute inset-0 opacity-90"
          style={{ background: "radial-gradient(60% 50% at 20% 10%, #0e9f46 0%, transparent 60%), radial-gradient(50% 40% at 90% 90%, #0a6ebd 0%, transparent 60%), radial-gradient(40% 30% at 70% 30%, #ffc20e33 0%, transparent 60%)" }} />
        <div aria-hidden className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
        <div className="relative"><Marca claro /></div>
        <div className="relative max-w-xl">
          <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-marca-200">SIM · Manutenção Profissional</p>
          <h1 className="mt-4 font-display text-5xl font-extrabold leading-[1.05] tracking-tight">
            A manutenção da F26, <span className="text-marca-300">em tempo real.</span>
          </h1>
          <div className="mt-10 grid grid-cols-2 gap-4">
            {DESTAQUES.map(({ icone: I, titulo, texto }) => (
              <div key={titulo} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <I className="size-5 text-marca-300" />
                <div className="mt-3 font-display font-semibold">{titulo}</div>
                <div className="mt-1 text-sm text-white/70">{texto}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/50">Alpargatas · Fábrica 26</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden"><Marca /></div>
          <h2 className="mt-8 font-display text-3xl font-bold tracking-tight lg:mt-0">Entrar</h2>
          <p className="mt-2 text-texto-2">Acesse com seu Número Pessoal.</p>
          <div className="mt-8">
            <FormularioEntrada demo={demo} siteAtual={process.env.URL_SITE_ATUAL?.trim() || null} />
          </div>
        </div>
      </section>
    </main>
  );
}
