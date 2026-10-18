"use client";

import clsx from "clsx";
import { Check, Link2Off, LoaderCircle, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";
import * as ativos from "@/lib/wcm/ativos";

import { buscarMateriais, salvarEquipamento, sugestaoSap } from "./acoes";
import { CATEGORIAS, CRITICIDADES, type FormCadastro, type SituacaoPeca } from "./logica";
import { SeloPeca } from "./SeloPeca";

const ENTRADA = "h-10 w-full rounded-xl border border-borda bg-superficie-2 px-3 text-[14px] outline-none transition placeholder:text-texto-4 focus:border-marca-500 focus:bg-superficie focus:ring-4 focus:ring-marca-500/12";

function Rotulo({ texto, dica, children, className }: { texto: string; dica?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={clsx("block min-w-0", className)}>
      <span className="mb-1 block text-[12.5px] font-medium text-texto-2" title={dica}>{texto}</span>
      {children}
      {dica && <span className="mt-1 block text-[11.5px] leading-snug text-texto-3">{dica}</span>}
    </label>
  );
}

/** Formulário de novo equipamento / edição. */
export function FormEquipamento({ inicial, editando, vinculados, anoMax, voltar }: {
  inicial: FormCadastro; editando: string | null; vinculados: SituacaoPeca[]; anoMax: number; voltar: string;
}) {
  const router = useRouter();
  const [f, setF] = useState<FormCadastro>(inicial);
  const [pecas, setPecas] = useState<SituacaoPeca[]>(vinculados);
  const [erro, setErro] = useState("");
  const [salvando, iniciar] = useTransition();
  const [busca, setBusca] = useState("");
  const [cand, setCand] = useState<{ itens: SituacaoPeca[]; total: number; semBase: boolean } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mudar = <K extends keyof FormCadastro>(k: K, v: FormCadastro[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (espera.current) clearTimeout(espera.current);
    let vivo = true;
    espera.current = setTimeout(async () => {
      setBuscando(true);
      const r = await buscarMateriais(busca);
      if (vivo) { setCand(r); setBuscando(false); }
    }, busca ? 300 : 0);
    return () => { vivo = false; if (espera.current) clearTimeout(espera.current); };
  }, [busca]);

  const vinculado = new Set(pecas.map((p) => p.codigo));
  const alternar = (p: SituacaoPeca) => setPecas((xs) => (xs.some((x) => x.codigo === p.codigo) ? xs.filter((x) => x.codigo !== p.codigo) : [...xs, p]));

  async function sugerir() {
    const tag = f.tag.trim().toUpperCase();
    if (!tag || f.nome.trim()) return;
    const s = await sugestaoSap(tag);
    if (s?.nome) setF((x) => (x.nome.trim() ? x : { ...x, nome: s.nome }));
  }

  function salvar() {
    setErro("");
    iniciar(async () => {
      const r = await salvarEquipamento({ ...f, materiais: pecas.map((p) => p.codigo) }, editando);
      if ("erro" in r) { setErro(r.erro); return; }
      router.push(voltar, { scroll: false });
      router.refresh();
    });
  }

  return (
    <div id="form" className="scroll-mt-24 rounded-cartao border border-borda-forte bg-superficie p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-alp-azul">{editando ? "Editar equipamento" : "Novo equipamento"}</div>
          <div className="mt-1 font-display text-[20px] font-medium">{editando ? `${editando} · ${inicial.nome}` : "Cadastro do equipamento"}</div>
        </div>
        <button onClick={() => router.push(voltar, { scroll: false })} aria-label="Fechar" className="grid size-9 place-items-center rounded-xl text-texto-3 hover:bg-superficie-2"><X className="size-5" /></button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.1fr_1.8fr_1fr_1fr]">
        <Rotulo texto="TAG (obrigatório)" dica="Código do equipamento no SAP (IW38/IH08) ou uma TAG própria. Sendo do SAP, o nome é sugerido.">
          <input className={ENTRADA} value={f.tag} maxLength={60} placeholder="Ex: MT-102" onChange={(e) => mudar("tag", e.target.value)} onBlur={sugerir} />
        </Rotulo>
        <Rotulo texto="Nome (obrigatório)"><input className={ENTRADA} value={f.nome} maxLength={160} placeholder="Ex: Motor bomba centrífuga" onChange={(e) => mudar("nome", e.target.value)} /></Rotulo>
        <Rotulo texto="Categoria">
          <select className={ENTRADA} value={f.categoria} onChange={(e) => mudar("categoria", e.target.value)}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select>
        </Rotulo>
        <Rotulo texto="Criticidade">
          <select className={ENTRADA} value={f.criticidade} onChange={(e) => mudar("criticidade", e.target.value)}>{CRITICIDADES.map((c) => <option key={c}>{c}</option>)}</select>
        </Rotulo>
      </div>

      <div className="mb-3 mt-6 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-texto-3">Gestão do ativo · situação e ciclo de vida</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Rotulo texto="Situação">
          <select className={ENTRADA} value={f.situacao} onChange={(e) => mudar("situacao", e.target.value)}>{ativos.SITUACOES.map((c) => <option key={c}>{c}</option>)}</select>
        </Rotulo>
        <Rotulo texto="Fabricante"><input className={ENTRADA} value={f.fabricante} maxLength={80} onChange={(e) => mudar("fabricante", e.target.value)} /></Rotulo>
        <Rotulo texto="Modelo"><input className={ENTRADA} value={f.modelo} maxLength={80} onChange={(e) => mudar("modelo", e.target.value)} /></Rotulo>
        <Rotulo texto="Nº de série"><input className={ENTRADA} value={f.serie} maxLength={60} onChange={(e) => mudar("serie", e.target.value)} /></Rotulo>
        <Rotulo texto="Ano de instalação">
          <input className={ENTRADA} type="number" min={1900} max={anoMax} step={1} placeholder="Ex: 2015" value={f.ano_instalacao ?? ""} onChange={(e) => mudar("ano_instalacao", e.target.value || null)} />
        </Rotulo>
        <Rotulo texto="Vida útil (anos)" dica="Com o ano de instalação, a gestão de ativos avisa o fim da vida útil.">
          <input className={ENTRADA} type="number" min={1} max={100} step={1} placeholder="Ex: 20" value={f.vida_util ?? ""} onChange={(e) => mudar("vida_util", e.target.value || null)} />
        </Rotulo>
        <Rotulo texto="Garantia até"><input className={ENTRADA} type="date" value={f.garantia_ate ?? ""} onChange={(e) => mudar("garantia_ate", e.target.value || null)} /></Rotulo>
        <Rotulo texto="Valor de reposição (R$)" dica={`Custo de um equipamento novo. Custo de manutenção em 12 meses acima de ${ativos.LIMITE_SUBSTITUICAO * 100}% dele = avaliar substituição.`}>
          <input className={ENTRADA} type="number" min={0} step={100} placeholder="Ex: 85000" value={f.valor_reposicao ?? ""} onChange={(e) => mudar("valor_reposicao", e.target.value || null)} />
        </Rotulo>
      </div>
      <Rotulo texto="Visão geral" className="mt-4">
        <textarea className={clsx(ENTRADA, "h-20 py-2")} maxLength={2000} value={f.observacoes} placeholder="Função do equipamento, observações gerais de manutenção…" onChange={(e) => mudar("observacoes", e.target.value)} />
      </Rotulo>

      <div className="mb-3 mt-6 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-texto-3">Componentes vinculados (base de material)</div>
      {cand?.semBase ? <p className="text-[13px] text-texto-3">Envie o export do <b>MB52</b> em Fontes de dados para vincular componentes.</p> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-3" />
              <input className={clsx(ENTRADA, "pl-9")} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar código ou descrição…" />
              {buscando && <LoaderCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-texto-3" />}
            </label>
            <ul className="mt-2 h-56 overflow-y-auto rounded-xl border border-borda">
              {cand && !cand.itens.length && <li className="px-3 py-3 text-[13px] text-texto-3">Nenhum item encontrado.</li>}
              {cand?.itens.map((p) => {
                const on = vinculado.has(p.codigo);
                return (
                  <li key={p.codigo}>
                    <button type="button" onClick={() => alternar(p)} aria-pressed={on}
                      className="flex w-full items-center gap-2.5 border-b border-borda px-3 py-2 text-left text-[13px] last:border-b-0 hover:bg-superficie-2">
                      <span className={clsx("grid size-4 shrink-0 place-items-center rounded border", on ? "border-marca-500 bg-marca-500 text-white" : "border-borda")}>{on && <Check className="size-3" />}</span>
                      <span className="font-mono text-[12.5px] text-alp-azul">{p.codigo}</span>
                      <span className="min-w-0 flex-1 truncate">{p.descricao}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {cand && cand.total > cand.itens.length && <p className="mt-1.5 text-[12px] text-texto-3">Mostrando {cand.itens.length} de {cand.total.toLocaleString("pt-BR")} materiais — refine a busca.</p>}
          </div>
          <div className="min-w-0">
            <div className="mb-2 text-[12.5px] font-medium text-texto-2">Vinculados ({pecas.length})</div>
            {!pecas.length ? <p className="rounded-xl border border-dashed border-borda px-3 py-6 text-center text-[13px] text-texto-3">Nenhum componente vinculado. Marque na busca ao lado.</p> : (
              <ul className="max-h-64 divide-y divide-borda overflow-y-auto rounded-xl border border-borda">
                {pecas.map((p) => (
                  <li key={p.codigo} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-[12.5px] text-alp-azul">{p.codigo}</span><SeloPeca p={p} /></div>
                      <div className="truncate text-texto-2">{p.descricao || "—"}</div>
                    </div>
                    <button type="button" onClick={() => alternar(p)} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-texto-3 hover:bg-superficie-2 hover:text-texto">
                      <Link2Off className="size-3.5" /> Desvincular
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {erro && <div className="mt-5"><Mensagem>{erro}</Mensagem></div>}
      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={salvar} disabled={salvando} className={BOTAO_PRIMARIO}>
          {salvando ? <LoaderCircle className="size-4 animate-spin" /> : editando ? <Check className="size-4" /> : <Plus className="size-4" />} Salvar equipamento
        </button>
        <button onClick={() => router.push(voltar, { scroll: false })} className={BOTAO_SECUNDARIO}>Cancelar</button>
      </div>
    </div>
  );
}
