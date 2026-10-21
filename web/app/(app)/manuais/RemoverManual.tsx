"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Tira um manual de um equipamento (pede confirmação). O arquivo do manual vale para os outros equipamentos também. */
export function RemoverManual({ eq, id, titulo }: { eq: string; id: string; titulo: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const remover = async () => {
    if (!confirm(`Remover "${titulo}" deste equipamento?`)) return;
    setOcupado(true);
    setErro("");
    const r = await fetch(`/api/equipamentos/documento?${new URLSearchParams({ eq, id })}`, { method: "DELETE" }).catch(() => null);
    const j = await r?.json().catch(() => ({})) ?? {};
    if (!r?.ok) setErro(j.erro || "Não foi possível remover.");
    else router.refresh();
    setOcupado(false);
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={remover} disabled={ocupado} aria-busy={ocupado} aria-label={`Remover ${titulo} de ${eq}`}
        className="grid size-11 place-items-center rounded-lg text-texto-3 transition hover:bg-superficie-2 hover:text-[var(--selo-critico-texto)]">
        {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </button>
      {erro && <span role="alert" className="max-w-[220px] text-[12px] font-medium text-[var(--selo-critico-texto)]">{erro}</span>}
    </span>
  );
}
