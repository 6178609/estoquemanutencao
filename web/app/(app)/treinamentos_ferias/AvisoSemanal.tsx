"use client";

import { LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Mensagem } from "@/components/Campos";
import { BOTAO_SECUNDARIO } from "@/components/ui";

/** "Enviar agora" do aviso semanal de treinamentos (administrador). */
export function EnviarAgora() {
  const router = useRouter();
  const [estado, setEstado] = useState<{ enviando: boolean; msg: string; ok: boolean }>({ enviando: false, msg: "", ok: false });
  const enviar = async () => {
    if (!confirm("Enviar agora o aviso de treinamentos a todos os líderes com e-mail?")) return;
    setEstado({ enviando: true, msg: "", ok: false });
    const r = await fetch("/api/avisos/treinamentos", { method: "POST" }).catch(() => null);
    const j = await r?.json().catch(() => ({})) ?? {};
    if (!r?.ok || !j.ok) {
      setEstado({ enviando: false, msg: j.motivo || j.erro || "Não foi possível enviar.", ok: false });
      return;
    }
    const msg = !j.itens ? "Nenhum treinamento vencendo: nada a avisar."
      : `Aviso enviado a ${j.enviados} líder(es)${j.falhas?.length ? `; falhou para: ${j.falhas.join(", ")}` : ""}.`;
    setEstado({ enviando: false, msg, ok: !j.falhas?.length });
    router.refresh();
  };
  return (
    <div className="space-y-2">
      <button type="button" onClick={enviar} disabled={estado.enviando} aria-busy={estado.enviando} className={BOTAO_SECUNDARIO}>
        {estado.enviando ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar agora
      </button>
      {estado.msg && <Mensagem tipo={estado.ok ? "ok" : "erro"}>{estado.msg}</Mensagem>}
    </div>
  );
}
