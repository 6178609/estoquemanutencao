"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";

/**
 * Quando uma tela falha (repositório de dados fora do ar, demora, erro inesperado): mensagem clara e "Tentar de novo",
 * que busca a página outra vez no servidor — em vez da tela crua de erro do Next.
 */
export default function ErroDaTela({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [tentando, setTentando] = useState(false);
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div role="alert" className="mx-auto w-full max-w-[1240px] px-4 py-16 sm:px-8">
      <div className="mx-auto max-w-lg rounded-cartao border border-borda bg-superficie p-6 text-center">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-superficie-2">
          <AlertTriangle className="size-5 text-alp-laranja" strokeWidth={1.75} />
        </div>
        <h1 className="font-display text-[20px] font-semibold tracking-tight">Esta tela não carregou</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-texto-3">
          Pode ser uma instabilidade momentânea na leitura dos dados. Tente de novo; se continuar, avise o administrador
          {error.digest ? <> com o código <span className="font-mono">{error.digest}</span></> : null}.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" className={BOTAO_PRIMARIO} disabled={tentando}
            onClick={() => { setTentando(true); retry(); setTimeout(() => setTentando(false), 4000); }}>
            <RotateCcw className={tentando ? "size-4 animate-spin" : "size-4"} /> {tentando ? "Tentando…" : "Tentar de novo"}
          </button>
          <Link prefetch={false} href="/" className={BOTAO_SECUNDARIO}>Ir para o início</Link>
        </div>
      </div>
    </div>
  );
}
