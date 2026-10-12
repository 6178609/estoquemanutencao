"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removerEquipamento } from "./acoes";

/** Remover do cadastro do site (com confirmação). As ordens do SAP não são afetadas. */
export function RemoverEquip({ tag }: { tag: string }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState("");
  const [indo, iniciar] = useTransition();
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] transition";
  if (!confirmar)
    return <button onClick={() => setConfirmar(true)} className={`${btn} border-borda text-texto-2 hover:bg-superficie-2`}><Trash2 className="size-3.5" /> Remover</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[13px]">
      <span className="text-texto-2">Remover <b>{tag}</b> do cadastro? As ordens do SAP não são afetadas.</span>
      <button disabled={indo} onClick={() => iniciar(async () => {
        const r = await removerEquipamento(tag);
        if ("erro" in r) setErro(r.erro); else router.refresh();
      })} className={`${btn} border-transparent bg-perigo-500 font-medium text-white hover:opacity-90`}>
        {indo && <LoaderCircle className="size-3.5 animate-spin" />} Remover
      </button>
      <button onClick={() => setConfirmar(false)} className={`${btn} border-borda hover:bg-superficie-2`}>Cancelar</button>
      {erro && <span role="alert" className="text-perigo-500">{erro}</span>}
    </span>
  );
}
