"use client";

import { CalendarX2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Campo, Mensagem, Seletor } from "@/components/Campos";
import { BOTAO_PRIMARIO } from "@/components/ui";

import { Quadro } from "../execucao/_ui/Blocos";
import { adicionarAusencia } from "./acoes";

const iso = (d: number) => new Date(d * 86_400_000).toISOString().slice(0, 10);
const TREINAMENTO = "Treinamento";

/**
 * Nova ausência (férias, afastamento, treinamento…) — usada na Gestão de HH e em Treinamentos e férias. Treinamento
 * pede o nome e aceita carga horária (vazio = dias inteiros; 0 = EAD/fora do horário, não tira HH), entidade e validade.
 */
export function FormAusencia({ pessoas, tipos, hoje, tipoInicial, titulo = "Nova ausência", subtitulo, sugestoes = [] }: {
  pessoas: { np: string; nome: string; centro: string }[]; tipos: string[]; hoje: number; tipoInicial?: string; titulo?: string;
  subtitulo?: string; sugestoes?: string[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const vazio = { np: "", tipo: tipoInicial ?? tipos[0], de: iso(hoje), ate: iso(hoje), obs: "", titulo: "", horas: "", entidade: "", validade: "" };
  const [f, setF] = useState(vazio);
  const treino = f.tipo === TREINAMENTO;
  const opcoesPessoa = Object.fromEntries([...pessoas].sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => [p.np, `${p.nome} · ${p.centro} (${p.np})`]));

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    iniciar(async () => {
      const r = await adicionarAusencia(f.np, f.tipo, f.de, f.ate, f.obs,
        treino ? { titulo: f.titulo, horas: f.horas, entidade: f.entidade, validade: f.validade } : undefined);
      if (r.ok) { setMsg({ tipo: "ok", texto: r.msg }); setF((x) => ({ ...vazio, tipo: x.tipo, de: x.de, ate: x.ate, titulo: x.titulo, entidade: x.entidade })); router.refresh(); }
      else setMsg({ tipo: "erro", texto: r.erro });
    });
  };

  return (
    <Quadro titulo={titulo} subtitulo={subtitulo ?? "Datas inclusivas; cada dia corrido tira jornada ÷ 7 das horas disponíveis (treinamento com carga horária tira só essas horas)"}>
      {msg && <div className="mb-3"><Mensagem tipo={msg.tipo}>{msg.texto}</Mensagem></div>}
      <form onSubmit={enviar} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_1fr]">
          <Seletor rotulo="Pessoa" opcoes={opcoesPessoa} vazio="Escolha a pessoa" value={f.np} required onChange={(e) => setF({ ...f, np: e.target.value })} />
          <Seletor rotulo="Tipo" opcoes={Object.fromEntries(tipos.map((t) => [t, t]))} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} />
          <Campo rotulo="De" type="date" value={f.de} required onChange={(e) => setF({ ...f, de: e.target.value, ate: e.target.value > f.ate ? e.target.value : f.ate })} />
          <Campo rotulo="Até" type="date" value={f.ate} min={f.de} required onChange={(e) => setF({ ...f, ate: e.target.value })} />
        </div>
        {treino && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.4fr_1fr]">
            <Campo rotulo="Treinamento" placeholder="Ex.: NR-10 reciclagem" value={f.titulo} maxLength={120} required list="treinamentos-conhecidos"
              onChange={(e) => setF({ ...f, titulo: e.target.value })} />
            <Campo rotulo="Carga horária (h)" type="number" min={0} step={0.5} placeholder="dias inteiros" value={f.horas}
              dica="0 = EAD ou fora do horário (não tira HH)" onChange={(e) => setF({ ...f, horas: e.target.value })} />
            <Campo rotulo="Entidade / instrutor" placeholder="opcional" value={f.entidade} maxLength={120} onChange={(e) => setF({ ...f, entidade: e.target.value })} />
            <Campo rotulo="Validade (reciclagem)" type="date" value={f.validade} min={f.ate} onChange={(e) => setF({ ...f, validade: e.target.value })} />
            <datalist id="treinamentos-conhecidos">{sugestoes.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Campo rotulo="Observação" placeholder="opcional" value={f.obs} maxLength={300} onChange={(e) => setF({ ...f, obs: e.target.value })} />
          <button type="submit" disabled={ocupado || !f.np} className={BOTAO_PRIMARIO}><CalendarX2 className="size-4" />Adicionar</button>
        </div>
      </form>
    </Quadro>
  );
}
