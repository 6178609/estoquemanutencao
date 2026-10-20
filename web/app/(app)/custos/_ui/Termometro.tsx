import clsx from "clsx";
import Link from "next/link";

import { brl, brlCurto } from "@/lib/formato";

/** Termômetro: custo de cada dia do mês (ou de cada mês do ano) pela rampa --seq; dias ≤ 0 ficam neutros. */
export interface TermometroProps {
  ano: number;
  mes: number;
  modo: "mensal" | "anual";
  /** custo de cada dia do mês escolhido */
  dias: { dia: number; valor: number }[];
  /** custo dos 12 meses do ano escolhido (janeiro = índice 0) */
  meses: number[];
  /** mesmo mês e ano inteiro do ano anterior — a variação só aparece com base > 0 */
  mesAnterior: number;
  anoAnteriorTotal: number;
  anoAnterior: number;
  /** links: setas (null = fora do intervalo com ordens no IW38), alternância e mês de cada quadrado do ano */
  nav: { ant: string | null; prox: string | null; mensal: string; anual: string; mesHrefs: string[] };
}

const NOMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const FAIXAS = ["var(--seq-2)", "var(--seq-3)", "var(--seq-4)", "var(--seq-5)", "var(--seq-6)"];
const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** Faixa 0–4 por quantil dos valores positivos do conjunto (mesma escala para todos os dias do mês). */
function faixaDe(valores: number[]) {
  const pos = valores.filter((v) => v > 0).sort((a, b) => a - b);
  return (v: number): number | null => {
    if (!(v > 0) || !pos.length) return null;
    let i = 0;
    while (i < pos.length && pos[i] < v) i++;
    return Math.min(4, Math.floor((i * 5) / pos.length));
  };
}

const NEUTRO = { background: "var(--superficie-2)", color: "var(--texto-3)" };
const corDaFaixa = (f: number | null) => (f == null ? NEUTRO : { background: FAIXAS[f], color: f >= 3 ? "var(--tinta-texto)" : "var(--texto)" });

function Variacao({ atual, anterior, rotulo }: { atual: number; anterior: number; rotulo: string }) {
  if (!(anterior > 0)) return null;
  const v = ((atual - anterior) / anterior) * 100;
  return <span className="text-texto-2">{v >= 0 ? "▲" : "▼"} {n0.format(Math.abs(v))}% {rotulo}</span>;
}

function Seta({ href, rotulo, sinal }: { href: string | null; rotulo: string; sinal: string }) {
  const base = "inline-flex size-8 items-center justify-center rounded-md border border-borda text-[18px] leading-none";
  if (!href) return <span aria-hidden className="size-8" />;
  return (
    <Link href={href} prefetch={false} scroll={false} aria-label={rotulo} className={clsx(base, "text-texto-2 hover:bg-superficie-2 hover:text-texto")}>
      {sinal}
    </Link>
  );
}

export function Termometro(p: TermometroProps) {
  const { nav } = p;
  const mensal = p.modo === "mensal";
  const totalMes = p.dias.reduce((s, d) => s + d.valor, 0);
  const totalAno = p.meses.reduce((s, v) => s + v, 0);
  const titulo = mensal ? `${NOMES[p.mes - 1].charAt(0).toUpperCase()}${NOMES[p.mes - 1].slice(1)} de ${p.ano}` : `${p.ano}`;
  const offset = (new Date(Date.UTC(p.ano, p.mes - 1, 1)).getUTCDay() + 6) % 7; // segunda = 0
  const faixaDia = faixaDe(p.dias.map((d) => d.valor));
  const faixaMes = faixaDe(p.meses);

  return (
    <section className="flex min-w-0 flex-col rounded-cartao border border-borda bg-superficie p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[15px] font-medium">Termômetro</div>
          <div className="mt-0.5 text-[12.5px] text-texto-3">{titulo}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-borda p-0.5 text-[12.5px]" role="group" aria-label="Visão">
            <Link href={nav.mensal} prefetch={false} scroll={false} aria-current={mensal ? "page" : undefined}
              className={clsx("rounded px-2.5 py-1", mensal ? "bg-marca-700 text-white" : "text-texto-2 hover:text-texto")}>Mensal</Link>
            <Link href={nav.anual} prefetch={false} scroll={false} aria-current={!mensal ? "page" : undefined}
              className={clsx("rounded px-2.5 py-1", !mensal ? "bg-marca-700 text-white" : "text-texto-2 hover:text-texto")}>Anual</Link>
          </div>
          <Seta href={nav.ant} rotulo={mensal ? "Mês anterior" : "Ano anterior"} sinal="‹" />
          <Seta href={nav.prox} rotulo={mensal ? "Mês seguinte" : "Ano seguinte"} sinal="›" />
        </div>
      </div>

      <div className="mt-4 text-[13px] text-texto-2">
        {mensal ? (
          <>Total do mês <b className="num font-medium text-texto">{brl(totalMes)}</b>{" "}
            <Variacao atual={totalMes} anterior={p.mesAnterior} rotulo={`vs ${NOMES[p.mes - 1]} de ${p.anoAnterior}`} /></>
        ) : (
          <>Total do ano <b className="num font-medium text-texto">{brl(totalAno)}</b>{" "}
            <Variacao atual={totalAno} anterior={p.anoAnteriorTotal} rotulo={`vs ${p.anoAnterior}`} /></>
        )}
      </div>

      {mensal ? (
        <div className="mt-4 grid grid-cols-7 gap-1">
          {SEMANA.map((s) => <div key={s} className="pb-1 text-center text-[10px] font-medium text-texto-3">{s}</div>)}
          {Array.from({ length: offset }, (_, i) => <div key={`v${i}`} />)}
          {p.dias.map((d) => {
            const f = d.valor > 0 ? faixaDia(d.valor) : null;
            return (
              <div key={d.dia} title={`${d.dia} · ${brl(d.valor)}`} style={corDaFaixa(f)}
                className="flex min-h-[3.4rem] min-w-0 flex-col items-center justify-between rounded-md px-0.5 py-1 text-center">
                <span className="text-[10px] font-medium opacity-80">{d.dia}</span>
                <span className="num break-words text-[10px] leading-tight">{d.valor > 0 ? brlCurto(d.valor) : "–"}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {p.meses.map((v, i) => {
            const f = v > 0 ? faixaMes(v) : null;
            return (
              <Link key={CURTO[i]} href={nav.mesHrefs[i]} prefetch={false} scroll={false} style={corDaFaixa(f)} title={`${NOMES[i]} · ${brl(v)}`}
                className="flex min-h-[4.25rem] min-w-0 flex-col items-center justify-between rounded-md px-1 py-2 text-center hover:ring-2 hover:ring-marca-500">
                <span className="text-[11px] font-medium capitalize opacity-80">{CURTO[i]}</span>
                <span className="num break-words text-[11px] leading-tight">{v > 0 ? brlCurto(v) : "–"}</span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-texto-3">
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-sm" style={{ background: "var(--superficie-2)" }} />sem custo</span>
        {FAIXAS.map((f, i) => (
          <span key={f} className="inline-flex items-center gap-1"><span className="size-3 rounded-sm" style={{ background: f }} />{i === 0 ? "menor" : i === 4 ? "maior" : ""}</span>
        ))}
      </div>
    </section>
  );
}
