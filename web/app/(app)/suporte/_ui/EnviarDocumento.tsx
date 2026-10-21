"use client";

import clsx from "clsx";
import { Link2, LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Campo, Mensagem, Seletor } from "@/components/Campos";
import { BOTAO_PRIMARIO } from "@/components/ui";

/** Envio à biblioteca técnica (só editor ou administrador vê este formulário): arquivo PDF/imagem ou link. */
export function EnviarDocumento({ areas, areaInicial }: { areas: { id: string; titulo: string }[]; areaInicial?: string }) {
  const router = useRouter();
  const [modo, setModo] = useState<"arquivo" | "link">("arquivo");
  const [estado, setEstado] = useState<{ enviando: boolean; erro: string; ok: string }>({ enviando: false, erro: "", ok: "" });
  const opcoes = Object.fromEntries(areas.map((a) => [a.id, a.titulo]));

  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const arq = form.get("arquivo");
    if (modo === "arquivo" && !(arq instanceof File && arq.size)) {
      setEstado({ enviando: false, erro: "Escolha o arquivo (PDF ou imagem).", ok: "" });
      return;
    }
    if (modo === "arquivo" && (arq as File).size > 4_000_000) {
      setEstado({ enviando: false, erro: "O arquivo passou de 4 MB. Para documentos maiores, use “Adicionar link”.", ok: "" });
      return;
    }
    if (modo === "arquivo") form.delete("url"); else form.delete("arquivo");
    setEstado({ enviando: true, erro: "", ok: "" });
    const r = await fetch("/api/suporte/documento", { method: "POST", body: form }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) ?? {};
    if (!r?.ok) {
      setEstado({ enviando: false, erro: j.erro || (r?.status === 413 ? "O arquivo passou de 4 MB. Para documentos maiores, use “Adicionar link”." : "Não foi possível enviar."), ok: "" });
      return;
    }
    e.currentTarget.reset();
    setEstado({ enviando: false, erro: "", ok: "Documento adicionado à biblioteca." });
    router.refresh();
  };

  return (
    <form onSubmit={enviar} className="space-y-4 rounded-cartao border border-borda bg-superficie-2 p-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="O que enviar">
        {(["arquivo", "link"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setModo(m)} aria-pressed={modo === m}
            className={clsx("inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[13.5px]",
              modo === m ? "border-transparent bg-tinta font-semibold text-tinta-texto" : "border-borda bg-superficie text-texto-2")}>
            {m === "arquivo" ? <Upload className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
            {m === "arquivo" ? "Enviar arquivo" : "Adicionar link"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Seletor rotulo="Área" name="area" opcoes={opcoes} defaultValue={areaInicial ?? areas[0]?.id} required />
        <Campo rotulo="Título" name="titulo" maxLength={120}
          placeholder={modo === "arquivo" ? "Vazio = nome do arquivo" : "Ex.: Tabela de lubrificantes do fabricante"} />
        {modo === "arquivo" ? (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-texto">Arquivo (PDF ou imagem, até 4 MB)</span>
            <input name="arquivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
              className="block h-11 w-full rounded-xl border border-borda bg-superficie px-3 py-2 text-[13.5px] text-texto file:mr-3 file:rounded-lg file:border-0 file:bg-superficie-3 file:px-3 file:text-texto" />
          </label>
        ) : (
          <Campo rotulo="Link" name="url" type="url" required placeholder="https://…" inputMode="url" />
        )}
      </div>
      {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
      {estado.ok && <Mensagem tipo="ok">{estado.ok}</Mensagem>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={estado.enviando} aria-busy={estado.enviando} className={BOTAO_PRIMARIO}>
          {estado.enviando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : modo === "arquivo" ? <Upload className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
          {estado.enviando ? "Enviando…" : "Adicionar à biblioteca"}
        </button>
        <span className="text-[12.5px] text-texto-3">Só guarde documentos que a empresa pode usar. Manual maior que 4 MB? Use o link.</span>
      </div>
    </form>
  );
}
