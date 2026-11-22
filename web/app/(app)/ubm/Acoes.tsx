"use client";

import { Check, ClipboardList, Download, FileUp, LoaderCircle, Pencil, Plus, Trash2, Undo2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Campo, ENTRADA, Mensagem } from "@/components/Campos";
import { BOTAO_COMPACTO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";
import { Xlsx } from "@/lib/leitura/xlsx";
import * as R from "@/lib/ubm/regras";

/** Envia uma ação para /api/ubm; devolve o erro ("" = deu certo) e a resposta. */
export async function enviarUbm(form: FormData): Promise<{ erro: string; resposta: Record<string, unknown> }> {
  const r = await fetch("/api/ubm", { method: "POST", body: form }).catch(() => null);
  const j: Record<string, unknown> = (await r?.json().catch(() => ({}))) ?? {};
  if (!r?.ok) return { erro: String(j.erro || (r?.status === 413 ? "A foto ficou grande demais." : "Não foi possível gravar agora; tente de novo.")), resposta: j };
  return { erro: "", resposta: j };
}

const LINHA = "inline-flex h-9 items-center gap-1 rounded-lg border border-borda px-2.5 text-[12.5px] hover:bg-superficie-2 disabled:opacity-60";

/** Botão de uma ação simples (fechar solicitação; desfazer validação, com `id` = a chave ordem|código). */
export function BotaoAcao({ acao, id, rotulo, confirmar }: { acao: "fechar" | "desfazer"; id: string; rotulo: string; confirmar?: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState({ ocupado: false, erro: "" });
  const rodar = async () => {
    if (confirmar && !window.confirm(confirmar)) return;
    const f = new FormData();
    f.set("acao", acao);
    f.set(acao === "desfazer" ? "chave" : "id", id);
    setEstado({ ocupado: true, erro: "" });
    const r = await enviarUbm(f);
    setEstado({ ocupado: false, erro: r.erro });
    if (!r.erro) router.refresh();
  };
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={rodar} disabled={estado.ocupado} aria-busy={estado.ocupado} className={BOTAO_COMPACTO}>
        {estado.ocupado ? <LoaderCircle className="size-3.5 animate-spin" /> : acao === "desfazer" ? <Undo2 className="size-3.5" /> : <Check className="size-3.5" />} {rotulo}
      </button>
      {estado.erro && <span role="alert" className="text-[12px] text-[var(--selo-critico-texto)]">{estado.erro}</span>}
    </span>
  );
}

export interface LinhaLancamento { codigo: string; descricao: string; um: string; saldo: number; separar: number }

/** Reposição (soma ao saldo) ou contagem (fixa o saldo) dos itens do kit de um armário. */
export function Lancamento({ armario, itens, tipo }: { armario: string; itens: LinhaLancamento[]; tipo: "reposicao" | "contagem" }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState({ ocupado: false, erro: "", ok: "" });
  const rotulo = tipo === "reposicao" ? "Registrar reposição" : "Registrar contagem";
  const abrir = () => {
    setQ(Object.fromEntries(itens.map((i) => [i.codigo, tipo === "reposicao" && i.separar > 0 ? String(i.separar).replace(".", ",") : ""])));
    setEstado({ ocupado: false, erro: "", ok: "" });
    setAberto(true);
  };
  const gravar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData();
    f.set("acao", tipo);
    f.set("u", armario);
    f.set("itens", JSON.stringify(itens.map((i) => ({ codigo: i.codigo, quantidade: q[i.codigo] ?? "" })).filter((l) => l.quantidade.trim())));
    setEstado({ ocupado: true, erro: "", ok: "" });
    const r = await enviarUbm(f);
    if (r.erro) { setEstado({ ocupado: false, erro: r.erro, ok: "" }); return; }
    setEstado({ ocupado: false, erro: "", ok: `${tipo === "reposicao" ? "Reposição" : "Contagem"} registrada (${r.resposta.itens} itens).` });
    setAberto(false);
    router.refresh();
  };
  if (!aberto) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {estado.ok && <span role="status" className="text-[12.5px] text-[var(--selo-bom-texto)]">{estado.ok}</span>}
        <button type="button" onClick={abrir} className={tipo === "reposicao" ? BOTAO_COMPACTO : LINHA}>
          {tipo === "reposicao" ? <Upload className="size-3.5" /> : <ClipboardList className="size-3.5" />} {rotulo}
        </button>
      </span>
    );
  }
  return (
    <form onSubmit={gravar} aria-label={`${rotulo} · ${armario}`} className="w-full space-y-3 rounded-cartao border border-borda bg-superficie-2 p-4">
      <div className="font-display text-[15px] font-medium">{rotulo} · {armario}</div>
      <p className="text-[12.5px] text-texto-3">
        {tipo === "reposicao" ? "Quantidade que foi colocada no armário (já vem a sugestão: padrão − saldo). Deixe em branco o que não foi reposto."
          : "Quantidade contada no armário agora: fixa o saldo do item. Deixe em branco o que não foi contado."}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {itens.map((i) => (
          <li key={i.codigo} className="flex items-center gap-3 rounded-xl border border-borda bg-superficie px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="num text-[13px] font-medium">{i.codigo}</div>
              <div className="truncate text-[12px] text-texto-3">{i.descricao || "—"} · saldo {R.fmtQtd(i.saldo)} {i.um}</div>
            </div>
            <label className="flex items-center gap-1.5 text-[12.5px] text-texto-3">
              <input value={q[i.codigo] ?? ""} onChange={(e) => setQ({ ...q, [i.codigo]: e.target.value })} inputMode="decimal" autoComplete="off"
                aria-label={`Quantidade de ${i.codigo}`} className={`${ENTRADA} w-24 text-right`} />
              {i.um}
            </label>
          </li>
        ))}
      </ul>
      {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={estado.ocupado} aria-busy={estado.ocupado} className={BOTAO_PRIMARIO}>
          {estado.ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} {estado.ocupado ? "Gravando…" : "Gravar"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className={BOTAO_SECUNDARIO}>Cancelar</button>
      </div>
    </form>
  );
}

type LinhaEditor = { codigo: string; descricao: string; um: string; quantidade: string; minimo: string };
const linhaDe = (i: R.ItemKit): LinhaEditor => ({ codigo: i.codigo, descricao: i.descricao, um: i.um, quantidade: String(i.maximo).replace(".", ","),
  minimo: i.minimo === i.maximo ? "" : String(i.minimo).replace(".", ",") });
const VAZIA: LinhaEditor = { codigo: "", descricao: "", um: "PC", quantidade: "", minimo: "" };

/** Cadastro de um armário (novo ou edição) e o kit: item a item, colando a lista ou pela planilha (modelo, importar, exportar). */
export function EditorArmario({ armario }: { armario?: R.Armario }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<LinhaEditor[]>([]);
  const [colar, setColar] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string; lista?: string[] } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const novo = !armario;

  const abrir = () => { setItens(armario ? armario.itens.map(linhaDe) : [{ ...VAZIA }]); setColar(""); setAviso(null); setAberto(true); };
  const mudar = (i: number, k: keyof LinhaEditor, v: string) => setItens(itens.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  /** Junta os itens novos ao kit (o mesmo código é substituído). */
  const juntar = (novos: R.ItemKit[], substituir: boolean) => {
    const base = substituir ? [] : itens.filter((l) => l.codigo.trim());
    const porCodigo = new Map(base.map((l) => [R.normalizarCodigo(l.codigo), l]));
    for (const n of novos) porCodigo.set(n.codigo, linhaDe(n));
    setItens([...porCodigo.values()]);
  };
  const mostrarErros = (titulo: string, erros: string[]) =>
    setAviso({ tipo: "erro", texto: titulo, lista: [...erros.slice(0, 12), ...(erros.length > 12 ? [`E mais ${erros.length - 12} erro(s).`] : [])] });

  const daColagem = () => {
    const { itens: novos, erros } = R.prepararKit(R.linhasDoTexto(colar));
    if (erros.length) { mostrarErros("Corrija a lista colada:", erros); return; }
    if (!novos.length) { setAviso({ tipo: "erro", texto: "Nada para adicionar: cole uma linha por item (código, descrição, UM, quantidade)." }); return; }
    juntar(novos, false);
    setColar("");
    setAviso({ tipo: "ok", texto: `${novos.length} item(ns) da lista colada no kit. Confira e salve.` });
  };

  const importar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    try {
      const x = new Xlsx(new Uint8Array(await arq.arrayBuffer()));
      const aba = x.abas[0];
      const { linhas, erro } = R.linhasDaPlanilha(aba ? x.linhas(aba, R.MAX_ITENS_KIT + 2) : []);
      if (erro) { setAviso({ tipo: "erro", texto: erro }); return; }
      const { itens: novos, erros } = R.prepararKit(linhas, 2);
      if (erros.length) { mostrarErros("Corrija a planilha antes de importar (nada foi importado):", erros); return; }
      if (!window.confirm(`Trocar o kit pelos ${novos.length} itens desta planilha?`)) return;
      juntar(novos, true);
      setAviso({ tipo: "ok", texto: `${novos.length} item(ns) importados da planilha. Confira e salve.` });
    } catch (err) {
      setAviso({ tipo: "erro", texto: `Não foi possível ler a planilha: ${(err as Error).message || "arquivo inválido"}.` });
    }
  };

  const salvar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    f.set("acao", "armario");
    f.set("novo", novo ? "1" : "0");
    if (armario) f.set("id", armario.id);
    f.set("ativo", f.get("ativo") === "on" ? "sim" : "nao");
    f.set("itens", JSON.stringify(itens.filter((l) => l.codigo.trim() || l.quantidade.trim())));
    setOcupado(true);
    const r = await enviarUbm(f);
    setOcupado(false);
    if (r.erro) { setAviso({ tipo: "erro", texto: r.erro }); return; }
    setAberto(false);
    router.refresh();
  };

  if (!aberto) {
    return novo ? <button type="button" onClick={abrir} className={BOTAO_PRIMARIO}><Plus className="size-4" /> Novo armário</button>
      : <button type="button" onClick={abrir} className={LINHA}><Pencil className="size-3.5" /> Editar armário e kit</button>;
  }
  const titulo = novo ? "Novo armário kanban" : `Editar ${armario.id}`;
  return (
    <form onSubmit={salvar} aria-label={titulo} className="w-full space-y-4 rounded-cartao border border-borda bg-superficie-2 p-4">
      <div className="font-display text-[15px] font-medium">{titulo}</div>
      <div className="grid gap-3 sm:grid-cols-3">
        {novo ? <Campo rotulo="Identificação" name="id" required placeholder="UBM-01" pattern="[Uu][Bb][Mm]-\d{2,3}" title="UBM- e 2 ou 3 números" autoComplete="off" />
          : <div><span className="mb-1.5 block text-[13px] font-semibold">Identificação</span><div className="num flex h-11 items-center font-medium">{armario.id}</div></div>}
        <Campo rotulo="Nome do armário" name="nome" required minLength={3} maxLength={80} defaultValue={armario?.nome} autoComplete="off" />
        <Campo rotulo="Local / linha" name="local" maxLength={80} defaultValue={armario?.local} autoComplete="off" />
      </div>
      <label className="flex items-center gap-2 text-[13.5px]">
        <input type="checkbox" name="ativo" defaultChecked={armario?.ativo ?? true} className="size-4 accent-[var(--acao)]" /> Armário ativo (em uso no campo)
      </label>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-[13px] font-semibold">Kit do armário · {itens.filter((l) => l.codigo.trim()).length} itens</div>
            <p className="text-[12px] text-texto-3">Quantidade padrão = o que deve ficar no armário. Mínimo opcional: em branco, repõe sempre que ficar abaixo do padrão. Peça (PC, UN) só inteiro; metro e outras UM aceitam 2 casas.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/api/ubm?planilha=modelo_kit" className={LINHA}><Download className="size-3.5" /> Modelo Excel</a>
            {armario && <a href={`/api/ubm?planilha=kit&u=${encodeURIComponent(armario.id)}`} className={LINHA}><Download className="size-3.5" /> Exportar kit</a>}
            <label className={`${LINHA} cursor-pointer`}>
              <FileUp className="size-3.5" /> Importar Excel
              <input type="file" className="sr-only" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importar} />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-borda bg-superficie">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="text-left text-[12px] text-texto-3">
              <tr><th className="px-2 py-2">Código</th><th className="px-2 py-2">Descrição (opcional)</th><th className="px-2 py-2">UM</th>
                <th className="px-2 py-2">Padrão</th><th className="px-2 py-2">Mínimo</th><th className="px-2 py-2"><span className="sr-only">Remover</span></th></tr>
            </thead>
            <tbody>
              {itens.map((l, i) => (
                <tr key={i} className="border-t border-borda">
                  <td className="px-2 py-1.5"><input value={l.codigo} onChange={(e) => mudar(i, "codigo", e.target.value)} aria-label={`Código do item ${i + 1}`} className={`${ENTRADA} h-10 w-32`} autoComplete="off" /></td>
                  <td className="px-2 py-1.5"><input value={l.descricao} onChange={(e) => mudar(i, "descricao", e.target.value)} aria-label={`Descrição do item ${i + 1}`} className={`${ENTRADA} h-10`} maxLength={120} autoComplete="off" /></td>
                  <td className="px-2 py-1.5"><input value={l.um} onChange={(e) => mudar(i, "um", e.target.value.toUpperCase())} aria-label={`UM do item ${i + 1}`} className={`${ENTRADA} h-10 w-16`} maxLength={5} autoComplete="off" /></td>
                  <td className="px-2 py-1.5"><input value={l.quantidade} onChange={(e) => mudar(i, "quantidade", e.target.value)} aria-label={`Quantidade padrão do item ${i + 1}`} inputMode="decimal" className={`${ENTRADA} h-10 w-20 text-right`} autoComplete="off" /></td>
                  <td className="px-2 py-1.5"><input value={l.minimo} onChange={(e) => mudar(i, "minimo", e.target.value)} aria-label={`Mínimo do item ${i + 1}`} inputMode="decimal" placeholder="= padrão" className={`${ENTRADA} h-10 w-24 text-right`} autoComplete="off" /></td>
                  <td className="px-2 py-1.5"><button type="button" onClick={() => setItens(itens.filter((_, j) => j !== i))} aria-label={`Remover item ${i + 1}`}
                    className="grid size-10 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-[var(--selo-critico-texto)]"><Trash2 className="size-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => setItens([...itens, { ...VAZIA }])} className={LINHA}><Plus className="size-3.5" /> Adicionar item</button>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold">Colar a lista de itens (opcional)</span>
        <textarea value={colar} onChange={(e) => setColar(e.target.value)} rows={4} spellCheck={false}
          placeholder={"Uma linha por item: código, descrição, UM, quantidade\n(separados por tab, ponto e vírgula ou vários espaços)"}
          className={`${ENTRADA} h-auto py-2.5 font-mono text-[13px]`} />
        <button type="button" onClick={daColagem} disabled={!colar.trim()} className={`${LINHA} mt-2`}><ClipboardList className="size-3.5" /> Adicionar da lista colada</button>
      </label>

      {aviso && (
        <div className="space-y-1">
          <Mensagem tipo={aviso.tipo}>{aviso.texto}</Mensagem>
          {aviso.lista && <ul className="list-disc pl-6 text-[12.5px] text-[var(--selo-critico-texto)]">{aviso.lista.map((l) => <li key={l}>{l}</li>)}</ul>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={ocupado} aria-busy={ocupado} className={BOTAO_PRIMARIO}>
          {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} {ocupado ? "Gravando…" : "Salvar armário"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className={BOTAO_SECUNDARIO}><X className="size-4" /> Cancelar</button>
      </div>
    </form>
  );
}
