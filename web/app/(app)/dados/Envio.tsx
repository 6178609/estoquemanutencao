"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, LoaderCircle, Trash2, Upload, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Cartao, Selo } from "@/components/ui";
import type { BaseLida, Processado } from "@/lib/leitura/processar";

type Situacao = "lendo" | "pronto" | "enviando" | "enviado" | "erro";

interface Item {
  id: number;
  arquivo: File;
  situacao: Situacao;
  bases: (BaseLida & { situacao?: Situacao; erro?: string; progresso?: number })[];
  tiposOrdem?: Record<string, string>;
  erro?: string;
}

const EXTENSOES = ".xlsx,.xlsm,.xls,.csv,.txt,.htm,.html";
const n0 = new Intl.NumberFormat("pt-BR");
const mb = (b: number) => `${(b / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

function novoEnvio() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
}

const LIMITE_LEITURA_MS = 3 * 60_000; // um export grande leva segundos; minutos = travou
const LIMITE_ENVIO_MS = 90_000;        // por parte (o servidor grava no GitHub)

/**
 * Lê os arquivos num Web Worker e devolve as bases já em parquet. Se o worker não abrir ou cair, lê na própria
 * página; nada fica "lendo…" para sempre: passou do limite, o arquivo aparece com o erro.
 */
function useLeitor() {
  const worker = useRef<Worker | null>(null);
  const pendentes = useRef(new Map<number, { ok: (r: Processado) => void; falha: (e: Error) => void }>());
  useEffect(() => {
    try {
      const w = new Worker(new URL("../../../lib/leitura/trabalhador.ts", import.meta.url), { type: "module" });
      w.onmessage = (ev: MessageEvent<{ id: number; r: Processado }>) => {
        pendentes.current.get(ev.data.id)?.ok(ev.data.r);
        pendentes.current.delete(ev.data.id);
      };
      // o worker caiu (memória, script que não carregou…): os pendentes viram erro e os próximos são lidos na página
      w.onerror = (ev) => {
        ev.preventDefault();
        for (const p of pendentes.current.values()) p.falha(new Error("a leitura em segundo plano parou; tente anexar de novo"));
        pendentes.current.clear();
        w.terminate();
        worker.current = null;
      };
      worker.current = w;
    } catch {
      worker.current = null;
    }
    return () => worker.current?.terminate();
  }, []);
  return useCallback(async (id: number, arquivo: File): Promise<Processado> => {
    const buf = await arquivo.arrayBuffer();
    const w = worker.current;
    if (w) {
      return new Promise((ok, falha) => {
        const t = setTimeout(() => {
          pendentes.current.delete(id);
          falha(new Error("a leitura passou de 3 minutos; confira se o arquivo abre no Excel e anexe de novo"));
        }, LIMITE_LEITURA_MS);
        pendentes.current.set(id, { ok: (r) => { clearTimeout(t); ok(r); }, falha: (e) => { clearTimeout(t); falha(e); } });
        w.postMessage({ id, nome: arquivo.name, buf }, [buf]);
      });
    }
    const { processar } = await import("@/lib/leitura/processar");
    return processar(arquivo.name, new Uint8Array(buf));
  }, []);
}

/** POST de uma parte com tempo limite e uma nova tentativa quando a rede ou o servidor falham no meio. */
async function enviarParte(form: FormData): Promise<void> {
  let ultimo = "";
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), LIMITE_ENVIO_MS);
    try {
      const r = await fetch("/api/dados/enviar", { method: "POST", body: form, signal: ctl.signal });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return;
      ultimo = j.erro || `erro ${r.status} do servidor`;
      if (r.status < 500 && r.status !== 409) break; // sem permissão, pedido inválido: tentar de novo não adianta
    } catch (e) {
      ultimo = (e as Error).name === "AbortError" ? "o servidor não respondeu em 90 s" : "a conexão caiu durante o envio";
    } finally {
      clearTimeout(t);
    }
  }
  throw new Error(ultimo);
}

export function Envio({ demo }: { demo: boolean }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const proximo = useRef(1);
  const entrada = useRef<HTMLInputElement>(null);
  const ler = useLeitor();
  const router = useRouter();
  const [pronto, setPronto] = useState(false);

  const atualizar = (id: number, f: (i: Item) => Item) => setItens((xs) => xs.map((x) => (x.id === id ? f(x) : x)));

  const anexar = useCallback((arquivos: FileList | File[]) => {
    for (const arquivo of Array.from(arquivos)) {
      const id = proximo.current++;
      setItens((xs) => [...xs, { id, arquivo, situacao: "lendo", bases: [] }]);
      ler(id, arquivo).then((r) => atualizar(id, (i) => ({ ...i, situacao: r.erro ? "erro" : "pronto", erro: r.erro, bases: r.bases, tiposOrdem: r.tiposOrdem })),
        (e) => atualizar(id, (i) => ({ ...i, situacao: "erro", erro: String(e) })));
    }
  }, [ler]);

  // a página só aceita arquivos depois de carregar o JavaScript; o que foi escolhido antes disso é lido agora
  useEffect(() => {
    setPronto(true);
    const ja = entrada.current?.files;
    if (ja?.length) {
      anexar(ja);
      if (entrada.current) entrada.current.value = "";
    }
  }, [anexar]);

  const prontas = itens.flatMap((i) => i.bases.filter((b) => !b.situacao || b.situacao === "erro").map((b) => ({ i, b })));
  // a mesma base em dois arquivos: vale o arquivo mais novo
  const porTipo = new Map<string, { i: Item; b: Item["bases"][number] }>();
  for (const x of prontas) {
    const atual = porTipo.get(x.b.tipo);
    if (!atual || x.i.arquivo.lastModified > atual.i.arquivo.lastModified) porTipo.set(x.b.tipo, x);
  }
  const aEnviar = [...porTipo.values()];
  const lendo = itens.some((i) => i.situacao === "lendo");

  async function enviar() {
    setEnviando(true);
    for (const { i, b } of aEnviar) {
      const marcar = (m: Partial<Item["bases"][number]>) =>
        atualizar(i.id, (x) => ({ ...x, bases: x.bases.map((y) => (y.tipo === b.tipo ? { ...y, ...m } : y)) }));
      marcar({ situacao: "enviando", progresso: 0, erro: undefined });
      const envio = novoEnvio();
      try {
        for (let p = 0; p < b.partes.length; p++) {
          const form = new FormData();
          form.set("tipo", b.tipo);
          form.set("envio", envio);
          form.set("parte", String(p + 1));
          form.set("total", String(b.partes.length));
          form.set("arquivo", i.arquivo.name);
          form.set("aba", b.aba || "");
          form.set("modificado", new Date(i.arquivo.lastModified || Date.now()).toISOString());
          form.set("linhas", String(b.linhas));
          form.set("dados", new Blob([b.partes[p] as BlobPart], { type: "application/octet-stream" }), "parte.parquet");
          await enviarParte(form);
          marcar({ progresso: (p + 1) / b.partes.length });
        }
        marcar({ situacao: "enviado" });
      } catch (e) {
        marcar({ situacao: "erro", erro: (e as Error).message });
      }
    }
    // nomes dos tipos de ordem da Gestão de HH (deixam "corretivas emergenciais" com base)
    const tipos = Object.assign({}, ...itens.map((i) => i.tiposOrdem || {}));
    if (Object.keys(tipos).length) await fetch("/api/dados/tipos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tipos) }).catch(() => null);
    setEnviando(false);
    router.refresh();
  }

  return (
    <Cartao className="p-6">
      <div
        aria-busy={!pronto}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); anexar(e.dataTransfer.files); }}
        onClick={() => entrada.current?.click()}
        role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") entrada.current?.click(); }}
        className={clsx("pontos flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
          arrastando ? "border-marca-500 bg-marca-500/5" : "border-borda-forte hover:border-marca-300", !pronto && "pointer-events-none opacity-60")}>
        <span className="grid size-12 place-items-center rounded-[12px] border border-borda bg-superficie text-marca-600">
          <UploadCloud className="size-5" strokeWidth={1.75} />
        </span>
        <div className="font-display text-[16px] font-medium">{pronto ? "Arraste os exports do SAP aqui ou clique para escolher" : "Preparando a página…"}</div>
        <div className="max-w-xl text-[13px] text-texto-3">
          Vários de uma vez: .xlsx, o .xls/.htm do SAP GUI, .csv ou .txt. O arquivo é lido no seu navegador — só a tabela
          compactada vai para o repositório de dados.
        </div>
        <input ref={entrada} type="file" multiple accept={EXTENSOES} className="hidden"
          onChange={(e) => { if (e.target.files) anexar(e.target.files); e.target.value = ""; }} />
      </div>

      {itens.length > 0 && (
        <div className="mt-5 space-y-2">
          {itens.map((i) => (
            <div key={i.id} className="rounded-xl border border-borda bg-superficie-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="size-4 shrink-0 text-texto-3" />
                <div className="min-w-0 flex-1 truncate text-[14px] font-medium">{i.arquivo.name}</div>
                <span className="text-[12px] text-texto-3">{mb(i.arquivo.size)}</span>
                {i.situacao === "lendo" && <span className="flex items-center gap-1.5 text-[12.5px] text-texto-3"><LoaderCircle className="size-3.5 animate-spin" /> lendo…</span>}
                {!enviando && i.situacao !== "lendo" && (
                  <button aria-label="Tirar da lista" onClick={() => setItens((xs) => xs.filter((x) => x.id !== i.id))}
                    className="grid size-7 place-items-center rounded-lg text-texto-3 hover:bg-superficie-3 hover:text-perigo-500">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              {i.erro && <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-perigo-500"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{i.erro}</p>}
              {i.bases.map((b) => {
                const ignorada = !b.situacao && porTipo.get(b.tipo)?.i.id !== i.id;
                return (
                  <div key={b.tipo} className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-[13px]">
                    <Selo cor={b.situacao === "enviado" ? "verde" : b.situacao === "erro" ? "vermelho" : ignorada ? "cinza" : "azul"}>{b.nome}</Selo>
                    <span className="text-texto-3">{n0.format(b.linhas)} linhas · {b.colunas.length} colunas{b.aba ? ` · aba ${b.aba}` : ""}
                      {b.partes.length > 1 ? ` · ${b.partes.length} partes` : ""}</span>
                    {ignorada && <span className="text-[12px] text-texto-4">(há um arquivo mais novo desta base na lista)</span>}
                    {b.situacao === "enviando" && <span className="flex items-center gap-1.5 text-texto-3"><LoaderCircle className="size-3.5 animate-spin" /> enviando {Math.round((b.progresso || 0) * 100)}%</span>}
                    {b.situacao === "enviado" && <span className="flex items-center gap-1 text-marca-600 dark:text-marca-300"><CheckCircle2 className="size-3.5" /> gravada</span>}
                    {b.erro && <span className="text-perigo-500">{b.erro}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 pt-3">
            <button className={BOTAO_PRIMARIO} disabled={demo || enviando || lendo || !aEnviar.length} onClick={enviar}>
              {enviando ? <LoaderCircle className="size-5 animate-spin" /> : <><Upload className="size-4" /> Enviar {aEnviar.length || ""} base(s)</>}
            </button>
            {!enviando && <button className={BOTAO_SECUNDARIO} onClick={() => setItens([])}>Limpar lista</button>}
            {demo && <span className="text-[12.5px] text-texto-3">Na demonstração dá para testar a leitura; o envio precisa do repositório de dados ligado.</span>}
          </div>
        </div>
      )}
    </Cartao>
  );
}
