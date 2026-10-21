"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Mensagem } from "@/components/Campos";

/** Remove um documento da biblioteca técnica (só para quem pode editar; o servidor confere de novo). */
export function RemoverDocumento({ area, id, titulo }: { area: string; id: string; titulo: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const remover = async () => {
    if (!confirm(`Remover "${titulo}" da biblioteca técnica?`)) return;
    setEnviando(true);
    setErro("");
    const r = await fetch(`/api/suporte/documento?${new URLSearchParams({ area, id })}`, { method: "DELETE" }).catch(() => null);
    setEnviando(false);
    if (!r?.ok) {
      const j = (await r?.json().catch(() => ({}))) ?? {};
      setErro(j.erro || "Não foi possível remover agora. Tente de novo.");
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={remover} disabled={enviando} aria-busy={enviando} aria-label={`Remover ${titulo}`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[13px] text-texto-3 transition hover:bg-superficie-2 hover:text-[var(--selo-critico-texto)] disabled:opacity-60">
        {enviando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
        Remover
      </button>
      {erro && <Mensagem>{erro}</Mensagem>}
    </div>
  );
}
