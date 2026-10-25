"use client";

import clsx from "clsx";
import { Link2, LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { Campo, Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO } from "@/components/ui";
import { casaBusca, normalizarBusca } from "@/lib/dados/texto";
import { LIMITE_DOCUMENTO, LIMITE_MANUAL_GRANDE, TAMANHO_PARTE } from "@/lib/limitesManual";

interface EqTela { codigo: string; nome: string; campo: string; area: string }
interface AcervoTela { titulo: string; url: string; fonte: string; area: string }

const MAX_LOTE = 50;
const MOSTRAR = 60;
/** Até aqui, o arquivo vai num pedido só; acima, em partes (cada parte cabe no limite da Vercel). */
const LIMITE_SIMPLES = LIMITE_DOCUMENTO;
const LIMITE_GRANDE = LIMITE_MANUAL_GRANDE;
/** Uma parte tem 3 tentativas (a 1ª e 2 novas) antes de desistir. */
const TENTATIVAS_PARTE = 3;

/** Falha de um pedido: `repetir` quando vale tentar de novo (rede ou erro do servidor), não quando a regra recusou. */
class ErroEnvio extends Error {
  constructor(mensagem: string, readonly repetir: boolean) {
    super(mensagem);
  }
}

async function pedir(url: string, init: RequestInit, padrao: string): Promise<Record<string, unknown>> {
  const r = await fetch(url, { method: "POST", ...init }).catch(() => null);
  const j = ((await r?.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  if (!r?.ok) throw new ErroEnvio(String(j.erro || padrao), !r || r.status >= 500);
  return j;
}

/**
 * Vincular um manual (arquivo ou link) a um ou mais equipamentos. O link pode vir do acervo de referência do Suporte
 * (preenche título e endereço, que continuam editáveis).
 */
export function VincularManual({ equipamentos, acervo, inicial }: { equipamentos: EqTela[]; acervo: AcervoTela[]; inicial: string[] }) {
  const router = useRouter();
  const arquivo = useRef<HTMLInputElement>(null);
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<string[]>(inicial);
  const [modo, setModo] = useState<"arquivo" | "link">("arquivo");
  const [titulo, setTitulo] = useState("");
  const [url, setUrl] = useState("");
  const [buscaAcervo, setBuscaAcervo] = useState("");
  const [escolhidoAcervo, setEscolhidoAcervo] = useState("");
  const [estado, setEstado] = useState({ enviando: false, erro: "", ok: "" });
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);

  const achados = useMemo(() => equipamentos.filter((e) =>
    casaBusca(normalizarBusca([e.codigo, e.campo, e.nome, e.area].join(" ")), busca)), [equipamentos, busca]);
  // o índice no acervo vai junto com o item (a lista não procura a posição de cada um)
  const itensAcervo = useMemo(() => acervo.map((a, i) => ({ ...a, i })).filter((a) =>
    casaBusca(normalizarBusca([a.titulo, a.fonte, a.area].join(" ")), buscaAcervo)), [acervo, buscaAcervo]);

  const alternar = (codigo: string) => setMarcados((m) => m.includes(codigo) ? m.filter((x) => x !== codigo)
    : m.length >= MAX_LOTE ? m : [...m, codigo]);

  const escolherAcervo = (i: string) => {
    setEscolhidoAcervo(i);
    const item = acervo[Number(i)];
    if (!item) return;
    setTitulo(item.titulo);
    setUrl(item.url);
  };

  /** Arquivo grande: inicia o envio, manda as partes em ordem (cada uma com novas tentativas) e conclui. */
  const enviarEmPartes = async (f: File, eqs: string[], titulo: string) => {
    const total = Math.ceil(f.size / TAMANHO_PARTE);
    const { envio } = await pedir("/api/manuais/partes?acao=iniciar",
      { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eqs, titulo, nome: f.name, tamanho: f.size }) },
      "Não foi possível iniciar o envio.") as { envio: string };
    setProgresso({ feitas: 0, total });
    try {
      for (let i = 0; i < total; i++) {
        const parte = f.slice(i * TAMANHO_PARTE, Math.min(f.size, (i + 1) * TAMANHO_PARTE));
        for (let t = 1; ; t++) {
          const form = new FormData();
          form.set("envio", envio);
          form.set("indice", String(i));
          form.append("arquivo", parte, f.name);
          try {
            await pedir("/api/manuais/partes?acao=parte", { body: form }, "Não foi possível enviar a parte.");
            break;
          } catch (e) {
            const erroParte = e instanceof ErroEnvio ? e : new ErroEnvio("Não foi possível enviar a parte.", true);
            if (!erroParte.repetir || t >= TENTATIVAS_PARTE) {
              throw new ErroEnvio(`Não foi possível enviar a parte ${i + 1} de ${total}. ${erroParte.message} Tente de novo.`, false);
            }
          }
        }
        setProgresso({ feitas: i + 1, total });
      }
      const j = await pedir("/api/manuais/partes?acao=concluir", { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ envio }) },
        "Não foi possível concluir o envio.");
      return Number(j.vinculados) || eqs.length;
    } catch (e) {
      // desistiu: pede para apagar as partes já enviadas (se falhar, o servidor apaga quando o envio vencer)
      void fetch("/api/manuais/partes?acao=cancelar", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ envio }) }).catch(() => undefined);
      throw e;
    }
  };

  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formulario = e.currentTarget;
    if (!marcados.length) { setEstado({ enviando: false, erro: "Escolha pelo menos um equipamento.", ok: "" }); return; }
    const eqs = marcados;
    const tituloManual = titulo;
    let n: number;
    setEstado({ enviando: true, erro: "", ok: "" });
    try {
      if (modo === "arquivo") {
        const f = arquivo.current?.files?.[0];
        if (!f) { setEstado({ enviando: false, erro: "Escolha o arquivo (PDF ou imagem).", ok: "" }); return; }
        if (f.size > LIMITE_GRANDE) { setEstado({ enviando: false, erro: "O arquivo passa de 100 MB. Para manuais maiores, use o link.", ok: "" }); return; }
        if (f.size > LIMITE_SIMPLES) {
          n = await enviarEmPartes(f, eqs, tituloManual);
        } else {
          const form = new FormData();
          for (const c of eqs) form.append("eqs", c);
          form.set("titulo", tituloManual);
          form.set("arquivo", f);
          const j = await pedir("/api/manuais", { body: form }, "Não foi possível vincular.");
          n = Number(j.vinculados) || eqs.length;
        }
      } else {
        if (!url.trim()) { setEstado({ enviando: false, erro: "Informe o link.", ok: "" }); return; }
        const form = new FormData();
        for (const c of eqs) form.append("eqs", c);
        form.set("titulo", tituloManual);
        form.set("url", url.trim());
        const j = await pedir("/api/manuais", { body: form }, "Não foi possível vincular.");
        n = Number(j.vinculados) || eqs.length;
      }
    } catch (err) {
      setProgresso(null);
      setEstado({ enviando: false, erro: err instanceof Error ? err.message : "Não foi possível vincular.", ok: "" });
      return;
    }
    setProgresso(null);
    formulario.reset();
    setMarcados([]);
    setTitulo("");
    setUrl("");
    setEscolhidoAcervo("");
    setEstado({ enviando: false, erro: "", ok: `Manual vinculado a ${n} ${n === 1 ? "equipamento" : "equipamentos"}.` });
    router.refresh();
  };

  return (
    <form onSubmit={enviar} className="space-y-5 rounded-cartao border border-borda bg-superficie p-4 sm:p-5">
      <fieldset className="space-y-3">
        <legend className="mb-1 text-[13px] font-semibold text-texto">1. Equipamentos ({marcados.length} de até {MAX_LOTE})</legend>
        <Campo rotulo="Buscar equipamento" name="busca-equipamento" type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Código, campo, nome ou área" autoComplete="off" />
        {marcados.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-texto-2">
            <span>Escolhidos: {marcados.join(", ")}</span>
            <button type="button" onClick={() => setMarcados([])} className="min-h-11 rounded-lg px-2 font-medium text-acao underline-offset-2 hover:underline">Limpar</button>
          </div>
        )}
        <ul className="max-h-72 divide-y divide-borda overflow-y-auto rounded-xl border border-borda bg-superficie-2" aria-label="Equipamentos encontrados">
          {achados.slice(0, MOSTRAR).map((e) => {
            const marcado = marcados.includes(e.codigo);
            const cheio = !marcado && marcados.length >= MAX_LOTE;
            return (
              <li key={e.codigo}>
                <label className={clsx("flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-[13.5px]", cheio && "cursor-not-allowed opacity-50")}>
                  <input type="checkbox" checked={marcado} disabled={cheio} onChange={() => alternar(e.codigo)} className="size-4 shrink-0 accent-[var(--acao)]" />
                  <span className="min-w-0">
                    <span className="num font-mono text-[12.5px] text-acao">{e.codigo}</span>{" "}
                    <span className="text-texto-2">{e.campo}</span>
                    <span className="block truncate text-[12.5px] text-texto-3">{e.nome}{e.area ? ` · ${e.area}` : ""}</span>
                  </span>
                </label>
              </li>
            );
          })}
          {!achados.length && <li className="px-3 py-4 text-center text-[13px] text-texto-3">Nenhum equipamento com esta busca.</li>}
        </ul>
        {achados.length > MOSTRAR && <p className="text-[12px] text-texto-3">Mostrando {MOSTRAR} de {achados.length}. Refine a busca para ver os outros.</p>}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-[13px] font-semibold text-texto">2. Manual</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo do manual">
          {(["arquivo", "link"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setModo(m)} aria-pressed={modo === m}
              className={clsx("inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[13.5px]",
                modo === m ? "border-transparent bg-tinta font-semibold text-tinta-texto" : "border-borda bg-superficie text-texto-2")}>
              {m === "arquivo" ? <Upload className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
              {m === "arquivo" ? "Arquivo (PDF ou imagem)" : "Link"}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Título" name="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} required
            placeholder="Ex.: Manual de operação da prensa" />
          {modo === "arquivo" ? (
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-texto">Arquivo (até 100 MB)</span>
              <input ref={arquivo} name="arquivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
                className="block min-h-11 w-full rounded-xl border border-borda-forte bg-superficie px-3 py-2 text-[13.5px] text-texto file:mr-3 file:rounded-lg file:border-0 file:bg-superficie-3 file:px-3 file:py-1.5 file:text-texto" />
              <span className="mt-1.5 block text-[12px] text-texto-3">Acima de 4 MB, o envio é feito em partes. Não feche a página até terminar.</span>
            </label>
          ) : (
            <Campo rotulo="Link" name="url" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          )}
        </div>
        {modo === "link" && acervo.length > 0 && (
          <div className="grid gap-3 rounded-xl border border-borda bg-superficie-2 p-3 sm:grid-cols-2">
            <Campo rotulo="Buscar no acervo de referência" name="busca-acervo" type="search" value={buscaAcervo} autoComplete="off"
              onChange={(e) => setBuscaAcervo(e.target.value)} placeholder="Fabricante, tipo de manual…" />
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-texto">Usar link do acervo (preenche título e link)</span>
              <select value={escolhidoAcervo} onChange={(e) => escolherAcervo(e.target.value)}
                className="h-11 w-full rounded-xl border border-borda-forte bg-superficie px-3 text-[14px] text-texto">
                <option value="">— escolher —</option>
                {itensAcervo.slice(0, 200).map((a) => <option key={a.i} value={a.i}>{a.titulo} ({a.fonte})</option>)}
              </select>
            </label>
          </div>
        )}
      </fieldset>

      {progresso && (
        <div className="space-y-1.5">
          <p className="text-[13px] text-texto-2" aria-live="polite">
            {progresso.feitas < progresso.total ? `Enviando parte ${progresso.feitas + 1} de ${progresso.total}` : "Concluindo o envio…"}
          </p>
          <div role="progressbar" aria-label="Envio do manual" aria-valuemin={0} aria-valuemax={progresso.total} aria-valuenow={progresso.feitas}
            aria-valuetext={`${progresso.feitas} de ${progresso.total} partes`}
            className="h-2 w-full overflow-hidden rounded-full bg-superficie-3">
            <div className="h-full bg-[var(--acao)] transition-[width]" style={{ width: `${(progresso.feitas / progresso.total) * 100}%` }} />
          </div>
        </div>
      )}
      {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
      {estado.ok && <Mensagem tipo="ok">{estado.ok}</Mensagem>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={estado.enviando} aria-busy={estado.enviando} className={BOTAO_PRIMARIO}>
          {estado.enviando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
          {estado.enviando ? "Vinculando…" : "Vincular manual"}
        </button>
      </div>
    </form>
  );
}
