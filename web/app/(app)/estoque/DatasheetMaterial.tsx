"use client";

import { ExternalLink, FileText, LoaderCircle, Search, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BOTAO_COMPACTO } from "@/components/ui";

interface Ds { id: string; titulo: string; tipo: string; url?: string; em: string; por: string }

const dataBr = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(+d) ? "" : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" }).format(d);
};

/**
 * Datasheet do fabricante no detalhamento do material: os links e PDFs da biblioteca do material (busca automática
 * ou editor), o atalho de pesquisa (fabricante + referência + datasheet) e, para o editor, pôr link ou PDF e remover.
 */
export function DatasheetMaterial({ material, fabricanteRef, descricao, edita }: {
  material: string; fabricanteRef?: string; descricao: string; edita: boolean;
}) {
  const codigo = material.trim().replace(/^0+(?=\d)/, "");
  const [lista, setLista] = useState<Ds[] | null>(null);
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const [gravando, setGravando] = useState(false);
  const [url, setUrl] = useState("");
  const arquivo = useRef<HTMLInputElement>(null);

  const buscar = useCallback(() => fetch(`/api/estoque/datasheet?m=${encodeURIComponent(codigo)}`, { cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json()).datasheets as Ds[]) : []), () => [] as Ds[]), [codigo]);
  const carregar = useCallback(async () => setLista(await buscar()), [buscar]);
  // o componente é montado com key = código do material: trocar de material começa do zero
  useEffect(() => {
    let vivo = true;
    buscar().then((l) => { if (vivo) setLista(l); });
    return () => { vivo = false; };
  }, [buscar]);

  const enviar = async (corpo: FormData, ok: string) => {
    setGravando(true); setMsg(null);
    try {
      const r = await fetch("/api/estoque/datasheet", { method: "POST", body: corpo });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || "Não foi possível gravar; tente de novo.");
      setMsg({ erro: false, texto: ok }); setUrl(""); if (arquivo.current) arquivo.current.value = "";
      await carregar();
    } catch (e) {
      setMsg({ erro: true, texto: (e as Error).message });
      if (arquivo.current) arquivo.current.value = ""; // o mesmo arquivo pode ser escolhido de novo
    } finally {
      setGravando(false);
    }
  };
  const porLink = () => {
    const f = new FormData(); f.set("material", codigo); f.set("url", url.trim()); f.set("titulo", "Datasheet (editor)");
    void enviar(f, "Link do datasheet gravado.");
  };
  const porPdf = (file: File) => {
    const f = new FormData(); f.set("material", codigo); f.set("arquivo", file); f.set("titulo", file.name.replace(/\.pdf$/i, ""));
    void enviar(f, "PDF do datasheet gravado.");
  };
  const remover = async (d: Ds) => {
    if (!confirm(`Remover “${d.titulo}” do material ${codigo}?`)) return;
    setGravando(true); setMsg(null);
    try {
      const r = await fetch(`/api/estoque/datasheet?m=${encodeURIComponent(codigo)}&id=${encodeURIComponent(d.id)}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || "Não foi possível remover; tente de novo.");
      await carregar();
    } catch (e) {
      setMsg({ erro: true, texto: (e as Error).message });
    } finally {
      setGravando(false);
    }
  };

  const termo = (fabricanteRef?.split("|")[0]?.trim() || descricao).trim();
  const pesquisa = `https://www.google.com/search?q=${encodeURIComponent(`${termo} datasheet`)}`;

  return (
    <section aria-labelledby={`ds-${codigo}`}>
      <h3 id={`ds-${codigo}`} className="mb-3 font-display font-bold">Datasheet do fabricante</h3>
      {lista === null ? (
        <p className="flex items-center gap-2 text-sm text-texto-3"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Carregando…</p>
      ) : lista.length ? (
        <ul className="grid gap-2">
          {lista.map((d) => {
            const href = d.tipo === "link" ? d.url! : `/api/estoque/datasheet?m=${encodeURIComponent(codigo)}&id=${encodeURIComponent(d.id)}`;
            return (
              <li key={d.id} className="flex items-start gap-2 rounded-xl border border-borda p-3 text-sm">
                {d.tipo === "link" ? <ExternalLink className="mt-0.5 size-4 shrink-0 text-texto-3" aria-hidden="true" /> : <FileText className="mt-0.5 size-4 shrink-0 text-texto-3" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <a href={href} target="_blank" rel="noopener noreferrer" className="break-words font-medium text-[var(--acao)] underline-offset-2 hover:underline">{d.titulo}</a>
                  <span className="block text-xs text-texto-3">{d.por === "busca automática" ? "Achado pela busca automática (referência conferida)" : `Por ${d.por}`}{dataBr(d.em) && ` · ${dataBr(d.em)}`}</span>
                </span>
                {edita && (
                  <button type="button" onClick={() => remover(d)} disabled={gravando} aria-label={`Remover ${d.titulo}`}
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-[var(--selo-critico-texto)]">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-texto-3">Nenhum datasheet ainda.{fabricanteRef ? " A busca automática procura pelo fabricante e pela referência do Sysmat." : " Sem fabricante/referência no Sysmat, a busca automática não roda."}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={pesquisa} target="_blank" rel="noopener noreferrer" className={BOTAO_COMPACTO}><Search className="size-3.5" aria-hidden="true" /> Procurar datasheet</a>
      </div>
      {edita && (
        <div className="mt-3 grid gap-2 rounded-xl border border-borda p-3">
          <label htmlFor={`ds-url-${codigo}`} className="text-sm font-semibold">Link do datasheet</label>
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (/^https?:\/\//i.test(url.trim())) porLink(); }}>
            <input id={`ds-url-${codigo}`} name="datasheet_url" type="url" inputMode="url" autoComplete="off" spellCheck={false}
              value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://fabricante.com/…/datasheet.pdf"
              className="h-10 min-w-0 flex-1 rounded-xl border border-borda bg-superficie px-3 text-sm focus:border-[var(--acao)]" />
            <button type="submit" disabled={gravando || !/^https?:\/\//i.test(url.trim())} className={BOTAO_COMPACTO}>
              {gravando ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <ExternalLink className="size-3.5" aria-hidden="true" />} Gravar link
            </button>
          </form>
          <div>
            <input ref={arquivo} id={`ds-pdf-${codigo}`} type="file" accept="application/pdf" className="peer sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) porPdf(f); }} />
            <label htmlFor={`ds-pdf-${codigo}`} className={`${BOTAO_COMPACTO} cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--foco)]`}><Upload className="size-3.5" aria-hidden="true" /> Anexar PDF (até 4 MB)</label>
          </div>
        </div>
      )}
      <p role="status" className={msg ? `mt-2 rounded-lg px-3 py-2 text-sm ${msg.erro ? "bg-[var(--selo-critico-fundo)] text-[var(--selo-critico-texto)]" : "bg-[var(--selo-bom-fundo)] text-[var(--selo-bom-texto)]"}` : "sr-only"}>{msg?.texto ?? ""}</p>
    </section>
  );
}
