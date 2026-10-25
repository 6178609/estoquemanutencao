"use client";

import { ImagePlus, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { BOTAO_SECUNDARIO, Cartao } from "@/components/ui";

/** Importa o arquivo de fotos sugeridas (busca na web): as sugestões aparecem no detalhe de cada material do Estoque. */
export function ImportarSugestoes() {
  const [estado, setEstado] = useState<{ enviando: boolean; ok: string; erro: string }>({ enviando: false, ok: "", erro: "" });

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    setEstado({ enviando: true, ok: "", erro: "" });
    const corpo = new FormData();
    corpo.set("arquivo", arquivo);
    const r = await fetch("/api/estoque/foto/sugestao/importar", { method: "POST", body: corpo }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) return setEstado({ enviando: false, ok: "", erro: j.erro || "Não foi possível importar." });
    const n = Number(j.materiais) || 0;
    setEstado({ enviando: false, erro: "", ok: n ? `${n} material(is) com fotos sugeridas. Confira e aprove no Estoque, no detalhe de cada material.` : "Nenhuma sugestão aproveitável no arquivo." });
  }

  return (
    <Cartao className="p-5">
      <div className="font-display text-[16px] font-medium">Fotos sugeridas dos materiais</div>
      <p className="mt-1 text-[13px] text-texto-3">
        Importe o arquivo JSON da busca de fotos de catálogo. Nada vira foto sozinho: cada sugestão aparece no detalhe do
        material, no Estoque, para alguém conferir e aprovar.
      </p>
      <label className={`${BOTAO_SECUNDARIO} mt-3 cursor-pointer`}>
        {estado.enviando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
        {estado.enviando ? "Importando…" : "Importar sugestões (JSON)"}
        <input type="file" accept=".json,application/json" className="sr-only" disabled={estado.enviando}
          onChange={(e) => { void enviar(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <p role="status" aria-live="polite" className="mt-2 text-[13px]">
        {estado.ok && <span className="text-[var(--st-bom)]">{estado.ok}</span>}
        {estado.erro && <span className="text-[var(--st-critico)]">{estado.erro}</span>}
      </p>
    </Cartao>
  );
}
