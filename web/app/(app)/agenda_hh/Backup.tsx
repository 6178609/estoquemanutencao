"use client";

import clsx from "clsx";
import { DatabaseBackup, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Mensagem } from "@/components/Campos";
import { BOTAO_SECUNDARIO } from "@/components/ui";
import * as R from "@/lib/agendaHh/regras";

import { restaurarBackup } from "./acoes";
import { baixarArquivo, reduzirImagem } from "./comum";

/** Lotes de até ~700 kB (o limite de uma ação de servidor é 1 MB): técnicos primeiro, depois as programações. */
const LOTE_BYTES = 700_000;
function lotes(tecnicos: R.Tecnico[], programacoes: R.Programacao[]) {
  const out: { tecnicos: R.Tecnico[]; programacoes: R.Programacao[] }[] = [];
  let atual = { tecnicos: [] as R.Tecnico[], programacoes: [] as R.Programacao[] }, tamanho = 0;
  const por = (item: unknown, campo: "tecnicos" | "programacoes") => {
    const n = JSON.stringify(item).length;
    if (tamanho + n > LOTE_BYTES && (atual.tecnicos.length || atual.programacoes.length)) {
      out.push(atual);
      atual = { tecnicos: [], programacoes: [] };
      tamanho = 0;
    }
    (atual[campo] as unknown[]).push(item);
    tamanho += n;
  };
  tecnicos.forEach((t) => por(t, "tecnicos"));
  programacoes.forEach((p) => por(p, "programacoes"));
  if (atual.tecnicos.length || atual.programacoes.length || !out.length) out.push(atual);
  return out;
}

const novoId = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Exportar backup (formato do app original) e restaurar — inclusive o backup exportado pelo sistema antigo. */
export function Backup({ tecnicos, programacoes, hoje, edita }: { tecnicos: R.Tecnico[]; programacoes: R.Programacao[]; hoje: string; edita: boolean }) {
  const router = useRouter();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string; lista?: string[] } | null>(null);
  const [ocupado, iniciar] = useTransition();

  function exportar() {
    const sem = tecnicos.map(({ ausenciasHh: _, ...t }) => t);
    baixarArquivo(`backup-controle-hh-${hoje}.json`, JSON.stringify(R.backupDoSistema(sem, programacoes), null, 2), "application/json");
    setAviso({ tipo: "ok", texto: "Backup exportado." });
  }

  async function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    try {
      const dados = R.lerBackup(JSON.parse(await arq.text()));
      if (!dados) throw new Error("Arquivo de backup inválido.");
      // fotos do sistema antigo (até 420 kB) são reduzidas aqui antes de enviar
      for (const t of dados.tecnicos) {
        if (typeof t.foto === "string" && t.foto.startsWith("data:image/") && t.foto.length > R.LIMITE_FOTO)
          t.foto = await reduzirImagem(t.foto).catch(() => "");
      }
      const prep = R.prepararRestauracao(dados, novoId);
      // cabe num lote só: uma gravação (tudo ou nada). Maior: em partes, e a pessoa é avisada antes
      const partes = lotes(prep.tecnicos, prep.programacoes);
      if (!window.confirm(`Restaurar ${prep.tecnicos.length} técnico(s) e ${prep.programacoes.length} programação(ões)? Os dados atuais serão substituídos.`
        + (partes.length > 1 ? `\n\nO backup é grande e será gravado em ${partes.length} partes: se uma parte falhar, os dados ficam incompletos até `
          + "você restaurar de novo (a parte que falhar é reenviada uma vez automaticamente)." : "")
        + (prep.avisos.length ? `\n\n${prep.avisos.length} item(ns) do arquivo não entram (detalhes depois).` : ""))) return;
      iniciar(async () => {
        for (let i = 0; i < partes.length; i++) {
          // uma nova tentativa automática (a gravação de cada parte é idempotente: mesmos ids)
          let r = await restaurarBackup(partes[i], i === 0).catch((e: Error) => ({ ok: false as const, erro: e.message || "Falha de rede." }));
          if (!r.ok) r = await restaurarBackup(partes[i], i === 0).catch((e: Error) => ({ ok: false as const, erro: e.message || "Falha de rede." }));
          if (!r.ok) {
            setAviso({ tipo: "erro", texto: i === 0
              ? `${r.erro} Nada foi alterado; tente restaurar de novo.`
              : `${r.erro} A restauração parou na parte ${i + 1} de ${partes.length} (as ${i} primeiras foram gravadas): os dados estão incompletos. Restaure o mesmo backup de novo para completar.` });
            router.refresh();
            return;
          }
        }
        setAviso({ tipo: "ok", texto: `Backup restaurado por completo${partes.length > 1 ? ` (${partes.length} partes)` : ""}: ${prep.tecnicos.length} técnico(s) e ${prep.programacoes.length} programação(ões).`,
          lista: prep.avisos.slice(0, 12) });
        router.refresh();
      });
    } catch (err) {
      setAviso({ tipo: "erro", texto: (err as Error).message || "Arquivo de backup inválido." });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BOTAO_SECUNDARIO} onClick={exportar}><DatabaseBackup className="size-4" aria-hidden />Exportar backup</button>
        {edita && (
          <label className={clsx(BOTAO_SECUNDARIO, "cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-[var(--foco)]", ocupado && "opacity-60")}>
            <Upload className="size-4" aria-hidden />{ocupado ? "Restaurando…" : "Restaurar backup"}
            <input type="file" accept="application/json,.json" className="sr-only" onChange={importar} disabled={ocupado} />
          </label>
        )}
      </div>
      {aviso && (
        <Mensagem tipo={aviso.tipo}>
          {aviso.texto}
          {aviso.lista?.length ? <ul className="mt-1 list-disc pl-5 font-normal">{aviso.lista.map((l) => <li key={l}>{l}</li>)}</ul> : null}
        </Mensagem>
      )}
    </div>
  );
}
