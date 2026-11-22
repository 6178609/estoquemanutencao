import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { exigir } from "@/lib/auth/sessao";
import { lerArmarios } from "@/lib/ubm/dados";
import { enderecoSite, enderecosQr, qrSvg } from "@/lib/ubm/qr";
import { normalizarIdArmario } from "@/lib/ubm/regras";

import { Imprimir } from "./Imprimir";

export const metadata: Metadata = { title: "Etiquetas QR · UBM" };
export const dynamic = "force-dynamic";

const ETIQUETAS = [
  { qual: "retirada" as const, titulo: "RETIRADA", instrucao: "Vai tirar material do armário? Leia o QR, preencha a ordem, o código e tire a foto." },
  { qual: "solicitacao" as const, titulo: "SOLICITAÇÃO", instrucao: "Item acabou, está no fim ou faltando? Leia o QR e avise o planejamento." },
];

/**
 * Página de impressão das etiquetas (A4): por armário kanban, a etiqueta de RETIRADA e a de SOLICITAÇÃO, cada uma com o
 * QR (SVG gerado no servidor), o nome do armário e a instrução. ?u=<id> imprime só um armário.
 */
export default async function QrUbm(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigir("ubm");
  const u = normalizarIdArmario((await props.searchParams).u);
  const site = await enderecoSite();
  const arms = (await lerArmarios()).filter((a) => a.ativo && (!u || a.id === u));
  const etiquetas = await Promise.all(arms.flatMap((a) => {
    const urls = enderecosQr(site, a.id);
    return ETIQUETAS.map(async (e) => ({ ...e, armario: a, url: urls[e.qual], svg: await qrSvg(urls[e.qual]) }));
  }));
  return (
    <div className="mx-auto w-full max-w-[1000px] space-y-6 px-4 py-6 sm:px-8 print:max-w-none print:p-0">
      <style>{"@page { size: A4; margin: 10mm; } @media print { body { background: #fff !important; } .etiqueta { break-inside: avoid; } }"}</style>
      <div className="nao-imprimir flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em]">Etiquetas QR da UBM</h1>
          <p className="text-[13.5px] text-texto-3">Duas etiquetas por armário kanban: cole a de retirada e a de solicitação na porta. Endereço: {site}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/ubm?visao=Armários" className="inline-flex h-11 items-center gap-2 rounded-xl border border-borda px-4 text-[14px] hover:bg-superficie-2"><ArrowLeft className="size-4" /> Voltar</Link>
          <Imprimir />
        </div>
      </div>
      {!etiquetas.length && <p className="text-[14px] text-texto-3">Nenhum armário ativo{u ? ` com a identificação ${u}` : ""}.</p>}
      <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2 print:gap-[6mm]">
        {etiquetas.map((e) => (
          <section key={`${e.armario.id}-${e.qual}`} aria-label={`Etiqueta ${e.titulo} · ${e.armario.id}`}
            className="etiqueta flex flex-col items-center gap-2 rounded-2xl border-2 border-black bg-white p-5 text-center text-black">
            <div className="font-display text-[26px] font-bold tracking-[0.06em]">{e.titulo}</div>
            <div className="text-[15px] font-semibold">{e.armario.id} · {e.armario.nome}</div>
            {e.armario.local && <div className="text-[13px]">{e.armario.local}</div>}
            <div className="qr-ubm aspect-square w-full max-w-[230px] [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={`QR code de ${e.titulo.toLowerCase()} do ${e.armario.id}`}
              dangerouslySetInnerHTML={{ __html: e.svg }} />
            <p className="max-w-[300px] text-[13px] leading-snug">{e.instrucao}</p>
            <p className="break-all text-[10px] text-neutral-600">{e.url}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
