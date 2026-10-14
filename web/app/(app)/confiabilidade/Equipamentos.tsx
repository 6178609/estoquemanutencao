"use client";

import clsx from "clsx";
import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { MultiEscolha } from "@/components/Filtros";
import { Gaveta } from "@/components/Gaveta";
import { Selo } from "@/components/ui";

import { TabelaDados, type Celula, type Coluna } from "./_comum/TabelaDados";

/** Tabela "Confiabilidade por equipamento" com filtros (criticidade, só reincidentes) e a gaveta de histórico. */
export const COLUNAS_EQUIP: Coluna[] = [
  { rotulo: "Campo de ordenação" }, { rotulo: "Código", formato: "codigo" }, { rotulo: "Equipamento", largo: true }, { rotulo: "Criticidade" }, { rotulo: "ABC" },
  { rotulo: "Área" }, { rotulo: "Quebras", formato: "inteiro" }, { rotulo: "Reincidências", formato: "inteiro" },
  { rotulo: "MTBF (dias)", formato: "inteiro", dica: "Dias do período ÷ quebras do equipamento" },
  { rotulo: "MTTR (h)", formato: "num1", dica: "Média das horas de reparo das quebras" }, { rotulo: "Horas de reparo", formato: "num1" },
  { rotulo: "Ordens no período", formato: "inteiro" }, { rotulo: "Custo no período", formato: "R$" }, { rotulo: "Última quebra", formato: "data" },
  { rotulo: "Local", largo: true },
];
const COLUNAS_HIST: Coluna[] = [
  { rotulo: "Nota", formato: "codigo" }, { rotulo: "Data", formato: "data" }, { rotulo: "Tipo" }, { rotulo: "Descrição", largo: true },
  { rotulo: "Ordem", formato: "codigo" }, { rotulo: "Horas de reparo", formato: "num1" }, { rotulo: "Dias desde a anterior", formato: "inteiro" },
  { rotulo: "Reincidente" }, { rotulo: "Notificador" },
];
const CRIT = ["Alta", "Média", "Baixa"];
/** Posição de cada coluna da linha (a ordem é a de COLUNAS_EQUIP). */
const I = { campo: 0, codigo: 1, nome: 2, criticidade: 3, abc: 4, area: 5, quebras: 6, reincidencias: 7, mtbf: 8, mttr: 9,
  reparo: 10, ordens: 11, custo: 12, ultima: 13, local: 14 } as const;

export function Equipamentos({ linhas }: { linhas: Celula[][] }) {
  const [crit, setCrit] = useState<string[]>([]);
  const [soReinc, setSoReinc] = useState(false);
  const [sel, setSel] = useState<Celula[] | null>(null);
  const [hist, setHist] = useState<{ eq: string; linhas: Celula[][] | null; erro?: string } | null>(null);
  const maxQ = useMemo(() => Math.max(1, ...linhas.map((l) => Number(l[I.quebras]) || 0)), [linhas]);
  const vis = useMemo(() => linhas.filter((l) => (!crit.length || crit.includes(String(l[I.criticidade]))) && (!soReinc || Number(l[I.reincidencias]) > 0)), [linhas, crit, soReinc]);
  const colunas = useMemo(() => COLUNAS_EQUIP.map((c) => (c.rotulo === "Quebras" ? { ...c, barra: maxQ } : c)), [maxQ]);

  async function abrir(l: Celula[]) {
    setSel(l);
    const eq = String(l[I.codigo]);
    setHist({ eq, linhas: null });
    try {
      const p = new URLSearchParams(window.location.search);
      p.set("eq", eq);
      const r = await fetch(`/api/confiabilidade?${p.toString()}`);
      const j = await r.json();
      setHist({ eq, linhas: r.ok ? j.linhas : [], erro: r.ok ? undefined : j.erro || "Falha ao buscar o histórico." });
    } catch {
      setHist({ eq, linhas: [], erro: "Falha ao buscar o histórico." });
    }
  }

  return (
    <>
      <TabelaDados colunas={colunas} linhas={vis} busca="Buscar equipamento: código, nome ou local…" baixar="confiabilidade_equipamentos"
        aoSelecionar={abrir} selecionada={sel?.[0]} limite={500}
        filtroExterno={(
          <>
            <MultiEscolha rotulo="Criticidade" opcoes={CRIT.map((c) => ({ valor: c, n: linhas.filter((l) => l[I.criticidade] === c).length }))} valor={crit} aoMudar={setCrit} />
            <button onClick={() => setSoReinc(!soReinc)} aria-pressed={soReinc}
              className={clsx("h-11 rounded-xl border px-3.5 text-[13.5px] transition", soReinc
                ? "border-marca-300 bg-marca-50 font-medium text-marca-700 dark:bg-marca-900/30 dark:text-marca-200" : "border-borda bg-superficie-2 text-texto-2 hover:text-texto")}>
              Só com reincidência
            </button>
          </>
        )} />
      <Gaveta aberta={!!sel} aoFechar={() => { setSel(null); setHist(null); }}
        titulo={sel ? `${sel[I.campo] ? `${sel[I.campo]} · ` : ""}${sel[I.codigo]} · ${sel[I.nome] || ""}` : ""}
        subtitulo={sel ? `${sel[I.criticidade] || "Sem criticidade"} · ${sel[I.area] || "sem área"} · ${sel[I.local] || ""}` : undefined}>
        {sel && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {([["Campo de ordenação", sel[I.campo] || "—"], ["Quebras", sel[I.quebras]], ["Reincidências", sel[I.reincidencias]],
                ["MTBF", sel[I.mtbf] == null ? "—" : `${Math.round(Number(sel[I.mtbf]))} d`],
                ["MTTR", sel[I.mttr] == null ? "—" : `${Number(sel[I.mttr]).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`]] as [string, Celula][]).map(([r, v]) => (
                <div key={r} className="rounded-xl border border-borda p-3">
                  <div className="text-[12px] text-texto-3">{r}</div>
                  <div className="num mt-1 font-display text-[20px] font-medium">{v ?? "—"}</div>
                </div>
              ))}
            </div>
            <Link href={`/equipamentos?eq=${encodeURIComponent(String(sel[I.codigo]))}`}
              className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-texto-2 hover:text-texto">
              Abrir a ficha do equipamento <ArrowRight className="size-4" />
            </Link>
            <div>
              <div className="mb-2 flex items-center gap-2 font-display text-[15px] font-medium">
                Quebras do equipamento <Selo>todas as datas</Selo>
              </div>
              {hist?.linhas == null ? (
                <p className="flex items-center gap-2 text-[13px] text-texto-3"><LoaderCircle className="size-4 animate-spin" /> Buscando o histórico…</p>
              ) : hist.erro ? <p className="text-[13px] text-texto-3">{hist.erro}</p>
                : <TabelaDados colunas={COLUNAS_HIST} linhas={hist.linhas} alturaMax={520} baixar={`quebras_${hist.eq}`} />}
            </div>
          </>
        )}
      </Gaveta>
    </>
  );
}
