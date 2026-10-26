"use client";

import { Download, FileCode2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";

import { ansi, ARQ_CSV, ARQ_VBS, csvInclusao, operacao4, scriptInclusao, type ItemInclusao, type ListaTarefas } from "./ia06";

const ENTRADA = "h-9 rounded-lg border border-borda bg-superficie-2 px-2.5 text-[13px] transition focus:border-[var(--acao)] focus:bg-superficie";

function baixar(nome: string, conteudo: string, tipo: string) {
  const blob = new Blob([ansi(conteudo) as BlobPart], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

interface Peca { codigo: string; descricao: string; um: string }

/**
 * Inclusão das peças do ativo nos componentes das listas de tarefas (IA06): escolhe as listas (achadas pelos planos
 * do equipamento, ou digitadas), a operação, as peças e a quantidade, e baixa o CSV da carga + o script VBS.
 */
export function InclusaoIa06({ equipamento, rotulo, pecas, listas }: { equipamento: string; rotulo: string; pecas: Peca[]; listas: ListaTarefas[] }) {
  const [todas, setTodas] = useState<ListaTarefas[]>(listas);
  // lista geral usada por outros equipamentos começa desmarcada (a peça entraria para todos eles); a de subconjunto também
  // (cada peça vai na lista do subconjunto dela: a pessoa escolhe)
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(listas.filter((l) => l.equipamentos <= 1 && !l.subconjunto)
    .map((l) => `${l.grupo}|${l.numerador}`)));
  const [novoGrupo, setNovoGrupo] = useState(""), [novoNum, setNovoNum] = useState("1");
  const [operacao, setOperacao] = useState("0010");
  const [qtd, setQtd] = useState<Record<string, string>>(() => Object.fromEntries(pecas.map((p) => [p.codigo, "1"])));
  const [sel, setSel] = useState<Set<string>>(() => new Set(pecas.map((p) => p.codigo)));
  const [teste, setTeste] = useState(true);

  const itens = useMemo((): ItemInclusao[] => {
    const ls = todas.filter((l) => marcadas.has(`${l.grupo}|${l.numerador}`));
    return ls.flatMap((l) => pecas.filter((p) => sel.has(p.codigo)).map((p) => ({
      grupo: l.grupo, numerador: l.numerador, operacao, material: p.codigo,
      quantidade: Number(String(qtd[p.codigo] ?? "1").replace(",", ".")) || 1, um: p.um, texto: p.descricao, equipamento: rotulo,
    })));
  }, [todas, marcadas, pecas, sel, qtd, operacao, rotulo]);

  const alterna = (s: Set<string>, k: string) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; };
  function adicionarLista() {
    const g = novoGrupo.trim().toUpperCase(), n = novoNum.trim() || "1";
    if (!g || todas.some((l) => l.grupo === g && l.numerador === n)) return;
    setTodas((x) => [...x, { grupo: g, numerador: n, planos: [], texto: "digitada", equipamentos: 1 }]);
    setMarcadas((m) => new Set(m).add(`${g}|${n}`));
    setNovoGrupo("");
  }

  const opValida = /^\d{1,4}$/.test(operacao.trim());
  return (
    <div className="mt-5 rounded-xl border border-borda bg-superficie-2/40 p-4">
      <div className="mb-1 flex items-center gap-2 text-[13.5px] font-medium"><FileCode2 className="size-4 text-alp-azul" /> Incluir na lista de tarefas do SAP (IA06)</div>
      <p className="mb-4 text-[12.5px] leading-relaxed text-texto-3">
        Gera a carga e o script para incluir as peças deste ativo nos componentes da operação das listas de tarefas. O site não
        mexe no SAP: salve os dois arquivos na <b>mesma pasta</b>, abra o SAP na tela inicial e dê dois cliques no script. Rode primeiro
        em <b>modo teste</b> (inclui na tela sem gravar) e confira o log; depois baixe o script sem o modo teste.
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <div className="text-[12.5px] font-medium text-texto-2">Listas de tarefas {listas.length ? "(pelos planos do equipamento e dos subconjuntos: IW38 × IP19)" : ""}</div>
          {!todas.length && <p className="text-[12.5px] text-texto-3">Nenhuma lista achada pelos planos deste equipamento nem dos subconjuntos (IW38 × IP19). Digite o grupo e o numerador abaixo e clique em + Lista.</p>}
          {listas.some((l) => l.subconjunto) && <p className="text-[12px] text-texto-3">As listas dos subconjuntos começam desmarcadas: marque a do subconjunto de cada peça.</p>}
          <ul className="space-y-1">
            {todas.map((l) => {
              const k = `${l.grupo}|${l.numerador}`;
              return (
                <li key={k}>
                  <label className="flex cursor-pointer items-start gap-2 text-[13px]">
                    <input type="checkbox" className="mt-0.5" checked={marcadas.has(k)} onChange={() => setMarcadas((m) => alterna(m, k))} />
                    <span className="min-w-0"><span className="font-mono">{l.grupo}</span> / {l.numerador || "—"}
                      {l.subconjunto && <span className="block truncate text-[11.5px] font-medium text-texto-2" title={l.subconjunto}>Subconjunto: {l.subconjunto}</span>}
                      <span className="block truncate text-[11.5px] text-texto-3">{[l.planos.length ? `plano ${l.planos.join(", ")}` : "", l.texto].filter(Boolean).join(" · ")}</span>
                      {l.equipamentos > 1 && <span className="block text-[11.5px] text-[color:var(--st-serio)]">Lista geral usada por {l.equipamentos} equipamentos: a peça entra para todos eles.</span>}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${ENTRADA} w-32`} placeholder="Grupo" value={novoGrupo} maxLength={20} onChange={(e) => setNovoGrupo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarLista(); } }} aria-label="Grupo da lista de tarefas" />
            <input className={`${ENTRADA} w-20`} placeholder="Numerador" value={novoNum} maxLength={4} onChange={(e) => setNovoNum(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarLista(); } }} aria-label="Numerador da lista de tarefas" />
            <button type="button" onClick={adicionarLista} className="inline-flex h-9 items-center gap-1 rounded-lg border border-borda px-2.5 text-[12.5px] hover:bg-superficie-2">
              <Plus className="size-3.5" /> Lista
            </button>
          </div>
          <label className="block pt-2 text-[12.5px] font-medium text-texto-2">Operação
            <input className={`${ENTRADA} ml-2 w-24 font-mono`} value={operacao} maxLength={4} onChange={(e) => setOperacao(e.target.value)} onBlur={() => setOperacao(operacao4(operacao))} />
          </label>
          {!opValida && <p className="text-[12px] text-[color:var(--st-critico)]">Informe o número da operação (ex.: 0010).</p>}
        </div>

        <div className="min-w-0">
          <div className="mb-2 text-[12.5px] font-medium text-texto-2">Peças e quantidade <span className="font-normal text-texto-3">(decimal com vírgula; a unidade é a do material no SAP)</span></div>
          <ul className="max-h-64 divide-y divide-borda overflow-y-auto rounded-xl border border-borda bg-superficie">
            {pecas.map((p) => (
              <li key={p.codigo} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                <input type="checkbox" checked={sel.has(p.codigo)} onChange={() => setSel((s) => alterna(s, p.codigo))} aria-label={`Incluir ${p.codigo}`} />
                <span className="font-mono text-[12.5px] text-alp-azul">{p.codigo}</span>
                <span className="min-w-0 flex-1 truncate text-texto-2" title={p.descricao}>{p.descricao || "—"}</span>
                <input className={`${ENTRADA} h-8 w-16 text-right`} inputMode="decimal" value={qtd[p.codigo] ?? "1"} disabled={!sel.has(p.codigo)}
                  onChange={(e) => setQtd((q) => ({ ...q, [p.codigo]: e.target.value }))} aria-label={`Quantidade de ${p.codigo}`} />
                <span className="w-8 text-[11.5px] text-texto-3">{p.um}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-[13px]"><input type="checkbox" checked={teste} onChange={(e) => setTeste(e.target.checked)} /> Modo teste (não grava no SAP)</label>
        <span className="text-[12.5px] text-texto-3">{itens.length} inclusão(ões) · {equipamento}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={BOTAO_SECUNDARIO} disabled={!itens.length || !opValida}
            onClick={() => baixar(ARQ_CSV, csvInclusao(itens), "text/csv;charset=windows-1252")}><Download className="size-4" /> Baixar CSV</button>
          <button type="button" className={BOTAO_PRIMARIO} disabled={!itens.length || !opValida}
            onClick={() => baixar(ARQ_VBS, scriptInclusao(teste), "text/vbscript;charset=windows-1252")}><FileCode2 className="size-4" /> Baixar script VBS</button>
        </div>
      </div>
      {!itens.length && <p className="mt-2 flex items-center gap-1 text-[12px] text-texto-3"><Trash2 className="size-3.5" /> {novoGrupo.trim() ? "Clique em + Lista para usar o grupo digitado." : "Marque pelo menos uma lista e uma peça."}</p>}
    </div>
  );
}
