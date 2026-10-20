"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, LoaderCircle, Save } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO } from "@/components/ui";

import { salvarOrcamento, type Resposta } from "../acoes";
import { validarOrcamento } from "../validacao";

/** Editor do valor disponível mensal: 12 meses em R$ de um ano, setas de ano e "Salvar". */

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
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

const CAMPO = "h-11 w-full min-w-0 rounded-lg border border-borda bg-superficie-2 px-2.5 text-right text-[15px] tabular-nums transition focus:border-[var(--acao)] focus:bg-superficie";
const SETA = "inline-flex size-11 items-center justify-center rounded-xl border border-borda-forte bg-superficie transition hover:bg-superficie-2";

export function EditorOrcamento({ ano, valores, edita = true }: { ano: number; valores: (number | null)[]; edita?: boolean }) {
  // o miolo é recriado a cada ano, então os campos digitados e a mensagem não passam de um ano para outro
  return <Miolo key={ano} ano={ano} valores={valores} edita={edita} />;
}

function Miolo({ ano, valores, edita }: { ano: number; valores: (number | null)[]; edita: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [txt, setTxt] = useState<(string | undefined)[]>([]);
  const [msg, setMsg] = useState<Resposta | null>(null);
  const [pend, iniciar] = useTransition();

  const hrefAno = (a: number) => {
    const p = new URLSearchParams(params.toString());
    p.set("oano", String(a));
    return `${pathname}?${p.toString()}`;
  };

  const texto = (i: number) => txt[i] ?? mostrar(valores[i]);
  const nums = Array.from({ length: 12 }, (_, i) => ler(texto(i)));
  const invalido = nums.some((v) => v !== null && Number.isNaN(v));
  const erro = invalido ? "Há valores inválidos (use números de R$ 0 em diante)." : validarOrcamento(ano, nums);
  const n = nums.reduce<number>((c, v, i) => c + (igual(v, valores[i] ?? null) ? 0 : 1), 0);

  const salvar = () => iniciar(async () => {
    const r = await salvarOrcamento(ano, nums as (number | null)[]);
    setMsg(r);
    if (!r.erro) { setTxt([]); router.refresh(); }
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {ano > 2000 ? (
            <Link href={hrefAno(ano - 1)} className={SETA} aria-label={`Ano anterior: ${ano - 1}`}><ChevronLeft className="size-5" /></Link>
          ) : (
            <span className={clsx(SETA, "opacity-40")} aria-hidden><ChevronLeft className="size-5" /></span>
          )}
          <span className="num min-w-[4.5ch] text-center font-display text-[18px] font-medium tabular-nums" aria-live="polite">{ano}</span>
          {ano < 2100 ? (
            <Link href={hrefAno(ano + 1)} className={SETA} aria-label={`Próximo ano: ${ano + 1}`}><ChevronRight className="size-5" /></Link>
          ) : (
            <span className={clsx(SETA, "opacity-40")} aria-hidden><ChevronRight className="size-5" /></span>
          )}
        </div>
        {edita && (
          <button className={BOTAO_PRIMARIO} disabled={!n || pend || !!erro} onClick={salvar}>
            {pend ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar
          </button>
        )}
      </div>

      <p className="text-[13px] leading-relaxed text-texto-3">
        Valor disponível do mês em R$. O mês sem valor fica sem saldo (“—”), não é tratado como zero.
      </p>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {MESES.map((m, i) => (
          <label key={m} className="block min-w-0">
            <span className="mb-1.5 block text-[13px] font-medium text-texto-2">{m} <span className="text-texto-3">(R$)</span></span>
            <input
              aria-label={`Valor disponível de ${MESES_LONGO[i]} de ${ano}`}
              className={clsx(CAMPO, n > 0 && !igual(nums[i], valores[i] ?? null) && "border-marca-500")}
              disabled={!edita} inputMode="decimal" placeholder="sem valor" value={texto(i)}
              onChange={(e) => setTxt((antes) => { const c = [...antes]; c[i] = e.target.value; return c; })}
            />
          </label>
        ))}
      </div>

      {erro && n > 0 && <p className="text-[12.5px] text-[var(--st-critico)]">{erro}</p>}
      {msg && <Mensagem tipo={msg.erro ? "erro" : "ok"}>{msg.erro || msg.ok}</Mensagem>}
    </div>
  );
}
