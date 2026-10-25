"use client";

import { ImagePlus, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { BOTAO_SECUNDARIO, Cartao } from "@/components/ui";

/** Importa o arquivo de fotos (por tipo de material e/ou por código): as fotos entram direto nos materiais do Estoque. */
export function ImportarFotos() {
  const [estado, setEstado] = useState<{ enviando: boolean; ok: string; erro: string }>({ enviando: false, ok: "", erro: "" });

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return;
    setEstado({ enviando: true, ok: "", erro: "" });
    const corpo = new FormData();
    corpo.set("arquivo", arquivo);
    const r = await fetch("/api/estoque/foto/importar", { method: "POST", body: corpo }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) return setEstado({ enviando: false, ok: "", erro: j.erro || "Não foi possível importar." });
    setEstado({ enviando: false, erro: "", ok: `${Number(j.tipos) || 0} tipos e ${Number(j.materiais) || 0} materiais com foto.` });
  }

  return (
    <Cartao className="p-5">
      <div className="font-display text-[16px] font-medium">Fotos dos materiais</div>
      <p className="mt-1 text-[13px] text-texto-3">
        Importe o arquivo JSON de fotos. Ele pode trazer <code>&quot;tipos&quot;</code> (foto ilustrativa por tipo de material) e/ou{" "}
        <code>&quot;materiais&quot;</code> (foto do fabricante, por código). As fotos entram direto no Estoque; a foto própria,
        quando existir, continua na frente.
      </p>
      <label className={`${BOTAO_SECUNDARIO} mt-3 cursor-pointer`}>
        {estado.enviando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
        {estado.enviando ? "Importando…" : "Importar fotos (JSON)"}
        <input type="file" accept=".json,application/json" className="sr-only" disabled={estado.enviando}
          onChange={(e) => { void enviar(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <p role="status" aria-live="polite" className="mt-2 text-[13px]">
        {estado.ok && <span className="text-[var(--selo-bom-texto)]">{estado.ok}</span>}
        {estado.erro && <span className="text-[var(--selo-critico-texto)]">{estado.erro}</span>}
      </p>
    </Cartao>
  );
}
