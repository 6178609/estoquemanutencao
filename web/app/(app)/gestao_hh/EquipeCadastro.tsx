"use client";

import clsx from "clsx";
import { ArrowRightLeft, Download, Pencil, UserMinus, UserPlus, UserRoundCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Campo, Mensagem } from "@/components/Campos";
import { CampoBusca } from "@/components/Filtros";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";
import { casaBusca, normalizarBusca } from "@/lib/dados/texto";

import { Quadro } from "../execucao/_ui/Blocos";
import { int } from "../execucao/_ui/fmt";
import { baixarCsv, type Coluna } from "../execucao/_ui/Tabela";
import { mudarAtivo, passarEquipeParaCadastro, salvarPessoa, type PessoaForm } from "./acoes";

export interface MembroLinha {
  np: string; nome: string; cargo: string; especialidade: string; centro: string; area: string; turma: string; supervisor: string; ativo: boolean;
}

const COLS: Coluna[] = [
  { id: "np", rotulo: "Nº pessoal" }, { id: "nome", rotulo: "Nome" }, { id: "cargo", rotulo: "Cargo" }, { id: "especialidade", rotulo: "Especialidade" },
  { id: "centro", rotulo: "Centro de trabalho" }, { id: "area", rotulo: "Área" }, { id: "turma", rotulo: "Turma" }, { id: "supervisor", rotulo: "Supervisor" },
  { id: "situacao", rotulo: "Situação" },
];
const VAZIO: PessoaForm = { np: "", nome: "", cargo: "", centro: "", area: "", turma: "", supervisor: "" };

/** Aviso de migração: enquanto a equipe vem da planilha, um clique passa todo mundo para o cadastro. */
export function MigrarEquipe({ nPlanilha, edita }: { nPlanilha: number; edita: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const passar = () => {
    if (!confirm(`Passar as ${nPlanilha} pessoas da última planilha para o cadastro da Gestão de HH? Depois disso a planilha não precisa mais ser enviada.`)) return;
    iniciar(async () => {
      const r = await passarEquipeParaCadastro();
      setMsg(r.ok ? { tipo: "ok", texto: r.msg } : { tipo: "erro", texto: r.erro });
      if (r.ok) router.refresh();
    });
  };
  return (
    <div className="rounded-cartao border border-alp-laranja/40 bg-alp-laranja/8 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ArrowRightLeft className="size-5 shrink-0 text-alp-laranja" />
        <p className="min-w-[240px] flex-1 text-[13.5px] leading-relaxed text-texto-2">
          A equipe ainda vem da <b className="font-medium text-texto">última planilha de Gestão de HH</b> enviada ({int(nPlanilha)} pessoas). Agora a equipe é
          cadastrada aqui: passe as pessoas para o cadastro (jornada, % e ausências já lançadas continuam) e a planilha não precisa mais ser enviada.
          {!edita && " Só editores e administradores fazem a passagem."}
        </p>
        {edita && <button onClick={passar} disabled={ocupado || !nPlanilha} className={BOTAO_PRIMARIO}><ArrowRightLeft className="size-4" />{ocupado ? "Passando…" : "Passar a equipe para o cadastro"}</button>}
      </div>
      {msg && <div className="mt-3"><Mensagem tipo={msg.tipo}>{msg.texto}</Mensagem></div>}
    </div>
  );
}

/** A equipe por cadastro manual: quem é da manutenção, com cargo, centro, área, turma e supervisor. */
export function EquipeCadastro({ membros, edita, doCadastro }: { membros: MembroLinha[]; edita: boolean; doCadastro: boolean }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [desligados, setDesligados] = useState(false);
  const [form, setForm] = useState<PessoaForm | null>(null);
  const [nova, setNova] = useState(true);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const indice = useMemo(() => membros.map((p) => normalizarBusca(`${p.np} ${p.nome} ${p.cargo} ${p.centro} ${p.turma} ${p.supervisor}`)), [membros]);
  const vis = membros.filter((p, i) => (desligados || p.ativo) && (!busca || casaBusca(indice[i], busca)))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.centro.localeCompare(b.centro) || a.nome.localeCompare(b.nome));
  const nDesl = membros.filter((p) => !p.ativo).length;
  // sugestões dos campos (o que já existe na equipe)
  const lista = (k: keyof MembroLinha) => [...new Set(membros.map((p) => String(p[k])).filter(Boolean))].sort();

  const responder = (r: Awaited<ReturnType<typeof salvarPessoa>>, depois?: () => void) => {
    setMsg(r.ok ? { tipo: "ok", texto: r.msg } : { tipo: "erro", texto: r.erro });
    if (r.ok) { depois?.(); router.refresh(); }
  };
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    iniciar(async () => responder(await salvarPessoa(form, nova), () => setForm(null)));
  };
  const ativo = (p: MembroLinha, v: boolean) => {
    if (!v && !confirm(`Desligar ${p.nome} da equipe? A pessoa sai da capacidade e das listas; o histórico (apontamentos e ausências) fica.`)) return;
    iniciar(async () => responder(await mudarAtivo(p.np, v)));
  };
  const editar = (p: MembroLinha) => {
    setNova(false);
    setForm({ np: p.np, nome: p.nome, cargo: p.cargo, centro: p.centro, area: p.area, turma: p.turma, supervisor: p.supervisor });
    setMsg(null);
  };

  return (
    <div className="space-y-4">
      {msg && <Mensagem tipo={msg.tipo}>{msg.texto}</Mensagem>}
      {form && (
        <Quadro titulo={nova ? "Cadastrar pessoa" : `Editar ${form.nome || form.np}`}
          subtitulo={nova ? "Matrícula como aparece no apontamento (IW47). A especialidade é deduzida do cargo; jornada e % ficam na visão Pessoas."
            : "A matrícula não muda. Para trocar de pessoa, desligue esta e cadastre a nova."}
          acoes={<button onClick={() => setForm(null)} aria-label="Fechar" className="grid size-8 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2"><X className="size-4" /></button>}>
          <form onSubmit={salvar} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo="Nº pessoal (matrícula)" inputMode="numeric" value={form.np} required disabled={!nova} maxLength={14}
                onChange={(e) => setForm({ ...form, np: e.target.value })} />
              <Campo rotulo="Nome" value={form.nome} required maxLength={120} className="lg:col-span-2" onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              <Campo rotulo="Cargo" value={form.cargo} maxLength={80} list="hh-cargos" onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
              <Campo rotulo="Centro de trabalho" value={form.centro} required maxLength={20} list="hh-centros" onChange={(e) => setForm({ ...form, centro: e.target.value })} />
              <Campo rotulo="Área" value={form.area} maxLength={40} list="hh-areas" onChange={(e) => setForm({ ...form, area: e.target.value })} />
              <Campo rotulo="Turma" value={form.turma} maxLength={20} list="hh-turmas" onChange={(e) => setForm({ ...form, turma: e.target.value })} />
              <Campo rotulo="Supervisor" value={form.supervisor} maxLength={120} list="hh-supervisores" onChange={(e) => setForm({ ...form, supervisor: e.target.value })} />
            </div>
            {([["hh-cargos", "cargo"], ["hh-centros", "centro"], ["hh-areas", "area"], ["hh-turmas", "turma"], ["hh-supervisores", "supervisor"]] as const).map(([id, k]) => (
              <datalist key={id} id={id}>{lista(k).map((v) => <option key={v} value={v} />)}</datalist>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={ocupado} className={BOTAO_PRIMARIO}>{ocupado ? "Salvando…" : nova ? "Cadastrar" : "Salvar"}</button>
              <button type="button" className={BOTAO_SECUNDARIO} onClick={() => setForm(null)}>Cancelar</button>
            </div>
          </form>
        </Quadro>
      )}
      <Quadro titulo="Equipe" subtitulo={`${int(membros.filter((p) => p.ativo).length)} pessoa(s) na equipe${nDesl ? ` · ${int(nDesl)} desligada(s)` : ""}${doCadastro ? "" : " · ainda da última planilha (só consulta até passar para o cadastro)"}`}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            {nDesl > 0 && (
              <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-borda bg-superficie-2 px-2.5 text-[12.5px] text-texto-2">
                <input type="checkbox" checked={desligados} onChange={(e) => setDesligados(e.target.checked)} className="size-3.5 accent-[var(--color-marca-500)]" />
                Mostrar desligados
              </label>
            )}
            <button onClick={() => baixarCsv("equipe_manutencao", COLS, vis.map(({ ativo: a, ...p }) => ({ ...p, situacao: a ? "Ativo" : "Desligado" })))}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-borda bg-superficie px-2.5 text-[12.5px] text-texto-2 hover:text-texto">
              <Download className="size-3.5" /> Baixar CSV
            </button>
            {edita && (
              <button onClick={() => { setNova(true); setForm({ ...VAZIO }); setMsg(null); }} className={clsx(BOTAO_PRIMARIO, "!h-8 !rounded-lg !px-3 !text-[13px]")}>
                <UserPlus className="size-3.5" /> Cadastrar pessoa
              </button>
            )}
          </div>
        }>
        <div className="mb-3"><CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar nome, matrícula, cargo, centro, turma…" /></div>
        <div className="max-h-[560px] overflow-auto rounded-lg border border-borda">
          <table className="w-full min-w-[980px] whitespace-nowrap text-left text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-superficie-2 text-[11.5px] text-texto-3">
              <tr>{["Nº pessoal", "Nome", "Cargo", "Especialidade", "Centro", "Área", "Turma", "Supervisor", ""].map((h, i) => <th key={i} className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {vis.map((p) => (
                <tr key={p.np} className={p.ativo ? undefined : "text-texto-3"}>
                  <td className="num px-3 py-1.5 font-mono text-[12px]">{p.np}</td>
                  <td className="px-3 py-1.5 font-medium">{p.nome}{!p.ativo && <span className="ml-2 rounded-md bg-superficie-3 px-1.5 py-0.5 text-[11px] font-normal">desligado</span>}</td>
                  <td className="max-w-[200px] truncate px-3 py-1.5 text-texto-2" title={p.cargo}>{p.cargo}</td>
                  <td className="px-3 py-1.5 text-texto-2">{p.especialidade}</td>
                  <td className="num px-3 py-1.5 font-mono text-[12px]">{p.centro}</td>
                  <td className="px-3 py-1.5">{p.area}</td>
                  <td className="px-3 py-1.5">{p.turma}</td>
                  <td className="max-w-[180px] truncate px-3 py-1.5 text-texto-2" title={p.supervisor}>{p.supervisor}</td>
                  <td className="px-3 py-1.5 text-right">
                    {edita && doCadastro && (
                      <span className="inline-flex gap-1">
                        <button onClick={() => editar(p)} aria-label={`Editar ${p.nome}`} title="Editar" className="grid size-7 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto"><Pencil className="size-3.5" /></button>
                        {p.ativo
                          ? <button onClick={() => ativo(p, false)} disabled={ocupado} aria-label={`Desligar ${p.nome}`} title="Desligar da equipe" className="grid size-7 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-perigo-500"><UserMinus className="size-3.5" /></button>
                          : <button onClick={() => ativo(p, true)} disabled={ocupado} aria-label={`Reativar ${p.nome}`} title="Voltar para a equipe" className="grid size-7 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-marca-600"><UserRoundCheck className="size-3.5" /></button>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!vis.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-texto-3">{membros.length ? "Ninguém na busca." : "Ninguém cadastrado ainda: use Cadastrar pessoa."}</td></tr>}
            </tbody>
          </table>
        </div>
      </Quadro>
    </div>
  );
}
