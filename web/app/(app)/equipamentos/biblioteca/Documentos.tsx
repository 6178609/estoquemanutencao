"use client";

import clsx from "clsx";
import { ExternalLink, FileImage, FileText, Link2, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Campo, Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO } from "@/components/ui";
import { LIMITE_DOCUMENTO, LIMITE_MANUAL_GRANDE } from "@/lib/limitesManual";
import { enviarManualEmPartes } from "@/lib/manuais/envioEmPartes";

interface DocTela {
  id: string; titulo: string; tipo: string; tamanho: number; em: string; por: string; url?: string;
}

const tamanho = (b: number) => (b >= 1_000_000 ? `${(b / 1_000_000).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1000))} KB`);
const MB_GRANDE = Math.round(LIMITE_MANUAL_GRANDE / 1_000_000);
const data = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(new Date(iso));

/** Manuais e documentos do ativo: abrir (todos) e pôr/remover (editor). */
export function Documentos({ eq, docs, edita }: { eq: string; docs: DocTela[]; edita: boolean }) {
  const router = useRouter();
  const arquivo = useRef<HTMLInputElement>(null);
  const [modo, setModo] = useState<"arquivo" | "link">("arquivo");
  const [estado, setEstado] = useState<{ enviando: boolean; erro: string; ok: string }>({ enviando: false, erro: "", ok: "" });
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);

  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("eq", eq);
    if (modo === "arquivo" && !(form.get("arquivo") instanceof File && (form.get("arquivo") as File).size)) {
      setEstado({ enviando: false, erro: "Escolha o arquivo (PDF ou imagem).", ok: "" });
      return;
    }
    const f = form.get("arquivo");
    if (modo === "arquivo" && f instanceof File && f.size > LIMITE_MANUAL_GRANDE) {
      setEstado({ enviando: false, erro: `O arquivo passa de ${MB_GRANDE} MB. Para manuais maiores, use “Adicionar link”.`, ok: "" });
      return;
    }
    // acima de 4 MB vai em partes (a Vercel recebe até ~4,5 MB por pedido); o título vazio vira o nome do arquivo
    if (modo === "arquivo" && f instanceof File && f.size > LIMITE_DOCUMENTO) {
      const formulario = e.currentTarget;
      const titulo = String(form.get("titulo") ?? "").trim() || f.name.replace(/\.[^.]+$/, "");
      setEstado({ enviando: true, erro: "", ok: "" });
      try {
        await enviarManualEmPartes(f, [eq], titulo, setProgresso);
      } catch (err) {
        setProgresso(null);
        setEstado({ enviando: false, erro: err instanceof Error ? err.message : "Não foi possível enviar.", ok: "" });
        return;
      }
      setProgresso(null);
      formulario.reset();
      setEstado({ enviando: false, erro: "", ok: "Documento adicionado à biblioteca." });
      router.refresh();
      return;
    }
    if (modo === "arquivo") form.delete("url"); else form.delete("arquivo");
    setEstado({ enviando: true, erro: "", ok: "" });
    const r = await fetch("/api/equipamentos/documento", { method: "POST", body: form }).catch(() => null);
    const j = await r?.json().catch(() => ({})) ?? {};
    if (!r?.ok) {
      setEstado({ enviando: false, erro: j.erro || (r?.status === 413 ? "O arquivo é grande demais para um envio só; tente de novo." : "Não foi possível enviar."), ok: "" });
      return;
    }
    (e.target as HTMLFormElement).reset();
    setEstado({ enviando: false, erro: "", ok: "Documento adicionado à biblioteca." });
    router.refresh();
  };

  const [removendo, setRemovendo] = useState("");
  const remover = async (d: DocTela) => {
    if (!confirm(`Remover "${d.titulo}" da biblioteca?`)) return;
    setRemovendo(d.id);
    const r = await fetch(`/api/equipamentos/documento?${new URLSearchParams({ eq, id: d.id })}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) setEstado({ enviando: false, erro: "Não foi possível remover.", ok: "" });
    else router.refresh();
    setRemovendo("");
  };

  return (
    <div className="space-y-4">
      {docs.length === 0 ? (
        <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">
          Nenhum manual ou documento ainda.{edita ? " Adicione o primeiro abaixo (PDF, foto da plaqueta, desenho, link do fabricante…)." : ""}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((d) => {
            const href = d.tipo === "link" ? d.url! : `/api/equipamentos/documento?${new URLSearchParams({ eq, id: d.id })}`;
            const Icone = d.tipo === "link" ? Link2 : d.tipo.startsWith("image/") ? FileImage : FileText;
            return (
              <li key={d.id} className="flex items-start gap-3 rounded-cartao border border-borda bg-superficie p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--selo-info-fundo)] text-[var(--selo-info-texto)]"><Icone className="size-5" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <a href={href} target="_blank" rel="noopener noreferrer" className="line-clamp-2 font-medium text-texto hover:text-acao">
                    {d.titulo} <ExternalLink className="inline size-3.5 align-[-1px] text-texto-3" aria-hidden /><span className="sr-only"> (abre em nova aba)</span>
                  </a>
                  <div className="mt-1 text-[12px] text-texto-3">
                    {d.tipo === "link" ? "Link" : d.tipo === "application/pdf" ? "PDF" : "Imagem"}{d.tamanho ? ` · ${tamanho(d.tamanho)}` : ""} · {data(d.em)} · {d.por}
                  </div>
                </div>
                {edita && (
                  <button type="button" onClick={() => remover(d)} aria-label={`Remover ${d.titulo}`} disabled={removendo === d.id} aria-busy={removendo === d.id}
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-texto-3 transition hover:bg-superficie-2 hover:text-[var(--selo-critico-texto)]">
                    {removendo === d.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {edita && (
        <form onSubmit={enviar} className="space-y-3 rounded-cartao border border-borda bg-superficie-2 p-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="O que adicionar">
            {(["arquivo", "link"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setModo(m)} aria-pressed={modo === m}
                className={clsx("inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[13.5px]",
                  modo === m ? "border-transparent bg-tinta font-semibold text-tinta-texto" : "border-borda bg-superficie text-texto-2")}>
                {m === "arquivo" ? <Upload className="size-4" /> : <Link2 className="size-4" />}{m === "arquivo" ? "Enviar arquivo" : "Adicionar link"}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Título" name="titulo" placeholder={modo === "arquivo" ? "Ex.: Manual de operação (vazio = nome do arquivo)" : "Ex.: Catálogo de peças do fabricante"} maxLength={120} />
            {modo === "arquivo" ? (
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold text-texto">Arquivo (PDF ou imagem, até {MB_GRANDE} MB)</span>
                <input ref={arquivo} name="arquivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="block h-11 w-full rounded-xl border border-borda bg-superficie px-3 py-2 text-[13.5px] text-texto file:mr-3 file:rounded-lg file:border-0 file:bg-superficie-3 file:px-3 file:text-texto" />
              </label>
            ) : (
              <Campo rotulo="Link" name="url" type="url" required placeholder="https://…" inputMode="url" />
            )}
          </div>
          {progresso && (
            <div className="space-y-1.5">
              <p className="text-[13px] text-texto-2" aria-live="polite">
                {progresso.feitas < progresso.total ? `Enviando parte ${progresso.feitas + 1} de ${progresso.total}` : "Concluindo o envio…"}
              </p>
              <div role="progressbar" aria-label="Envio do documento" aria-valuemin={0} aria-valuemax={progresso.total} aria-valuenow={progresso.feitas}
                aria-valuetext={`${progresso.feitas} de ${progresso.total} partes`} className="h-2 w-full overflow-hidden rounded-full bg-superficie-3">
                <div className="h-full bg-[var(--acao)] transition-[width]" style={{ width: `${(progresso.feitas / progresso.total) * 100}%` }} />
              </div>
            </div>
          )}
          {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
          {estado.ok && <Mensagem tipo="ok">{estado.ok}</Mensagem>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={estado.enviando} aria-busy={estado.enviando} className={BOTAO_PRIMARIO}>
              {estado.enviando ? <LoaderCircle className="size-4 animate-spin" /> : modo === "arquivo" ? <Upload className="size-4" /> : <Link2 className="size-4" />}
              {estado.enviando ? "Enviando…" : "Adicionar à biblioteca"}
            </button>
            <span className="self-center text-[12.5px] text-texto-3">Acima de 4 MB o envio é feito em partes: não feche a página até terminar. Maior que {MB_GRANDE} MB? Use o link.</span>
          </div>
        </form>
      )}
    </div>
  );
}
