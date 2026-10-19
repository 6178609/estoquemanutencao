"use client";

import { Check, LoaderCircle, Undo2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";

import { alocarAutomatico, alterarPecas, desfazerAlocacao } from "./acoes";
import type { Nivel } from "./alocacao";

/** Botões da alocação automática: alocar em lote por nível de confiança e desfazer a última. */
export function AlocacaoAcoes({ contagem, temDesfazer }: { contagem: Record<Nivel, number>; temDesfazer: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const rodar = (acao: () => Promise<{ erro: string } | ({ ok: true } & Record<string, unknown>)>, sucesso: (r: Record<string, unknown>) => string) =>
    iniciar(async () => {
      const r = await acao();
      if ("erro" in r) setMsg({ texto: String(r.erro), ok: false });
      else { setMsg({ texto: sucesso(r), ok: true }); router.refresh(); }
    });
  const alocar = (niveis: Nivel[], total: number) => {
    if (!confirm(`Vincular ${total.toLocaleString("pt-BR")} material(is) aos ativos sugeridos? Dá para desfazer em seguida.`)) return;
    rodar(() => alocarAutomatico(niveis), (r) => `${Number(r.pares).toLocaleString("pt-BR")} material(is) vinculado(s) em ${Number(r.ativos).toLocaleString("pt-BR")} ativo(s).`);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pendente || !contagem.alta} onClick={() => alocar(["alta"], contagem.alta)} className={BOTAO_PRIMARIO}>
          {pendente ? <LoaderCircle className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Alocar as de confiança alta ({contagem.alta.toLocaleString("pt-BR")})
        </button>
        <button type="button" disabled={pendente || !(contagem.alta + contagem.media)} onClick={() => alocar(["alta", "media"], contagem.alta + contagem.media)} className={BOTAO_SECUNDARIO}>
          Alocar alta + média ({(contagem.alta + contagem.media).toLocaleString("pt-BR")})
        </button>
        {temDesfazer && (
          <button type="button" disabled={pendente} className={BOTAO_SECUNDARIO}
            onClick={() => confirm("Desfazer a última alocação automática (tira só os vínculos que ela pôs)?") && rodar(desfazerAlocacao, (r) => `${Number(r.pares).toLocaleString("pt-BR")} vínculo(s) desfeito(s).`)}>
            <Undo2 className="size-4" /> Desfazer a última alocação
          </button>
        )}
      </div>
      <p className="text-[12.5px] text-texto-3">As de confiança baixa só entram uma a uma (botão na linha), depois de conferir.</p>
      {msg && <Mensagem tipo={msg.ok ? "ok" : "erro"}>{msg.texto}</Mensagem>}
    </div>
  );
}

/** Alocar uma sugestão só (a linha da tabela). */
export function AlocarUm({ ativo, material }: { ativo: string; material: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState("");
  if (feito) return <span className="inline-flex items-center gap-1 text-[12.5px] text-[var(--selo-bom-texto)]"><Check className="size-3.5" /> vinculado</span>;
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" disabled={pendente} aria-busy={pendente} title={erro || undefined}
        onClick={() => iniciar(async () => {
          const r = await alterarPecas(ativo, [material], []);
          if ("erro" in r) setErro(r.erro); else { setFeito(true); router.refresh(); }
        })}
        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-borda px-2.5 text-[12.5px] font-medium text-texto-2 transition hover:bg-superficie-2">
        {pendente ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Alocar
      </button>
      {erro && <span className="text-[11.5px] text-[var(--selo-critico-texto)]">{erro}</span>}
    </span>
  );
}
