"use client";

import { Check, FileUp, Link2, LoaderCircle, Plus, Unlink, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ENTRADA, Mensagem } from "@/components/Campos";
import { BOTAO_COMPACTO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";
import { Xlsx } from "@/lib/leitura/xlsx";
import { lerListasTarefas } from "@/lib/machineLedger/listasTarefas";
import { lerLedger, type Sugestao } from "@/lib/machineLedger/regras";

/** Grava pela rota da aba; devolve o erro ("" = deu certo) e a resposta. */
async function enviar(corpo: Record<string, unknown>): Promise<{ erro: string; resposta: Record<string, unknown> }> {
  const r = await fetch("/api/machine_ledger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null);
  const j: Record<string, unknown> = (await r?.json().catch(() => ({}))) ?? {};
  if (!r?.ok) return { erro: String(j.erro || "Não foi possível gravar agora; tente de novo."), resposta: j };
  return { erro: "", resposta: j };
}

const LINHA = "inline-flex h-9 items-center gap-1 rounded-lg border border-borda px-2.5 text-[12.5px] hover:bg-superficie-2 disabled:opacity-60";

/** Ações de um achado: vincular/desvincular a peça no ativo e marcar "conferido, está certo". */
export function AcoesAchado({ chave, acao, ativo, codigo }: { chave: string; acao: "vincular" | "desvincular" | null; ativo: string; codigo: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState({ ocupado: "", erro: "" });
  const rodar = async (qual: string, corpo: Record<string, unknown>) => {
    setEstado({ ocupado: qual, erro: "" });
    const r = await enviar(corpo);
    setEstado({ ocupado: "", erro: r.erro });
    if (!r.erro) router.refresh();
  };
  const gira = (q: string) => estado.ocupado === q;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {acao && ativo && (
        <button type="button" disabled={!!estado.ocupado} aria-busy={gira("v")} className={acao === "vincular" ? BOTAO_COMPACTO : LINHA}
          onClick={() => rodar("v", { acao: "vinculo", tipo: acao, ativo, codigo })}>
          {gira("v") ? <LoaderCircle className="size-3.5 animate-spin" /> : acao === "vincular" ? <Link2 className="size-3.5" /> : <Unlink className="size-3.5" />}
          {acao === "vincular" ? "Vincular" : "Desvincular"}
        </button>
      )}
      <button type="button" disabled={!!estado.ocupado} aria-busy={gira("c")} className={LINHA} onClick={() => rodar("c", { acao: "conferido", chave, sim: true })}>
        {gira("c") ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Conferido
      </button>
      {estado.erro && <span role="alert" className="w-full text-[12px] text-[var(--st-critico)]">{estado.erro}</span>}
    </span>
  );
}

/** Equipamentos SAP de um ledger: confirmar, trocar ou remover, partindo das sugestões. */
export function Correspondencia({ id, nome, equipamentos, sugestoes, nomes }: { id: string; nome: string; equipamentos: string[]; sugestoes: Sugestao[];
  nomes: Record<string, string> }) {
  const router = useRouter();
  const [lista, setLista] = useState(equipamentos);
  const [novo, setNovo] = useState("");
  const [estado, setEstado] = useState({ ocupado: false, erro: "", ok: "" });
  const mudou = lista.join() !== equipamentos.join();
  const por = (e: string) => e.replace(/^0+/, "") || e;
  const incluir = (e: string) => { const k = por(e.trim().toUpperCase()); if (k && !lista.includes(k)) setLista([...lista, k]); setNovo(""); };
  const salvar = async () => {
    setEstado({ ocupado: true, erro: "", ok: "" });
    const r = await enviar({ acao: "correspondencia", id, equipamentos: lista });
    setEstado({ ocupado: false, erro: r.erro, ok: r.erro ? "" : "Equipamentos confirmados." });
    if (!r.erro) router.refresh();
  };
  return (
    <div className="space-y-3" aria-label={`Equipamentos de ${nome}`}>
      <div className="flex flex-wrap gap-2">
        {!lista.length && <span className="text-[13px] text-texto-3">Nenhum equipamento SAP ligado.</span>}
        {lista.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded-full border border-borda bg-superficie px-3 py-1 text-[13px]">
            <b className="num">{e}</b>{nomes[e] && <span className="max-w-[14rem] truncate text-texto-3">{nomes[e]}</span>}
            <button type="button" aria-label={`Remover ${e}`} className="-mr-1 grid size-7 place-items-center rounded-full hover:bg-superficie-2"
              onClick={() => setLista(lista.filter((x) => x !== e))}><X className="size-3.5" /></button>
          </span>
        ))}
      </div>
      {sugestoes.filter((s) => !lista.includes(s.sap)).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-texto-3">Sugestões:</span>
          {sugestoes.filter((s) => !lista.includes(s.sap)).map((s) => (
            <button key={s.sap} type="button" className={LINHA} title={s.motivo} onClick={() => incluir(s.sap)}>
              <Plus className="size-3.5" /> {s.sap} {s.denominacao && `· ${s.denominacao}`} <span className="text-texto-3">({s.confianca || "?"})</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); incluir(novo); } }}
          placeholder="Nº do equipamento SAP" aria-label="Nº do equipamento SAP" inputMode="numeric" className={`${ENTRADA} max-w-[14rem]`} />
        <button type="button" className={BOTAO_SECUNDARIO} onClick={() => incluir(novo)} disabled={!novo.trim()}><Plus className="size-4" /> Incluir</button>
        <button type="button" className={BOTAO_PRIMARIO} onClick={salvar} disabled={estado.ocupado}>
          {estado.ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} {mudou ? "Salvar" : "Confirmar"}
        </button>
      </div>
      {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
      {estado.ok && <Mensagem tipo="ok">{estado.ok}</Mensagem>}
    </div>
  );
}

/** Enviar o .xlsx do Machine Ledger (lido no navegador): substitui o ledger escolhido ou cria um novo. */
export function EnviarLedger({ ledgers }: { ledgers: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [alvo, setAlvo] = useState("");
  const [estado, setEstado] = useState({ ocupado: false, erro: "", ok: "" });
  const ler = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    setEstado({ ocupado: true, erro: "", ok: "" });
    try {
      const x = new Xlsx(new Uint8Array(await arq.arrayBuffer()));
      // só as abas que interessam são lidas (o resto da pasta de trabalho fica fechado)
      const lido = lerLedger(arq.name, x.abas.map((a) => ({ nome: a.nome, get linhas() { return x.linhas(a) as unknown[][]; } })));
      if ("erro" in lido) { setEstado({ ocupado: false, erro: lido.erro, ok: "" }); return; }
      const nomeAlvo = ledgers.find((l) => l.id === alvo)?.nome;
      const msg = `${lido.conteudo.componentes.length} componentes, ${lido.conteudo.plano.length} atividades e ${lido.conteudo.pecas.length} peças.`
        + (nomeAlvo ? ` Substituir o ledger "${nomeAlvo}"?` : " Criar um ledger novo (ou substituir o de mesmo nome)?");
      if (!window.confirm(msg)) { setEstado({ ocupado: false, erro: "", ok: "" }); return; }
      const r = await enviar({ acao: "envio", dados: { id: alvo || undefined, arquivo: arq.name, nome: lido.nome, revisao: lido.revisao, capa: lido.capa, conteudo: lido.conteudo, abas: x.abas.map((a) => a.nome) } });
      setEstado({ ocupado: false, erro: r.erro, ok: r.erro ? "" : `Ledger gravado: ${msg.split("?")[0].replace(/ Substituir.*| Criar.*/, "")}` });
      if (!r.erro) router.refresh();
    } catch (err) {
      setEstado({ ocupado: false, erro: `Não foi possível ler a planilha: ${(err as Error).message || "arquivo inválido"}.`, ok: "" });
    }
  };
  return (
    <div className="space-y-3">
      <label className="block max-w-md">
        <span className="mb-1.5 block text-[13px] font-semibold">Ledger a substituir</span>
        <select value={alvo} onChange={(e) => setAlvo(e.target.value)} className={ENTRADA}>
          <option value="">Novo (ou o de mesmo nome de arquivo)</option>
          {ledgers.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
      </label>
      <label className={`${BOTAO_PRIMARIO} cursor-pointer`}>
        {estado.ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <FileUp className="size-4" />} Escolher o .xlsx do Machine Ledger
        <input type="file" accept=".xlsx,.xlsm" className="sr-only" onChange={ler} disabled={estado.ocupado} />
      </label>
      {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
      {estado.ok && <Mensagem tipo="ok">{estado.ok}</Mensagem>}
    </div>
  );
}

/** Enviar o export em texto das listas de tarefas gerais do SAP (lido no navegador; substitui o cadastro inteiro). */
export function EnviarListas({ atual }: { atual: number }) {
  const router = useRouter();
  const [estado, setEstado] = useState({ ocupado: false, erro: "", ok: "" });
  const ler = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    setEstado({ ocupado: true, erro: "", ok: "" });
    try {
      const bytes = new Uint8Array(await arq.arrayBuffer());
      let texto = new TextDecoder("utf-8").decode(bytes);
      if (texto.includes("\uFFFD")) texto = new TextDecoder("windows-1252").decode(bytes); // export salvo em ANSI
      const r = lerListasTarefas(texto);
      if ("erro" in r) { setEstado({ ocupado: false, erro: r.erro, ok: "" }); return; }
      const ops = r.listas.reduce((s, l) => s + l.operacoes.length, 0);
      if (!window.confirm(`${r.listas.length} listas e ${ops} operações. Substituir as ${atual} listas atuais?`)) { setEstado({ ocupado: false, erro: "", ok: "" }); return; }
      const resp = await enviar({ acao: "listas", listas: r.listas });
      setEstado({ ocupado: false, erro: resp.erro, ok: resp.erro ? "" : `${resp.resposta.listas} listas de tarefas gravadas.` });
      if (!resp.erro) router.refresh();
    } catch (err) {
      setEstado({ ocupado: false, erro: `Não foi possível ler o arquivo: ${(err as Error).message || "arquivo inválido"}.`, ok: "" });
    }
  };
  return (
    <div className="space-y-3">
      <label className={`${BOTAO_PRIMARIO} cursor-pointer`}>
        {estado.ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <FileUp className="size-4" />} Escolher o .txt das listas de tarefas
        <input type="file" accept=".txt,text/plain" className="sr-only" onChange={ler} disabled={estado.ocupado} />
      </label>
      {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
      {estado.ok && <Mensagem tipo="ok">{estado.ok}</Mensagem>}
    </div>
  );
}
