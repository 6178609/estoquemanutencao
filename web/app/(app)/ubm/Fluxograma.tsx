import { ArrowDown, ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";

/**
 * "Como funciona": o fluxo do processo com o armário kanban, desenhado em HTML/CSS com as cores do site — início e fim
 * em amarelo-claro, ações em azul-claro, decisões em losango verde-claro. Vertical (cabe no celular); nas decisões, os
 * dois caminhos lado a lado. Os passos que têm tela levam a ela (QR de solicitação, envio da IW13, validação do líder,
 * lista de reposição). A retirada não tem mais QR: o líder confirma pela IW13 (pedido do usuário, 22/11/2026).
 */
type Tipo = "limite" | "acao" | "decisao";
const COR: Record<Tipo, { fundo: string; texto: string }> = {
  limite: { fundo: "var(--selo-atencao-fundo)", texto: "var(--selo-atencao-texto)" },
  acao: { fundo: "var(--selo-info-fundo)", texto: "var(--selo-info-texto)" },
  decisao: { fundo: "var(--selo-bom-fundo)", texto: "var(--selo-bom-texto)" },
};

function No({ tipo, children, href, dica }: { tipo: Tipo; children: React.ReactNode; href?: string; dica?: string }) {
  const c = COR[tipo];
  if (tipo === "decisao") {
    return (
      <div className="relative mx-auto grid h-[112px] w-[220px] place-items-center" role="group" aria-label={`Decisão: ${String(children)}`}>
        <svg aria-hidden viewBox="0 0 220 112" className="absolute inset-0 size-full">
          <polygon points="110,2 218,56 110,110 2,56" strokeOpacity={0.45} strokeWidth={1.5} style={{ fill: c.fundo, stroke: c.texto }} />
        </svg>
        <span className="relative max-w-[130px] text-center text-[13px] font-semibold leading-tight" style={{ color: c.texto }}>{children}</span>
      </div>
    );
  }
  const caixa = (
    <span className={`flex min-h-12 w-full max-w-[280px] items-center justify-center gap-1.5 px-4 py-2.5 text-center text-[13.5px] font-medium leading-snug ${tipo === "limite" ? "rounded-full" : "rounded-xl"}`}
      style={{ background: c.fundo, color: c.texto, boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${c.texto} 35%, transparent)` }}>
      {children}{href && <ExternalLink className="size-3.5 shrink-0" aria-hidden />}
    </span>
  );
  return (
    <div className="flex flex-col items-center gap-1">
      {href ? <Link href={href} className="flex w-full justify-center rounded-xl underline-offset-2 hover:underline">{caixa}</Link> : caixa}
      {dica && <span className="max-w-[280px] text-center text-[12px] text-texto-3">{dica}</span>}
    </div>
  );
}

const Seta = ({ rotulo }: { rotulo?: string }) => (
  <div className="flex flex-col items-center py-1 text-texto-3" aria-hidden={!rotulo}>
    {rotulo && <span className="text-[12px] font-semibold uppercase tracking-wide">{rotulo}</span>}
    <ArrowDown className="size-5" />
  </div>
);

export function Fluxograma() {
  return (
    <section aria-label="Fluxo do processo com o armário kanban" className="rounded-cartao border border-borda bg-superficie p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap gap-3 text-[12px] text-texto-3">
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full" style={{ background: COR.limite.fundo, boxShadow: `inset 0 0 0 1px ${COR.limite.texto}` }} /> Início e fim</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded" style={{ background: COR.acao.fundo, boxShadow: `inset 0 0 0 1px ${COR.acao.texto}` }} /> Ação</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rotate-45" style={{ background: COR.decisao.fundo, boxShadow: `inset 0 0 0 1px ${COR.decisao.texto}` }} /> Decisão</span>
        <span className="inline-flex items-center gap-1.5"><ExternalLink className="size-3" /> Abre a tela do passo</span>
      </div>
      <ol className="mx-auto flex max-w-[640px] flex-col items-stretch">
        <li><No tipo="limite">Falha no equipamento</No><Seta /></li>
        <li><No tipo="acao">Abertura de nota</No><Seta /></li>
        <li><No tipo="acao">Aciona o mantenedor</No><Seta /></li>
        <li>
          <No tipo="decisao">Precisa de material?</No>
          <div className="mt-1 flex items-center justify-center gap-2 text-[12.5px] text-texto-3">
            <span className="font-semibold uppercase">Não</span><ArrowRight className="size-4" aria-hidden /> vai direto para <b className="text-texto-2">Corrigir a anomalia</b>
          </div>
          <Seta rotulo="Sim" />
        </li>
        <li>
          <No tipo="decisao">Tem no armário kanban?</No>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center">
              <Seta rotulo="Não" />
              <No tipo="acao" href="/ubm/solicitacao" dica="QR de SOLICITAÇÃO do armário">Solicitar ao almoxarifado</No>
            </div>
            <div className="flex flex-col items-center">
              <Seta rotulo="Sim" />
              <No tipo="acao">Líder retira do armário e lança na ordem pelo SAP Mobile</No>
            </div>
          </div>
          <Seta />
        </li>
        <li><No tipo="acao">Corrige a anomalia</No><Seta /></li>
        <li><No tipo="acao">Libera o equipamento</No><Seta /></li>
        <li><No tipo="acao" href="/dados" dica="Envio da IW13 em Fontes de dados">A IW13 traz o consumo da ordem de quebra</No><Seta /></li>
        <li><No tipo="acao" href="/ubm?visao=Validação do líder" dica="Sub-aba Validação do líder">Líder confirma no site: “Veio da UBM” ou “Veio do Almox”</No><Seta /></li>
        <li>
          <No tipo="decisao">Veio da UBM?</No>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center"><Seta rotulo="Não" /><No tipo="acao" dica="Entra na análise (UBM sem saldo ou não usada)">Só registra</No><Seta /><No tipo="limite">Fim</No></div>
            <div className="flex flex-col items-center">
              <Seta rotulo="Sim" />
              <No tipo="acao">Baixa do saldo do armário</No>
              <Seta />
              <No tipo="acao" href="/ubm?visao=Visão geral#reposicao" dica="Lista de reposição (padrão − saldo)">Repõe o armário</No>
              <Seta />
              <No tipo="limite">Fim</No>
            </div>
          </div>
        </li>
      </ol>
    </section>
  );
}
