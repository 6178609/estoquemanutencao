"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { Camera, Download, ImageOff, ImagePlus, LoaderCircle, PackageSearch, Save, Wrench } from "lucide-react";
import { useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from "react";

import { DescrCorrida, FichaTecnica } from "@/components/FichaTecnica";
import { CampoBusca, MultiEscolha } from "@/components/Filtros";
import { Gaveta } from "@/components/Gaveta";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Selo } from "@/components/ui";
import { cobertura, type ItemAlmox } from "@/lib/dados/materiais";
import { urlFotoMaterial } from "@/lib/fotoMaterial";
import { casaBusca, normalizarBusca } from "@/lib/dados/texto";
import { brl, inteiro, numero } from "@/lib/formato";

type Situacao = "todos" | "Zerado" | "Abaixo do mínimo" | "OK" | "vinculado";
type Ordem = "situacao" | "descricao" | "estoque" | "valor";

const COR_SITUACAO = { Zerado: "vermelho", "Abaixo do mínimo": "laranja", OK: "verde" } as const;
/** Cor da barra de cobertura do mínimo, a mesma do selo da situação. */
const BARRA_SITUACAO = { Zerado: "var(--selo-critico-texto)", "Abaixo do mínimo": "var(--selo-serio-texto)", OK: "var(--selo-bom-texto)" } as const;
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

const urlFoto = (it: ItemAlmox, mini = false) => urlFotoMaterial(it.material, it.foto, mini);

/** Redesenha a foto com no máximo `lado` px, em JPEG (tira também os dados de localização do arquivo). */
async function reduzir(img: ImageBitmap, lado: number, qualidade: number): Promise<Blob> {
  const escala = Math.min(1, lado / Math.max(img.width, img.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(img.width * escala);
  tela.height = Math.round(img.height * escala);
  tela.getContext("2d")!.drawImage(img, 0, 0, tela.width, tela.height);
  return new Promise((ok, erro) => tela.toBlob((b) => (b ? ok(b) : erro(new Error("Não consegui ler a foto."))), "image/jpeg", qualidade));
}

/** A foto (até 1600 px) e a miniatura da lista (240 px), reduzidas no aparelho: sobe rápido mesmo no 4G da fábrica. */
async function prepararFoto(arquivo: File): Promise<{ foto: Blob; mini: Blob | null }> {
  let img: ImageBitmap;
  try {
    img = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  } catch {
    // o navegador não abre esse formato (ex.: HEIC): envia o original se já for uma imagem comum e pequena
    if (/^image\/(jpeg|png|webp)$/.test(arquivo.type) && arquivo.size <= 1_500_000) return { foto: arquivo, mini: null };
    throw new Error("Não consegui abrir esse formato de imagem. Tire a foto pelo botão da câmera ou escolha um JPEG.");
  }
  try {
    return { foto: await reduzir(img, 1600, 0.85), mini: await reduzir(img, 240, 0.8) };
  } finally {
    img.close();
  }
}

/** Filtros rápidos de um toque (pílulas com contagem); no celular rolam na horizontal. */
function Pilulas({ opcoes, valor, aoMudar }: { opcoes: { valor: Situacao; rotulo: string; n: number }[]; valor: Situacao;
  aoMudar: (v: Situacao) => void }) {
  return (
    <div role="group" aria-label="Situação do material" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0">
      {opcoes.map((o) => (
        <button key={o.valor} type="button" onClick={() => aoMudar(o.valor)} aria-pressed={valor === o.valor}
          className={clsx("inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[13.5px] transition lg:min-h-9",
            valor === o.valor ? "border-transparent bg-tinta font-semibold text-tinta-texto" : "border-borda bg-superficie text-texto-2 hover:text-texto")}>
          {o.rotulo}<span className="num">· {o.n.toLocaleString("pt-BR")}</span>
        </button>
      ))}
    </div>
  );
}

function Linha({ it, aoAbrir }: { it: ItemAlmox; aoAbrir: () => void }) {
  const cob = cobertura(it.estoque, it.minimo);
  return (
    <button onClick={aoAbrir}
      className="group grid w-full gap-x-6 gap-y-3 border-b border-borda px-5 py-4 text-left transition hover:bg-superficie-2 md:grid-cols-[minmax(220px,1.1fr)_minmax(0,2.4fr)_150px]">
      <div className="flex min-w-0 gap-3">
      {urlFoto(it, true) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlFoto(it, true)!} alt="" loading="lazy" decoding="async" className="size-14 shrink-0 rounded-xl border border-borda bg-white object-cover" />
      )}
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
          {cob != null && (
            <div className="mt-2 h-1.5 w-28 rounded-full bg-superficie-3 md:ml-auto" role="img" aria-label={`Cobre ${cob}% do mínimo`}>
              <div className="h-1.5 rounded-full" style={{ width: `${Math.max(cob, 2)}%`, background: BARRA_SITUACAO[it.situacao] }} />
            </div>
          )}
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

  // tudo menos a situação: é sobre este recorte que as pílulas contam
  const recorte = useMemo(() => {
    const r: ItemAlmox[] = [];
    itens.forEach((i, k) => {
      if (cadastros.length && !cadastros.includes(i.cadastro)) return;
      if (categorias.length && !categorias.includes(i.categoria)) return;
      if (depositos.length && !i.depositos.split(", ").some((d) => depositos.includes(d))) return;
      if (buscaAdiada && !casaBusca(textoBusca[k], buscaAdiada)) return;
      r.push(i);
    });
    return r;
  }, [itens, textoBusca, buscaAdiada, cadastros, categorias, depositos]);

  const visiveis = useMemo(() => {
    const r = recorte.filter((i) => situacao === "vinculado" ? !!i.usadoEm : situacao === "todos" || i.situacao === situacao);
    const peso = { Zerado: 0, "Abaixo do mínimo": 1, OK: 2 };
    const cmp: Record<Ordem, (a: ItemAlmox, b: ItemAlmox) => number> = {
      situacao: (a, b) => peso[a.situacao] - peso[b.situacao] || a.descricao.localeCompare(b.descricao, "pt-BR"),
      descricao: (a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"),
      estoque: (a, b) => b.estoque - a.estoque,
      valor: (a, b) => b.valor - a.valor,
    };
    return r.sort(cmp[ordem]);
  }, [recorte, situacao, ordem]);

  const listaRef = useRef<HTMLDivElement>(null);
  const [margem, setMargem] = useState(0);
  // a altura do que fica acima da lista muda com o tamanho da tela (celular girado, janela redimensionada)
  useLayoutEffect(() => {
    const medir = () => setMargem(listaRef.current?.offsetTop ?? 0);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  const virt = useWindowVirtualizer({ count: visiveis.length, estimateSize: () => 150, overscan: 6, scrollMargin: margem });

  const n = (s: string) => recorte.filter((i) => i.situacao === s).length;
  const pilulas = [
    { valor: "todos" as const, rotulo: "Todos", n: recorte.length },
    { valor: "Abaixo do mínimo" as const, rotulo: "Abaixo do mínimo", n: n("Abaixo do mínimo") },
    { valor: "Zerado" as const, rotulo: "Zerados", n: n("Zerado") },
    { valor: "OK" as const, rotulo: "OK", n: n("OK") },
    { valor: "vinculado" as const, rotulo: "Peça de equipamento", n: recorte.filter((i) => i.usadoEm).length },
  ];
  const filtros = (
    <div className="flex flex-wrap gap-2">
      <MultiEscolha rotulo="Cadastro Sysmat" opcoes={opCadastro} valor={cadastros} aoMudar={setCadastros} />
      <MultiEscolha rotulo="Categoria" opcoes={opCategoria} valor={categorias} aoMudar={setCategorias} />
      <MultiEscolha rotulo="Depósito" opcoes={opDeposito} valor={depositos} aoMudar={setDepositos} />
    </div>
  );
  const ordenar = (id: string) => (
    <div className="flex items-center gap-2 text-sm">
      <label className="text-texto-3" htmlFor={id}>Ordenar</label>
      <select id={id} value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}
        className="h-11 rounded-lg border border-borda bg-superficie px-2 text-sm focus:border-[var(--acao)] lg:h-9">
        <option value="situacao">Situação</option><option value="descricao">Descrição</option>
        <option value="estoque">Maior estoque</option><option value="valor">Maior valor</option>
      </select>
      <button onClick={() => baixarCsv(visiveis)} className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-borda bg-superficie px-3 font-medium text-texto-2 hover:text-texto lg:h-9">
        <Download className="size-4" /> Excel (CSV)
      </button>
    </div>
  );
  const aoSalvar = useCallback((material: string, minimo: number | null) => {
    setItens((atual) => atual.map((i) => {
      if (i.material !== material) return i;
      const situacao = i.estoque <= 0 ? "Zerado" : minimo !== null && i.estoque < minimo ? "Abaixo do mínimo" : "OK";
      return { ...i, minimo, situacao };
    }));
    setAberto((a) => (a && a.material === material ? { ...a, minimo } : a));
  }, []);
  const aoFoto = useCallback((material: string, foto: string) => {
    setItens((atual) => atual.map((i) => (i.material === material ? { ...i, foto } : i)));
    setAberto((a) => (a && a.material === material ? { ...a, foto } : a));
  }, []);

  return (
    <div className="space-y-4">
      {/* busca e filtros rápidos ficam presos no topo, logo abaixo do cabeçalho verde do celular */}
      <div className="sticky top-[68px] z-20 -mx-4 space-y-3 border-b border-borda bg-fundo/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:top-0">
        <div className="flex flex-col gap-3 lg:flex-row">
          <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar por código, descrição, Descr Completa, fabricante, referência…" />
          <div className="hidden lg:block">{filtros}</div>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Pilulas opcoes={pilulas} valor={situacao} aoMudar={setSituacao} />
          <div className="hidden lg:block">{ordenar("ordem")}</div>
        </div>
      </div>
      <div className="flex flex-col gap-3 lg:hidden">
        {filtros}
        {ordenar("ordem-celular")}
      </div>

      <p className="text-[13px] text-texto-3"><span className="num font-semibold text-texto">{inteiro(visiveis.length)}</span> material(is) — todos numa rolagem só, sem limite. Toque num item para ver a visão geral, a ficha técnica e a foto (qualquer pessoa pode pôr ou trocar a foto){edita ? " e ajustar o mínimo" : ""}.</p>

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
        {aberto && <Detalhe it={aberto} edita={edita} aoSalvar={aoSalvar} aoFoto={aoFoto} />}
      </Gaveta>
    </div>
  );
}

/** A foto do material na visão geral: qualquer pessoa com acesso ao Estoque tira ou escolhe uma e envia. */
function FotoMaterial({ it, aoFoto }: { it: ItemAlmox; aoFoto: (m: string, foto: string) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<{ enviando: boolean; erro: string; ok: string }>({ enviando: false, erro: "", ok: "" });
  const [falhou, setFalhou] = useState(false);
  const url = urlFoto(it);
  const tem = !!url && !falhou;
  const enviar = async (alvo: HTMLInputElement) => {
    const arquivo = alvo.files?.[0];
    if (!arquivo) return;
    setEstado({ enviando: true, erro: "", ok: "" });
    try {
      const { foto, mini } = await prepararFoto(arquivo);
      const corpo = new FormData();
      corpo.set("material", it.material);
      corpo.set("foto", foto, "foto.jpg");
      if (mini) corpo.set("mini", mini, "mini.jpg");
      const r = await fetch("/api/estoque/foto", { method: "POST", body: corpo });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro || "Não foi possível enviar a foto.");
      setFalhou(false);
      aoFoto(it.material, j.foto);
      setEstado({ enviando: false, erro: "", ok: "Foto enviada." });
    } catch (e) {
      setEstado({ enviando: false, erro: (e as Error).message, ok: "" });
    } finally {
      alvo.value = "";
    }
  };
  const botao = (rotulo: string, icone: React.ReactNode, principal: boolean, abrir: () => void) => (
    <button type="button" onClick={abrir} disabled={estado.enviando} aria-busy={estado.enviando}
      className={clsx(principal ? BOTAO_PRIMARIO : BOTAO_SECUNDARIO, "flex-1")}>
      {estado.enviando && principal ? <LoaderCircle className="size-4 animate-spin" /> : icone}
      {estado.enviando && principal ? "Enviando…" : rotulo}
    </button>
  );
  return (
    <section className="space-y-3">
      <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl border border-borda bg-superficie-2">
        {tem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Foto do material ${it.material}`} className="size-full bg-white object-contain" onError={() => setFalhou(true)} />
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 text-center text-[13.5px] text-texto-3">
            <ImageOff className="size-7" aria-hidden />
            Este material ainda não tem foto.
          </div>
        )}
      </div>
      {/* dois campos: com "capture" o celular abre direto a câmera; sem ele, deixa escolher da galeria */}
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => enviar(e.currentTarget)} />
      <input ref={galeria} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden
        onChange={(e) => enviar(e.currentTarget)} />
      <div className="flex flex-wrap gap-2">
        {botao(tem ? "Nova foto" : "Tirar foto", <Camera className="size-4" />, true, () => camera.current?.click())}
        {botao("Da galeria", <ImagePlus className="size-4" />, false, () => galeria.current?.click())}
      </div>
      <p aria-live="polite" className={clsx("text-sm", estado.ok ? "text-[var(--selo-bom-texto)]" : "sr-only")}>{estado.ok}</p>
      {estado.erro && <p role="alert" className="rounded-lg bg-[var(--selo-critico-fundo)] px-3 py-2 text-sm text-[var(--selo-critico-texto)]">{estado.erro}</p>}
    </section>
  );
}

function Detalhe({ it, edita, aoSalvar, aoFoto }: { it: ItemAlmox; edita: boolean; aoSalvar: (m: string, v: number | null) => void;
  aoFoto: (m: string, foto: string) => void }) {
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
      <FotoMaterial key={it.material} it={it} aoFoto={aoFoto} />
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
              className="num h-11 w-40 rounded-xl border border-borda bg-superficie px-3 focus:border-[var(--acao)]" />
            <button onClick={salvar} disabled={estado.gravando} className={BOTAO_PRIMARIO}>
              {estado.gravando ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar
            </button>
          </div>
          {estado.msg && <p className={clsx("mt-2 rounded-lg px-3 py-2 text-sm", estado.erro ? "bg-[var(--selo-critico-fundo)] text-[var(--selo-critico-texto)]" : "bg-[var(--selo-bom-fundo)] text-[var(--selo-bom-texto)]")}>{estado.msg}</p>}
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
