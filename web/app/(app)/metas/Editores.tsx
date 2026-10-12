"use client";

import clsx from "clsx";
import { LoaderCircle, RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";

import { restaurarMetas, salvarCapacidades, salvarJornada, salvarMetas, salvarTipos, type Resposta } from "./acoes";

/** Editores da aba Metas e parâmetros: tabelas com a coluna editável, contagem do que mudou e "Salvar". */

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const mostrar = (v: number | null | undefined) => (v == null ? "" : nf.format(v));
/** "4,5" / "1.234,5" / "" → número | null; texto inválido → NaN. */
function ler(t: string): number | null {
  const s = t.trim().replace(/\s/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}
const igual = (a: number | null, b: number | null) => (a == null ? b == null : b != null && Math.abs(a - b) < 1e-9);

const CAMPO = "h-9 w-full min-w-[90px] rounded-lg border border-borda bg-superficie-2 px-2.5 text-[13px] tabular-nums outline-none transition focus:border-marca-500 focus:bg-superficie focus:ring-4 focus:ring-marca-500/12 disabled:border-transparent disabled:bg-transparent";
const CELULA = `${CAMPO} text-right`;
const TH = "whitespace-nowrap px-3 py-2 font-medium";

function useSalvar() {
  const router = useRouter();
  const [pend, iniciar] = useTransition();
  const [msg, setMsg] = useState<Resposta | null>(null);
  const rodar = (fn: () => Promise<Resposta>, depois?: () => void) => iniciar(async () => {
    const r = await fn();
    setMsg(r);
    if (!r.erro) { depois?.(); router.refresh(); }
  });
  return { pend, msg, rodar };
}

function Botoes({ n, pend, aoSalvar, rotulo, invalido, extra }: { n: number; pend: boolean; aoSalvar: () => void; rotulo: string; invalido?: boolean; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={BOTAO_PRIMARIO} disabled={!n || pend || invalido} onClick={aoSalvar}>
        {pend ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} {rotulo} ({n})
      </button>
      {extra}
      {invalido && <span className="text-[12.5px] text-[var(--st-critico)]">Há valores inválidos (use números ≥ 0).</span>}
    </div>
  );
}

// ----------------------------------------------------------------------------
export interface LinhaMeta { id: string; grupo: string; nome: string; unidade: string; sentido: string; padrao: number | null; meta: number | null; formula: string }

export function EditorMetas({ linhas, edita, personalizadas }: { linhas: LinhaMeta[]; edita: boolean; personalizadas: number }) {
  const [txt, setTxt] = useState<Record<string, string>>({});
  const { pend, msg, rodar } = useSalvar();
  const mud = useMemo(() => Object.fromEntries(linhas.filter((l) => l.id in txt && !igual(ler(txt[l.id]), l.meta)).map((l) => [l.id, ler(txt[l.id])])), [txt, linhas]);
  const invalido = Object.values(mud).some((v) => v != null && Number.isNaN(v));
  const grupos = [...new Set(linhas.map((l) => l.grupo))];
  return (
    <div className="space-y-4">
      {edita && (
        <Botoes n={Object.keys(mud).length} pend={pend} invalido={invalido} rotulo="Salvar metas" aoSalvar={() => rodar(() => salvarMetas(mud), () => setTxt({}))}
          extra={personalizadas > 0 && (
            <button className={BOTAO_SECUNDARIO} disabled={pend} onClick={() => { if (confirm("Voltar todas as metas ao padrão?")) rodar(restaurarMetas, () => setTxt({})); }}>
              <RotateCcw className="size-4" /> Voltar às metas padrão
            </button>
          )} />
      )}
      {msg && <Mensagem tipo={msg.erro ? "erro" : "ok"}>{msg.erro || msg.ok}</Mensagem>}
      <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="bg-superficie-2 text-[11.5px] text-texto-3">
            <tr><th className={TH}>Indicador</th><th className={TH}>Unidade</th><th className={TH}>Sentido</th>
              <th className={clsx(TH, "text-right")}>Meta padrão</th><th className={clsx(TH, "w-36 text-right")}>Meta</th><th className={TH}>Fórmula</th></tr>
          </thead>
          {grupos.map((g) => (
            <tbody key={g} className="divide-borda divide-y border-t border-borda">
              <tr><td colSpan={6} className="bg-superficie-2/50 px-3 pb-1.5 pt-3 font-display text-[13.5px] font-medium">{g}</td></tr>
              {linhas.filter((l) => l.grupo === g).map((l) => {
                const v = txt[l.id] ?? mostrar(l.meta);
                const mudou = l.id in mud;
                return (
                  <tr key={l.id} className={mudou ? "bg-marca-500/5" : undefined}>
                    <td className="min-w-[190px] px-3 py-1.5 font-medium">{l.nome}</td>
                    <td className="px-3 py-1.5 text-texto-2">{l.unidade}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-texto-2">{l.sentido}</td>
                    <td className="num px-3 py-1.5 text-right tabular-nums text-texto-3">{l.padrao == null ? "—" : mostrar(l.padrao)}</td>
                    <td className="px-3 py-1.5">
                      <input aria-label={`Meta de ${l.nome}`} className={clsx(CELULA, mudou && "border-marca-500")} disabled={!edita} inputMode="decimal"
                        placeholder="sem meta" value={v} onChange={(e) => setTxt({ ...txt, [l.id]: e.target.value })} />
                    </td>
                    <td className="min-w-[260px] px-3 py-1.5 text-[12px] leading-snug text-texto-3">{l.formula}</td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
export function EditorJornada({ horas, edita }: { horas: number; edita: boolean }) {
  const [txt, setTxt] = useState(mostrar(horas));
  const { pend, msg, rodar } = useSalvar();
  const v = ler(txt);
  const valido = v != null && !Number.isNaN(v) && v >= 1 && v <= 80;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-texto-2">Horas por semana</span>
          <input className={clsx(CAMPO, "text-right", "h-11 text-[15px]")} style={{ width: 128 }} inputMode="decimal" disabled={!edita} value={txt} onChange={(e) => setTxt(e.target.value)} />
        </label>
        {edita && (
          <button className={BOTAO_PRIMARIO} disabled={pend || !valido || igual(v, horas)} onClick={() => rodar(() => salvarJornada(v!))}>
            {pend ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar jornada
          </button>
        )}
        {!valido && <span className="pb-3 text-[12.5px] text-[var(--st-critico)]">Entre 1 e 80 horas.</span>}
      </div>
      {msg && <Mensagem tipo={msg.erro ? "erro" : "ok"}>{msg.erro || msg.ok}</Mensagem>}
    </div>
  );
}

// ----------------------------------------------------------------------------
export interface LinhaCapacidade { centro: string; tecnicos: number; sugestao: number | null; media: number | null; configurada: number | null }

export function EditorCapacidade({ linhas, edita }: { linhas: LinhaCapacidade[]; edita: boolean }) {
  const [txt, setTxt] = useState<Record<string, string>>({});
  const { pend, msg, rodar } = useSalvar();
  const mud = useMemo(() => Object.fromEntries(linhas.filter((l) => l.centro in txt && !igual(ler(txt[l.centro]), l.configurada))
    .map((l) => [l.centro, ler(txt[l.centro])])), [txt, linhas]);
  const invalido = Object.values(mud).some((v) => v != null && Number.isNaN(v));
  const max = Math.max(1, ...linhas.map((l) => Math.max(l.media ?? 0, l.configurada ?? 0, l.sugestao ?? 0)));
  return (
    <div className="space-y-4">
      {edita && <Botoes n={Object.keys(mud).length} pend={pend} invalido={invalido} rotulo="Salvar capacidades" aoSalvar={() => rodar(() => salvarCapacidades(mud), () => setTxt({}))} />}
      {msg && <Mensagem tipo={msg.erro ? "erro" : "ok"}>{msg.erro || msg.ok}</Mensagem>}
      <div className="max-h-[560px] overflow-auto rounded-cartao border border-borda bg-superficie">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead className="sticky top-0 z-[1] bg-superficie-2 text-[11.5px] text-texto-3">
            <tr><th className={TH}>Centro de trabalho</th><th className={clsx(TH, "text-right")}>Técnicos (Gestão de HH)</th>
              <th className={clsx(TH, "text-right")} title="Técnicos do centro × jornada semanal">Sugestão (técnicos × jornada)</th>
              <th className={TH} title="Média semanal de HH apontadas nas últimas 12 semanas">Média apontada (12 sem)</th>
              <th className={clsx(TH, "w-36 text-right")}>Capacidade configurada</th></tr>
          </thead>
          <tbody className="divide-borda divide-y">
            {linhas.map((l) => {
              const mudou = l.centro in mud;
              return (
                <tr key={l.centro} className={mudou ? "bg-marca-500/5" : undefined}>
                  <td className="whitespace-nowrap px-3 py-1.5 font-medium">{l.centro}</td>
                  <td className="num px-3 py-1.5 text-right tabular-nums">{l.tecnicos || "—"}</td>
                  <td className="num px-3 py-1.5 text-right tabular-nums">{l.sugestao == null ? "—" : nf.format(Math.round(l.sugestao))}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex min-w-[150px] items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-superficie-3">
                        <div className="h-full rounded-full bg-[var(--serie-1)]" style={{ width: `${((l.media ?? 0) / max) * 100}%` }} />
                      </div>
                      <span className="num w-14 shrink-0 text-right tabular-nums">{l.media == null ? "—" : `${nf.format(Math.round(l.media))} h`}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <input aria-label={`Capacidade de ${l.centro}`} className={clsx(CELULA, mudou && "border-marca-500")} disabled={!edita} inputMode="decimal"
                      placeholder="usa a média" value={txt[l.centro] ?? mostrar(l.configurada)} onChange={(e) => setTxt({ ...txt, [l.centro]: e.target.value })} />
                  </td>
                </tr>
              );
            })}
            {!linhas.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-texto-3">Nenhum centro de trabalho nas bases.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
export interface LinhaTipo { codigo: string; descricao: string; classe: string; deduzida: string; ordens: number }

export function EditorTipos({ linhas, classes, edita }: { linhas: LinhaTipo[]; classes: string[]; edita: boolean }) {
  const [ed, setEd] = useState<Record<string, { descricao: string; classe: string }>>({});
  const { pend, msg, rodar } = useSalvar();
  const mud = useMemo(() => Object.fromEntries(linhas.filter((l) => ed[l.codigo] && (ed[l.codigo].descricao !== l.descricao || ed[l.codigo].classe !== l.classe))
    .map((l) => [l.codigo, ed[l.codigo]])), [ed, linhas]);
  const mudar = (l: LinhaTipo, campo: "descricao" | "classe", v: string) =>
    setEd({ ...ed, [l.codigo]: { descricao: ed[l.codigo]?.descricao ?? l.descricao, classe: ed[l.codigo]?.classe ?? l.classe, [campo]: v } });
  return (
    <div className="space-y-4">
      {edita && <Botoes n={Object.keys(mud).length} pend={pend} rotulo="Salvar tipos" aoSalvar={() => rodar(() => salvarTipos(mud), () => setEd({}))} />}
      {msg && <Mensagem tipo={msg.erro ? "erro" : "ok"}>{msg.erro || msg.ok}</Mensagem>}
      <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead className="bg-superficie-2 text-[11.5px] text-texto-3">
            <tr><th className={TH}>Código</th><th className={TH}>Descrição</th><th className={TH} title="Vazio = usa a classe deduzida">Classe</th>
              <th className={TH}>Classe deduzida</th><th className={clsx(TH, "text-right")}>Ordens no IW38</th></tr>
          </thead>
          <tbody className="divide-borda divide-y">
            {linhas.map((l) => {
              const atual = ed[l.codigo] ?? l;
              const mudou = l.codigo in mud;
              return (
                <tr key={l.codigo} className={mudou ? "bg-marca-500/5" : undefined}>
                  <td className="px-3 py-1.5 font-mono text-[12px]">{l.codigo}</td>
                  <td className="px-3 py-1.5">
                    <input aria-label={`Descrição de ${l.codigo}`} className={clsx(CAMPO, "min-w-[220px]")} disabled={!edita} value={atual.descricao}
                      onChange={(e) => mudar(l, "descricao", e.target.value)} />
                  </td>
                  <td className="px-3 py-1.5">
                    <select aria-label={`Classe de ${l.codigo}`} className={clsx(CAMPO, "min-w-[180px]")} disabled={!edita} value={atual.classe}
                      onChange={(e) => mudar(l, "classe", e.target.value)}>
                      <option value="">(deduzida)</option>
                      {classes.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-texto-2">{l.deduzida || "—"}</td>
                  <td className="num px-3 py-1.5 text-right tabular-nums">{nf.format(l.ordens)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
