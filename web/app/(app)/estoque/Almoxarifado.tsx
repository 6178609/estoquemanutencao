"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { Download, LoaderCircle, PackageSearch, Save, Wrench } from "lucide-react";
import { useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from "react";

import { DescrCorrida, FichaTecnica } from "@/components/FichaTecnica";
import { CampoBusca, MultiEscolha, Segmentos } from "@/components/Filtros";
import { Gaveta } from "@/components/Gaveta";
import { BOTAO_PRIMARIO, Selo } from "@/components/ui";
import type { ItemAlmox } from "@/lib/dados/materiais";
import { casaBusca, normalizarBusca } from "@/lib/dados/texto";
import { brl, inteiro, numero } from "@/lib/formato";

type Situacao = "todos" | "Zerado" | "Abaixo do mínimo" | "OK" | "vinculado";
type Ordem = "situacao" | "descricao" | "estoque" | "valor";

const COR_SITUACAO = { Zerado: "vermelho", "Abaixo do mínimo": "laranja", OK: "verde" } as const;
const COR_CADASTRO: Record<string, "verde" | "laranja" | "vermelho" | "amarelo" | "cinza"> = {
  Ativo: "verde", Bloqueado: "laranja", Cancelado: "vermelho", Duplicado: "amarelo", "Não encontrado no Sysmat": "cinza",
  "Sem catálogo": "cinza",
};

function baixarCsv(itens: ItemAlmox[]) {
  const cab = ["Material", "Descrição", "Descr Completa", "UM", "Estoque", "Mínimo", "Situação", "Cadastro Sysmat",
    "Categoria", "Fabricante / referência", "Depósitos", "Valor", "Usado em"];
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const num = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));
  const linhas = itens.map((i) => [i.material, i.descricao, i.descrCompleta, i.um, num(i.estoque), num(i.minimo), i.situacao,
    i.cadastro, i.categoria, i.fabricanteRef, i.depositos, num(i.valor), i.usadoEm].map(esc).join(";"));
  const blob = new Blob(["﻿" + [cab.map(esc).join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "almoxarifado.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function Linha({ it, aoAbrir }: { it: ItemAlmox; aoAbrir: () => void }) {
  return (
    <button onClick={aoAbrir}
      className="group grid w-full gap-x-6 gap-y-3 border-b border-borda px-5 py-4 text-left transition hover:bg-superficie-2 md:grid-cols-[minmax(220px,1.1fr)_minmax(0,2.4fr)_150px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="num font-mono text-[13px] font-medium text-alp-azul">{it.material}</span>
          <Selo cor={COR_SITUACAO[it.situacao]}>{it.situacao}</Selo>
        </div>
        <div className="mt-1 font-display text-[15px] font-medium leading-snug tracking-[-0.01em]">{it.descricao || "—"}</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Selo cor={COR_CADASTRO[it.cadastro] || "cinza"}>{it.cadastro === "Ativo" ? "Cadastro ativo" : it.cadastro}</Selo>
          {it.categoria && <Selo>{it.categoria}</Selo>}
          {it.usadoEm && <Selo cor="azul"><Wrench className="size-3" /> {it.usadoEm.split(",").length} equip.</Selo>}
        </div>
      </div>
      <DescrCorrida texto={it.descrCompleta} />
      <div className="flex items-start justify-between gap-4 md:flex-col md:items-end md:text-right">
        <div>
          <div className={clsx("num font-display text-[26px] font-medium leading-none tracking-[-0.03em]", it.estoque <= 0 && "text-perigo-500")}>{numero(it.estoque)}</div>
          <div className="mt-1 text-xs text-texto-3">{it.um || "—"} em estoque</div>
        </div>
        <div className="text-xs text-texto-3">
          mín. <span className="num font-semibold text-texto-2">{it.minimo == null ? "—" : numero(it.minimo)}</span>
          {it.depositos && <div className="mt-0.5 truncate">{it.depositos}</div>}
        </div>
      </div>
    </button>
  );
}

export function Almoxarifado({ itens: iniciais, edita }: { itens: ItemAlmox[]; edita: boolean }) {
  const [itens, setItens] = useState(iniciais);
  const [busca, setBusca] = useState("");
  const buscaAdiada = useDeferredValue(busca);
  const [situacao, setSituacao] = useState<Situacao>("todos");
  const [cadastros, setCadastros] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [depositos, setDepositos] = useState<string[]>([]);
  const [ordem, setOrdem] = useState<Ordem>("situacao");
  const [aberto, setAberto] = useState<ItemAlmox | null>(null);

  const textoBusca = useMemo(() => itens.map((i) =>
    normalizarBusca([i.material, i.descricao, i.descrCompleta, i.fabricanteRef, i.sysmat, i.categoria].join(" "))), [itens]);

  const contar = (f: (i: ItemAlmox) => string) => {
    const m = new Map<string, number>();
    for (const i of itens) { const k = f(i); if (k) m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([valor, n]) => ({ valor, n }));
  };
  const opCadastro = useMemo(() => contar((i) => i.cadastro), [itens]); // eslint-disable-line react-hooks/exhaustive-deps
  const opCategoria = useMemo(() => contar((i) => i.categoria), [itens]); // eslint-disable-line react-hooks/exhaustive-deps
  const opDeposito = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of itens) for (const d of i.depositos.split(", ").filter(Boolean)) m.set(d, (m.get(d) || 0) + 1);
    return [...m.entries()].sort().map(([valor, n]) => ({ valor, n }));
  }, [itens]);

  const visiveis = useMemo(() => {
    const r: ItemAlmox[] = [];
    itens.forEach((i, k) => {
      if (situacao === "vinculado" ? !i.usadoEm : situacao !== "todos" && i.situacao !== situacao) return;
      if (cadastros.length && !cadastros.includes(i.cadastro)) return;
      if (categorias.length && !categorias.includes(i.categoria)) return;
      if (depositos.length && !i.depositos.split(", ").some((d) => depositos.includes(d))) return;
      if (buscaAdiada && !casaBusca(textoBusca[k], buscaAdiada)) return;
      r.push(i);
    });
    const peso = { Zerado: 0, "Abaixo do mínimo": 1, OK: 2 };
    const cmp: Record<Ordem, (a: ItemAlmox, b: ItemAlmox) => number> = {
      situacao: (a, b) => peso[a.situacao] - peso[b.situacao] || a.descricao.localeCompare(b.descricao, "pt-BR"),
      descricao: (a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"),
      estoque: (a, b) => b.estoque - a.estoque,
      valor: (a, b) => b.valor - a.valor,
    };
    return r.sort(cmp[ordem]);
  }, [itens, textoBusca, buscaAdiada, situacao, cadastros, categorias, depositos, ordem]);

  const listaRef = useRef<HTMLDivElement>(null);
  const [margem, setMargem] = useState(0);
  useLayoutEffect(() => setMargem(listaRef.current?.offsetTop ?? 0), []);
  const virt = useWindowVirtualizer({ count: visiveis.length, estimateSize: () => 150, overscan: 6, scrollMargin: margem });

  const n = (s: string) => itens.filter((i) => i.situacao === s).length;
  const aoSalvar = useCallback((material: string, minimo: number | null) => {
    setItens((atual) => atual.map((i) => {
      if (i.material !== material) return i;
      const situacao = i.estoque <= 0 ? "Zerado" : minimo !== null && i.estoque < minimo ? "Abaixo do mínimo" : "OK";
      return { ...i, minimo, situacao };
    }));
    setAberto((a) => (a && a.material === material ? { ...a, minimo } : a));
  }, []);

  return (
    <div className="space-y-4">
      <div className="z-20 -mx-4 space-y-3 border-b border-borda bg-fundo/90 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:sticky lg:top-0">
        <div className="flex flex-col gap-3 lg:flex-row">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por código, descrição, Descr Completa, fabricante, referência…" />
          <div className="flex flex-wrap gap-2">
            <MultiEscolha rotulo="Cadastro Sysmat" opcoes={opCadastro} valor={cadastros} aoMudar={setCadastros} />
            <MultiEscolha rotulo="Categoria" opcoes={opCategoria} valor={categorias} aoMudar={setCategorias} />
            <MultiEscolha rotulo="Depósito" opcoes={opDeposito} valor={depositos} aoMudar={setDepositos} />
          </div>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Segmentos<Situacao> valor={situacao} aoMudar={setSituacao} opcoes={[
            { valor: "todos", rotulo: "Todos", n: itens.length }, { valor: "Zerado", rotulo: "Zerados", n: n("Zerado") },
            { valor: "Abaixo do mínimo", rotulo: "Abaixo do mínimo", n: n("Abaixo do mínimo") }, { valor: "OK", rotulo: "OK", n: n("OK") },
            { valor: "vinculado", rotulo: "Peça de equipamento", n: itens.filter((i) => i.usadoEm).length },
          ]} />
          <div className="flex items-center gap-2 text-sm">
            <label className="text-texto-3" htmlFor="ordem">Ordenar</label>
            <select id="ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}
              className="h-9 rounded-lg border border-borda bg-superficie px-2 text-sm outline-none">
              <option value="situacao">Situação</option><option value="descricao">Descrição</option>
              <option value="estoque">Maior estoque</option><option value="valor">Maior valor</option>
            </select>
            <button onClick={() => baixarCsv(visiveis)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borda bg-superficie px-3 font-medium text-texto-2 hover:text-texto">
              <Download className="size-4" /> Excel (CSV)
            </button>
          </div>
        </div>
      </div>

      <p className="text-[13px] text-texto-3"><span className="num font-semibold text-texto">{inteiro(visiveis.length)}</span> material(is) — todos numa rolagem só, sem limite. Toque num item para ver a ficha técnica completa{edita ? " e ajustar o mínimo" : ""}.</p>

      <div ref={listaRef} className="overflow-hidden rounded-cartao border border-borda bg-superficie">
        {visiveis.length === 0 ? (
          <div className="grid place-items-center gap-2 px-6 py-16 text-center text-texto-3">
            <PackageSearch className="size-8" /> Nenhum material com esses filtros.
          </div>
        ) : (
          <div style={{ height: virt.getTotalSize(), position: "relative" }}>
            {virt.getVirtualItems().map((v) => (
              <div key={visiveis[v.index].material} data-index={v.index} ref={virt.measureElement}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start - virt.options.scrollMargin}px)` }}>
                <Linha it={visiveis[v.index]} aoAbrir={() => setAberto(visiveis[v.index])} />
              </div>
            ))}
          </div>
        )}
      </div>

      <Gaveta aberta={!!aberto} aoFechar={() => setAberto(null)}
        titulo={aberto && <><span className="num font-mono text-acao-500">{aberto.material}</span> · {aberto.descricao}</>}
        subtitulo={aberto && `${aberto.cadastro === "Ativo" ? "Cadastro ativo" : aberto.cadastro}${aberto.sysmat ? ` · Sysmat ${aberto.sysmat}` : ""}`}>
        {aberto && <Detalhe it={aberto} edita={edita} aoSalvar={aoSalvar} />}
      </Gaveta>
    </div>
  );
}

function Detalhe({ it, edita, aoSalvar }: { it: ItemAlmox; edita: boolean; aoSalvar: (m: string, v: number | null) => void }) {
  const [valor, setValor] = useState(it.minimo == null ? "" : String(it.minimo).replace(".", ","));
  const [estado, setEstado] = useState<{ gravando: boolean; msg: string; erro: boolean }>({ gravando: false, msg: "", erro: false });
  const salvar = async () => {
    const t = valor.trim().replace(/\./g, "").replace(",", ".");
    const minimo = t === "" ? null : Number(t);
    if (minimo !== null && (!Number.isFinite(minimo) || minimo < 0)) { setEstado({ gravando: false, msg: "Mínimo inválido.", erro: true }); return; }
    setEstado({ gravando: true, msg: "", erro: false });
    const r = await fetch("/api/estoque/minimo", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ material: it.material, minimo }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setEstado({ gravando: false, msg: j.erro || "Não foi possível salvar.", erro: true }); return; }
    aoSalvar(it.material, minimo);
    setEstado({ gravando: false, msg: "Mínimo salvo.", erro: false });
  };
  const cartoes = [
    { r: "Estoque", v: `${numero(it.estoque)} ${it.um}` }, { r: "Mínimo", v: it.minimo == null ? "—" : numero(it.minimo) },
    { r: "Valor", v: it.valor ? brl(it.valor) : "—" }, { r: "Depósitos", v: it.depositos || "—" },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {cartoes.map((c) => (
          <div key={c.r} className="rounded-2xl bg-superficie-2 p-3.5">
            <div className="text-xs text-texto-3">{c.r}</div>
            <div className="num mt-1 font-display text-lg font-bold">{c.v}</div>
          </div>
        ))}
      </div>
      {edita && (
        <div className="rounded-2xl border border-borda p-4">
          <label className="text-sm font-semibold" htmlFor="minimo">Estoque mínimo (ponto de reposição)</label>
          <div className="mt-2 flex gap-2">
            <input id="minimo" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="sem mínimo"
              className="num h-11 w-40 rounded-xl border border-borda bg-superficie px-3 outline-none focus:border-marca-500 focus:ring-4 focus:ring-marca-500/15" />
            <button onClick={salvar} disabled={estado.gravando} className={BOTAO_PRIMARIO}>
              {estado.gravando ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar
            </button>
          </div>
          {estado.msg && <p className={clsx("mt-2 text-sm", estado.erro ? "text-perigo-500" : "text-marca-700 dark:text-marca-300")}>{estado.msg}</p>}
        </div>
      )}
      <section>
        <h3 className="mb-3 font-display font-bold">Ficha técnica (Descr Completa)</h3>
        <FichaTecnica texto={it.descrCompleta} />
      </section>
      <section className="grid gap-2 text-sm">
        {[["Categoria", [it.categoria, it.subcategoria].filter(Boolean).join(" › ")], ["Fabricante / referência", it.fabricanteRef],
          ["NCM", it.ncm], ["Status no Sysmat", it.status], ["Substituído por", it.substituto], ["Usado em", it.usadoEm]]
          .filter(([, v]) => v).map(([r, v]) => (
            <div key={r} className="flex justify-between gap-4 border-b border-borda pb-2"><span className="text-texto-3">{r}</span><span className="text-right font-medium">{v}</span></div>
          ))}
      </section>
    </>
  );
}
