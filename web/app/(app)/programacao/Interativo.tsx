"use client";

import clsx from "clsx";
import { Check, Loader2, Play, Undo2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";

import { cancelarLote, desfazerLote, iniciarMudanca, salvarDia, testarRobo, type Resposta } from "./acoes";

// ----------------------------------------------------------------------------
// Calendário do mês editável
// ----------------------------------------------------------------------------
export interface DiaMes {
  iso: string; numero: number; hoje: boolean; fora: boolean;
  campos: { campo: string; nome: string | null; n: number }[];
}

function CelulaDia({ d, pode }: { d: DiaMes; pode: boolean }) {
  const router = useRouter();
  const original = d.campos.map((c) => c.campo).join(", ");
  const [v, setV] = useState(original);
  const [estado, setEstado] = useState<"" | "salvando" | "ok" | "erro">("");
  const [erro, setErro] = useState("");
  const [, iniciar] = useTransition();
  useEffect(() => setV(original), [original]);
  async function salvar() {
    if (!pode || v.trim() === original) return;
    setEstado("salvando");
    const r = await salvarDia(d.iso, v);
    if (r.erro) { setEstado("erro"); setErro(r.erro); return; }
    setEstado("ok");
    iniciar(() => router.refresh());
    setTimeout(() => setEstado(""), 1500);
  }
  if (d.fora) return <div className="min-h-[124px] border-r border-borda bg-superficie-2/40 last:border-r-0" />;
  return (
    <div className={clsx("min-h-[124px] min-w-0 space-y-1 border-r border-borda p-1.5 last:border-r-0", d.hoje && "ring-2 ring-inset ring-[var(--serie-1)]")}>
      <div className="flex items-center justify-between px-0.5">
        <span className="num font-display text-[15px] font-semibold">{d.numero}</span>
        {estado === "salvando" && <Loader2 className="size-3.5 animate-spin text-texto-3" />}
        {estado === "ok" && <Check className="size-3.5" style={{ color: "var(--st-bom)" }} />}
      </div>
      <input value={v} onChange={(e) => setV(e.target.value)} disabled={!pode} placeholder={pode ? "máquina" : ""}
        aria-label={`Campos de ordenação de ${d.iso.slice(8, 10)}/${d.iso.slice(5, 7)}`}
        onBlur={salvar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="h-8 w-full rounded-md border border-borda bg-superficie-2 px-2 text-[12px] outline-none focus:border-marca-500 focus:bg-superficie disabled:opacity-70" />
      {estado === "erro" && <p className="text-[11px] text-perigo-500">{erro}</p>}
      <ul className="space-y-0.5">
        {d.campos.map((c) => (
          <li key={c.campo} className="text-[10.5px] leading-tight text-texto-3" title={`${c.campo} · ${c.nome ?? "não encontrado no IH08/IW38"}`}>
            <b className="font-medium text-texto-2">{c.campo}</b> · {c.nome ?? <span className="font-medium" style={{ color: "var(--st-serio)" }}>não encontrado</span>}
            {c.n > 0 && <> · {c.n} ordem(ns)</>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MesEditavel({ semanas, dias, pode }: { semanas: number; dias: DiaMes[]; pode: boolean }) {
  const NOMES = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
  return (
    <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
      <div className="min-w-[840px]">
        <div className="grid grid-cols-7 border-b border-borda bg-superficie-2">
          {NOMES.map((n) => <div key={n} className="py-2 text-center text-[11px] font-semibold tracking-[0.06em] text-texto-3">{n}</div>)}
        </div>
        {Array.from({ length: semanas }, (_, i) => (
          <div key={i} className="grid grid-cols-7 border-b border-borda last:border-b-0">
            {dias.slice(i * 7, i * 7 + 7).map((d) => <CelulaDia key={d.iso} d={d} pode={pode} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Ações com o robô
// ----------------------------------------------------------------------------
function useAcao() {
  const router = useRouter();
  const [r, setR] = useState<Resposta | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (fn: () => Promise<Resposta>) => iniciar(async () => {
    const x = await fn();
    setR(x);
    if (x.ok) router.refresh();
  });
  return { r, pendente, rodar };
}

export function FormTeste({ mes, bloqueio }: { mes: string; bloqueio: string }) {
  const [aberto, setAberto] = useState(false);
  const [campo, setCampo] = useState(""), [ordem, setOrdem] = useState("");
  const { r, pendente, rodar } = useAcao();
  return (
    <div className="space-y-3">
      <button className={BOTAO_SECUNDARIO} disabled={!!bloqueio} title={bloqueio || "O robô confere cada passo no SAP (IW38, seta à direita, período, tela da ordem) sem alterar nada."}
        onClick={() => setAberto(!aberto)}>Testar o robô</button>
      {aberto && !bloqueio && (
        <div className="space-y-3 rounded-xl border border-borda bg-superficie-2 p-4 text-[13px]">
          <p className="text-texto-2">O robô abre o SAP numa <b>janela própria</b>, entra na IW38 e confere cada passo, <b>sem gravar nada</b>. Opcional: um campo de ordenação para uma busca de verdade e uma ordem para ler as datas na IW33.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={campo} onChange={(e) => setCampo(e.target.value)} placeholder="Campo de ordenação (opcional)" className="h-10 rounded-lg border border-borda bg-superficie px-3 outline-none" />
            <input value={ordem} onChange={(e) => setOrdem(e.target.value)} placeholder="Ordem para ler as datas (opcional)" className="h-10 rounded-lg border border-borda bg-superficie px-3 outline-none" />
          </div>
          <button className={BOTAO_PRIMARIO} disabled={pendente} onClick={() => rodar(() => testarRobo(campo, ordem, mes))}>
            {pendente ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}Iniciar teste
          </button>
        </div>
      )}
      {r && <Mensagem tipo={r.erro ? "erro" : "ok"}>{r.erro ?? r.ok}</Mensagem>}
    </div>
  );
}

export function FormExecutar({ de, ate, atrasadas, consultas, bloqueio }: { de: string; ate: string; atrasadas: boolean; consultas: number; bloqueio: string }) {
  const [simular, setSimular] = useState(false), [confirma, setConfirma] = useState(false);
  const { r, pendente, rodar } = useAcao();
  const motivo = bloqueio || (!confirma ? "Marque a confirmação." : "");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px]">
        <label className="inline-flex items-center gap-2" title="O robô faz a IW38 e abre cada ordem para conferir se o SAP aceita a data, sem gravar.">
          <input type="checkbox" checked={simular} onChange={(e) => setSimular(e.target.checked)} className="size-4 accent-[var(--serie-1)]" /> Só simular
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={confirma} onChange={(e) => setConfirma(e.target.checked)} className="size-4 accent-[var(--serie-1)]" />
          Confirmo {simular ? "simular" : "alterar no SAP"} as datas de {consultas} consulta(s) na IW38
        </label>
      </div>
      <button className={BOTAO_PRIMARIO} disabled={!!motivo || pendente} title={motivo || undefined}
        onClick={() => rodar(async () => { const x = await iniciarMudanca(de, ate, atrasadas, simular, confirma); if (x.ok) setConfirma(false); return x; })}>
        {pendente ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}Iniciar mudança de datas
      </button>
      {r && <Mensagem tipo={r.erro ? "erro" : "ok"}>{r.erro ?? r.ok}</Mensagem>}
    </div>
  );
}

export function BotoesLote({ id, podeDesfazer, podeCancelar, bloqueioDesfazer }: { id: string; podeDesfazer: boolean; podeCancelar: boolean; bloqueioDesfazer: string }) {
  const { r, pendente, rodar } = useAcao();
  if (!podeDesfazer && !podeCancelar) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {podeDesfazer && (
          <button className={BOTAO_SECUNDARIO} disabled={pendente || !!bloqueioDesfazer} title={bloqueioDesfazer || undefined}
            onClick={() => confirm("Desfazer este lote? O robô volta as datas antigas das ordens alteradas.") && rodar(() => desfazerLote(id))}>
            <Undo2 className="size-4" />Desfazer este lote
          </button>
        )}
        {podeCancelar && (
          <button className={BOTAO_SECUNDARIO} disabled={pendente} title="Use se o robô não pegou o pedido ou parou no meio."
            onClick={() => rodar(() => cancelarLote(id))}><X className="size-4" />Cancelar este pedido</button>
        )}
      </div>
      {r && <Mensagem tipo={r.erro ? "erro" : "ok"}>{r.erro ?? r.ok}</Mensagem>}
    </div>
  );
}

/** Com pedido em andamento, relê a página a cada 20 s (o robô grava o andamento no lote). */
export function AutoAtualizar({ segundos = 20 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), segundos * 1000);
    return () => clearInterval(t);
  }, [router, segundos]);
  return null;
}
