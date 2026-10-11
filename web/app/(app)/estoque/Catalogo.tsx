"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { BookOpen, LoaderCircle, PackageSearch } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";

import { DescrCorrida, FichaTecnica } from "@/components/FichaTecnica";
import { CampoBusca, MultiEscolha, Segmentos } from "@/components/Filtros";
import { Gaveta } from "@/components/Gaveta";
import { Selo } from "@/components/ui";
import type { ItemCatalogoTela } from "@/lib/dados/catalogoBusca";
import { inteiro, numero } from "@/lib/formato";

type Onde = "todos" | "almox" | "fora";
const INATIVOS = new Set(["BLOQUEADO", "CANCELADO", "DUPLICADO"]);
const PEDACO = 150;

export interface ResumoCatalogo {
  total: number; ativos: number; aprovados: number; inativos: number; noAlmox: number;
  status: [string, number][]; categorias: string[];
}

function Linha({ c, aoAbrir }: { c: ItemCatalogoTela; aoAbrir: () => void }) {
  return (
    <button onClick={aoAbrir}
      className="grid w-full gap-x-6 gap-y-3 border-b border-borda px-5 py-4 text-left transition hover:bg-superficie-2/70 md:grid-cols-[minmax(220px,1.1fr)_minmax(0,2.4fr)_130px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="num font-mono text-sm font-bold text-acao-500">{c.material || "—"}</span>
          <span className="num font-mono text-xs text-texto-3">Sysmat {c.sysmat}</span>
        </div>
        <div className="mt-1 font-display text-[15px] font-semibold leading-snug">{c.descricaoCurta || c.pdm || "—"}</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Selo cor={INATIVOS.has(c.status) ? (c.status === "CANCELADO" ? "vermelho" : "laranja") : "verde"}>{c.status || "sem status"}</Selo>
          {c.categoria && <Selo>{c.categoria}</Selo>}
        </div>
      </div>
      <DescrCorrida texto={c.descrCompleta} />
      <div className="md:text-right">
        {c.noAlmox ? (
          <>
            <div className="num font-display text-2xl font-extrabold leading-none">{numero(c.estoque)}</div>
            <div className="mt-1 text-xs text-texto-3">{c.um} no almoxarifado</div>
          </>
        ) : <span className="text-xs text-texto-3">fora do almoxarifado</span>}
      </div>
    </button>
  );
}

export function Catalogo({ resumo }: { resumo: ResumoCatalogo }) {
  const [busca, setBusca] = useState("");
  const q = useDeferredValue(busca.trim());
  const [status, setStatus] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [onde, setOnde] = useState<Onde>("todos");
  const [itens, setItens] = useState<ItemCatalogoTela[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [proximo, setProximo] = useState<number | null>(0);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState<ItemCatalogoTela | null>(null);
  const geracao = useRef(0);

  const carregar = useCallback(async (cursor: number, reiniciar: boolean) => {
    const minha = reiniciar ? ++geracao.current : geracao.current;
    setCarregando(true);
    const p = new URLSearchParams({ q, onde, cursor: String(cursor), limite: String(PEDACO) });
    status.forEach((s) => p.append("status", s));
    categorias.forEach((c) => p.append("categoria", c));
    try {
      const r = await fetch(`/api/catalogo?${p}`);
      const j = await r.json();
      if (minha !== geracao.current) return; // filtro mudou no meio: descarta
      if (!r.ok) throw new Error(j.erro || "Falha ao buscar.");
      setItens((a) => (reiniciar ? j.itens : [...a, ...j.itens]));
      setTotal(j.total);
      setProximo(j.proximo);
      setErro("");
    } catch (e) {
      if (minha === geracao.current) setErro((e as Error).message);
    } finally {
      if (minha === geracao.current) setCarregando(false);
    }
  }, [q, onde, status, categorias]);

  useEffect(() => { carregar(0, true); }, [carregar]);

  const listaRef = useRef<HTMLDivElement>(null);
  const [margem, setMargem] = useState(0);
  useLayoutEffect(() => setMargem(listaRef.current?.offsetTop ?? 0), []);
  const virt = useWindowVirtualizer({ count: itens.length, estimateSize: () => 140, overscan: 6, scrollMargin: margem });
  const visiveis = virt.getVirtualItems();
  const ultimo = visiveis.length ? visiveis[visiveis.length - 1].index : 0;
  useEffect(() => {
    // rolagem infinita: chegou perto do fim do que já veio, busca o próximo pedaço
    if (!carregando && proximo !== null && proximo > 0 && ultimo >= itens.length - 25) carregar(proximo, false);
  }, [ultimo, itens.length, proximo, carregando, carregar]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Materiais cadastrados", resumo.total, "itens da extração do Sysmat"], ["Cadastro ativo", resumo.ativos, `${inteiro(resumo.aprovados)} aprovados`],
          ["Bloqueados, cancelados ou duplicados", resumo.inativos, "pedem revisão"], ["No almoxarifado", resumo.noAlmox, "estão na MB52"]]
          .map(([r, v, d]) => (
            <div key={r as string} className="rounded-cartao border border-borda bg-superficie p-4 shadow-cartao">
              <div className="text-[13px] text-texto-2">{r}</div>
              <div className="num mt-2 font-display text-2xl font-extrabold">{inteiro(v as number)}</div>
              <div className="mt-1 text-xs text-texto-3">{d}</div>
            </div>
          ))}
      </div>

      <div className="z-20 -mx-4 space-y-3 border-b border-borda bg-fundo/90 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:sticky lg:top-0">
        <div className="flex flex-col gap-3 lg:flex-row">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar no catálogo inteiro: código, Sysmat, Descr Completa, fabricante, NCM…" />
          <div className="flex flex-wrap gap-2">
            <MultiEscolha rotulo="Status" opcoes={resumo.status.map(([valor, n]) => ({ valor, n }))} valor={status} aoMudar={setStatus} />
            <MultiEscolha rotulo="Categoria" opcoes={resumo.categorias.map((valor) => ({ valor }))} valor={categorias} aoMudar={setCategorias} />
          </div>
        </div>
        <Segmentos<Onde> valor={onde} aoMudar={setOnde} opcoes={[
          { valor: "todos", rotulo: "Todos" }, { valor: "almox", rotulo: "No almoxarifado" }, { valor: "fora", rotulo: "Fora do almoxarifado" }]} />
      </div>

      <p className="flex items-center gap-2 text-sm text-texto-3">
        {total === null ? "Buscando…" : <><span className="num font-semibold text-texto">{inteiro(total)}</span> material(is) — role até o fim, sem limite.</>}
        {carregando && <LoaderCircle className="size-4 animate-spin" />}
      </p>
      {erro && <p className="rounded-xl border border-perigo-500/30 bg-perigo-500/10 px-4 py-3 text-sm text-perigo-500">{erro}</p>}

      <div ref={listaRef} className="overflow-hidden rounded-cartao border border-borda bg-superficie shadow-cartao">
        {total === 0 ? (
          <div className="grid place-items-center gap-2 px-6 py-16 text-center text-texto-3"><PackageSearch className="size-8" /> Nenhum material com esses filtros.</div>
        ) : itens.length === 0 ? (
          <div className="space-y-px">{Array.from({ length: 6 }, (_, i) => <div key={i} className="esqueleto h-28" />)}</div>
        ) : (
          <div style={{ height: virt.getTotalSize(), position: "relative" }}>
            {visiveis.map((v) => (
              <div key={`${itens[v.index].sysmat}-${v.index}`} data-index={v.index} ref={virt.measureElement}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start - virt.options.scrollMargin}px)` }}>
                <Linha c={itens[v.index]} aoAbrir={() => setAberto(itens[v.index])} />
              </div>
            ))}
          </div>
        )}
      </div>
      {proximo !== null && itens.length > 0 && (
        <div className="grid place-items-center py-4 text-sm text-texto-3"><LoaderCircle className="size-5 animate-spin" /></div>
      )}

      <Gaveta aberta={!!aberto} aoFechar={() => setAberto(null)}
        titulo={aberto && <><span className="num font-mono text-acao-500">{aberto.material || "sem código"}</span> · {aberto.descricaoCurta}</>}
        subtitulo={aberto && `Sysmat ${aberto.sysmat} · ${aberto.status}`}>
        {aberto && (
          <>
            <section>
              <h3 className="mb-3 flex items-center gap-2 font-display font-bold"><BookOpen className="size-4" /> Ficha técnica (Descr Completa)</h3>
              <FichaTecnica texto={aberto.descrCompleta} />
            </section>
            <section className="grid gap-2 text-sm">
              {[["Categoria", [aberto.categoria, aberto.subcategoria].filter(Boolean).join(" › ")], ["PDM", aberto.pdm],
                ["Fabricante / referência", aberto.fabricanteRef], ["NCM", aberto.ncm], ["Unidade", aberto.um],
                ["Substituído por", aberto.substituto], ["No almoxarifado", aberto.noAlmox ? `${numero(aberto.estoque)} ${aberto.um}` : "não"]]
                .filter(([, v]) => v).map(([r, v]) => (
                  <div key={r} className="flex justify-between gap-4 border-b border-borda pb-2"><span className="text-texto-3">{r}</span><span className="text-right font-medium">{v}</span></div>
                ))}
            </section>
          </>
        )}
      </Gaveta>
    </div>
  );
}
