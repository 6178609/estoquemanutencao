"use client";

import { LoaderCircle, Pencil, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { salvarComentarioRoadmap } from "./acoes";

const MAX = 500;

/**
 * Comentário de uma máquina do Roadmap: mostra o que vale (manual ou da planilha) e, para quem edita, o lápis para
 * escrever à mão e o "voltar ao da planilha". O manual vale até alguém voltar; o da planilha aparece embaixo para comparar.
 */
export function ComentarioEditavel({ fabrica, maquina, comentario, planilha, manual, edita }: {
  fabrica: string; maquina: string; comentario: string; planilha: string; manual: { por: string; em: string } | null; edita: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(comentario);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();
  const salvar = (valor: string | null) => iniciar(async () => {
    setErro("");
    const r = await salvarComentarioRoadmap(fabrica, maquina, valor);
    if ("erro" in r) setErro(r.erro);
    else { setEditando(false); router.refresh(); }
  });
  const quando = manual?.em ? new Date(manual.em).toLocaleDateString("pt-BR") : "";

  if (editando) {
    return (
      <form className="space-y-1.5" onSubmit={(e) => { e.preventDefault(); salvar(texto); }}>
        <label className="sr-only" htmlFor={`com-${fabrica}-${maquina}`}>Comentário de {maquina}</label>
        <textarea id={`com-${fabrica}-${maquina}`} value={texto} maxLength={MAX} rows={2} autoFocus
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setEditando(false); setTexto(comentario); } }}
          className="w-full min-w-56 rounded-lg border border-borda-forte bg-superficie px-2 py-1.5 text-[12.5px] focus:border-marca-500 focus:outline-none" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pendente} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-marca-600 px-2.5 text-[12px] font-medium text-white hover:bg-marca-700 disabled:opacity-60">
            {pendente && <LoaderCircle className="size-3.5 animate-spin" />} Salvar
          </button>
          <button type="button" disabled={pendente} onClick={() => { setEditando(false); setTexto(comentario); }}
            className="min-h-8 rounded-lg px-2 text-[12px] text-texto-3 hover:text-texto">Cancelar</button>
          <span className="text-[11px] text-texto-4">{texto.length}/{MAX}</span>
        </div>
        {erro && <p className="text-[11.5px] text-[var(--selo-critico-texto)]">{erro}</p>}
      </form>
    );
  }

  return (
    <div className="group space-y-0.5">
      <div className="flex items-start gap-1.5">
        <span className="flex-1">{comentario || <span className="text-texto-4">—</span>}</span>
        {edita && (
          <button type="button" onClick={() => { setTexto(comentario); setEditando(true); }} aria-label={`Editar o comentário de ${maquina}`}
            className="grid size-7 shrink-0 place-items-center rounded-md text-texto-3 hover:bg-superficie-2 hover:text-texto">
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
      {manual && (
        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-texto-3">
          <span>Manual{manual.por ? ` · ${manual.por}` : ""}{quando ? ` · ${quando}` : ""}</span>
          {planilha && planilha !== comentario && <span className="text-texto-4">Na planilha: “{planilha}”</span>}
          {edita && (
            <button type="button" disabled={pendente} onClick={() => salvar(null)}
              className="inline-flex items-center gap-1 font-medium text-alp-azul hover:underline disabled:opacity-60">
              {pendente ? <LoaderCircle className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} voltar ao da planilha
            </button>
          )}
        </div>
      )}
      {erro && <p className="text-[11.5px] text-[var(--selo-critico-texto)]">{erro}</p>}
    </div>
  );
}
