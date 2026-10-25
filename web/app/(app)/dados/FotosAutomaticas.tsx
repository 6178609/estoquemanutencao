"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";

import { BOTAO_SECUNDARIO, Cartao } from "@/components/ui";
import type { Cobertura, ResumoFotos } from "@/lib/fotos/rodadaFotos";
import { dataHora } from "@/lib/formato";

const pct = (parte: number, total: number) => (total ? Math.round((parte * 100) / total) : 0);

function Linha({ rotulo, c }: { rotulo: string; c: Cobertura }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
        <span className="font-medium text-texto-2">{rotulo}</span>
        <span className="text-texto-3">{c.total} itens</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-superficie-2" role="img"
        aria-label={`${pct(c.exata, c.total)}% com foto exata, ${pct(c.ilustrativa, c.total)}% ilustrativa, ${pct(c.sem, c.total)}% sem foto`}>
        <div className="bg-[var(--selo-bom-texto)]" style={{ width: `${pct(c.exata, c.total)}%` }} />
        <div className="bg-[var(--acao)] opacity-60" style={{ width: `${pct(c.ilustrativa, c.total)}%` }} />
      </div>
      <div className="text-[12.5px] text-texto-3">
        <b className="text-texto-2">{pct(c.exata, c.total)}%</b> com foto exata ({c.exata}) ·{" "}
        <b className="text-texto-2">{pct(c.ilustrativa, c.total)}%</b> ilustrativa ({c.ilustrativa}) ·{" "}
        <b className="text-texto-2">{pct(c.sem, c.total)}%</b> sem foto ({c.sem})
      </div>
    </div>
  );
}

/** Cartão de Fotos automáticas: provedor, última rodada, cobertura em % e o botão "Buscar agora" (editores). */
export function FotosAutomaticas({ resumo, pode }: { resumo: ResumoFotos; pode: boolean }) {
  const [estado, setEstado] = useState<{ enviando: boolean; msg: string; erro: boolean }>({ enviando: false, msg: "", erro: false });

  async function buscar() {
    setEstado({ enviando: true, msg: "", erro: false });
    const r = await fetch("/api/fotos/buscar", { method: "POST" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) return setEstado({ enviando: false, msg: j.erro || "Não foi possível buscar agora.", erro: true });
    if (!j.ligada) return setEstado({ enviando: false, msg: "A busca de fotos está desligada.", erro: true });
    setEstado({ enviando: false, erro: false, msg: `${Number(j.buscados) || 0} buscas: ${Number(j.achados) || 0} fotos achadas (${j.motivo}).` });
  }

  return (
    <Cartao className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-display text-[16px] font-medium">Fotos automáticas</div>
          <p className="mt-1 text-[13px] text-texto-3">
            Todo dia, de madrugada, o site procura foto de fabricante (pela referência) e ilustrativa (pelo tipo, subcategoria
            ou categoria) para os materiais sem foto.{" "}
            {resumo.ligada
              ? <>Busca ligada ({resumo.provedor}).</>
              : <>Busca desligada: configure <code>BUSCA_IMAGENS_PROVEDOR</code> e <code>BUSCA_IMAGENS_CHAVE</code> nas variáveis da Vercel.</>}
          </p>
        </div>
        {pode && resumo.ligada && (
          <button type="button" onClick={() => void buscar()} disabled={estado.enviando} className={BOTAO_SECUNDARIO}>
            {estado.enviando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
            {estado.enviando ? "Buscando…" : "Buscar agora"}
          </button>
        )}
      </div>

      <div className="text-[13px] text-texto-3">
        {resumo.ultima
          ? <>Última rodada: <b className="text-texto-2">{dataHora(resumo.ultima.em)}</b> · {resumo.ultima.buscados} buscas, {resumo.ultima.achados} fotos achadas ({resumo.ultima.motivo}).</>
          : "Nenhuma rodada ainda."}
        {" "}Orçamento de hoje: {resumo.orcamentoHoje.usadas} de {resumo.orcamentoHoje.limite} buscas.
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Linha rotulo="Almoxarifado (MB52)" c={resumo.almoxarifado} />
        <Linha rotulo="Material cadastrado (Sysmat)" c={resumo.cadastrado} />
      </div>

      <p role="status" aria-live="polite" className="text-[13px]">
        {estado.msg && <span className={estado.erro ? "text-[var(--selo-critico-texto)]" : "text-[var(--selo-bom-texto)]"}>{estado.msg}</span>}
      </p>
    </Cartao>
  );
}
