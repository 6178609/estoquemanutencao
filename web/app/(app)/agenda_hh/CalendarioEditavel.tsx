"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Mensagem } from "@/components/Campos";
import * as R from "@/lib/agendaHh/regras";

import { Calendario } from "./Calendario";
import { FormProgramacao } from "./Programacao";

/** O Calendário com a edição da programação ao tocar num equipamento (só para quem edita). */
export function CalendarioEditavel({ tecnicos, programacoes, hoje, edita, equipamentos }: { tecnicos: R.Tecnico[]; programacoes: R.Programacao[];
  hoje: string; edita: boolean; equipamentos: string[] }) {
  const router = useRouter();
  const [aberta, setAberta] = useState<{ p?: R.Programacao; n: number }>({ n: 0 });
  const [msg, setMsg] = useState("");
  const areas = R.distintos([...tecnicos.map((t) => t.area), ...programacoes.map((p) => p.area)].map((a) => ({ a })), (x) => x.a);
  return (
    <div className="space-y-4">
      {msg && <Mensagem tipo="ok">{msg}</Mensagem>}
      <Calendario tecnicos={tecnicos} programacoes={programacoes} hoje={hoje}
        aoAbrir={edita ? (id) => { const p = programacoes.find((x) => x.id === id); if (p) setAberta({ p, n: aberta.n + 1 }); } : undefined} />
      {edita && (
        <FormProgramacao key={aberta.n} aberto={!!aberta.p} base={aberta.p} duplicar={false} tecnicos={tecnicos} hoje={hoje} areas={areas}
          equipamentos={equipamentos} aoFechar={() => setAberta({ n: aberta.n })}
          aoSalvar={(m) => { setAberta({ n: aberta.n }); setMsg(m); router.refresh(); }} />
      )}
    </div>
  );
}
