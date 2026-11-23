"use client";

import { Check, Download, FileCode2, LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Selo } from "@/components/ui";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";
import { ansi, ARQ_CSV, ARQ_VBS, csvInclusao, scriptInclusao } from "@/app/(app)/mro/ia06";
import { itensIa06, type LinhaOperacao, prontaParaIa06 } from "@/lib/machineLedger/listasTarefas";

const ENTRADA = "h-9 rounded-lg border border-borda bg-superficie-2 px-2 text-[13px]";
const LINHA = "inline-flex h-9 items-center gap-1 rounded-lg border border-borda px-2.5 text-[12.5px] hover:bg-superficie-2 disabled:opacity-60";
const MAX = 150;

function baixar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([ansi(conteudo) as BlobPart], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const valorOp = (o: { grupo: string; numerador: string; operacao: string } | null | undefined) => (o ? `${o.grupo}|${o.numerador}|${o.operacao}` : "");

/**
 * Operações das listas de tarefas da máquina × componentes do RCM: sugestão por texto, confirmação do PCM e a carga IA06
 * (CSV + script VBS da Gestão de MRO) dos componentes com código válido que ainda não estão na operação.
 */
export function OperacoesIa06({ ledger, rotulo, linhas, ops, grava }: { ledger: string; rotulo: string; linhas: LinhaOperacao[];
  ops: { valor: string; rotulo: string }[]; grava: boolean }) {
  const router = useRouter();
  const [soCodigo, setSoCodigo] = useState(true);
  const [incluirAlta, setIncluirAlta] = useState(false);
  const [teste, setTeste] = useState(true);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<{ ocupado: string; erro: string }>({ ocupado: "", erro: "" });

  const visiveis = linhas.filter((l) => !soCodigo || l.codigoOk);
  const quantidades = useMemo(() => Object.fromEntries(Object.entries(qtd).map(([k, v]) => [k, Number(v.replace(",", "."))]).filter(([, v]) => Number(v) > 0)), [qtd]);
  const itens = useMemo(() => itensIa06(linhas, quantidades, incluirAlta, rotulo), [linhas, quantidades, incluirAlta, rotulo]);

  const gravar = async (l: LinhaOperacao, remover: boolean) => {
    const v = escolha[l.chave] ?? valorOp(l.confirmada ?? l.sugestao);
    const [grupo, numerador, operacao] = v.split("|");
    if (!remover && !operacao) { setEstado({ ocupado: "", erro: "Escolha a operação." }); return; }
    setEstado({ ocupado: l.chave, erro: "" });
    const q = Number(String(qtd[l.chave] ?? l.confirmada?.quantidade ?? l.qtdRcm).replace(",", "."));
    const r = await fetch("/api/machine_ledger", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "operacao", chave: l.chave, alvo: remover ? null : { grupo, numerador, operacao, quantidade: q } }) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { erro?: string } | undefined;
    setEstado({ ocupado: "", erro: r?.ok ? "" : j?.erro || "Não foi possível gravar agora; tente de novo." });
    if (r?.ok) router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-borda bg-superficie-2 px-3">
          <input type="checkbox" checked={soCodigo} onChange={(e) => setSoCodigo(e.target.checked)} className="size-4" /> Só com código SAP válido
        </label>
        <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-borda bg-superficie-2 px-3">
          <input type="checkbox" checked={incluirAlta} onChange={(e) => setIncluirAlta(e.target.checked)} className="size-4" /> Incluir sugestões de alta confiança na IA06
        </label>
        <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-borda bg-superficie-2 px-3">
          <input type="checkbox" checked={teste} onChange={(e) => setTeste(e.target.checked)} className="size-4" /> Script em modo teste
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-texto-2"><b className="num">{itens.length}</b> componente(s) prontos para a IA06</span>
        <button type="button" className={BOTAO_PRIMARIO} disabled={!itens.length}
          onClick={() => baixar(ARQ_CSV, csvInclusao(itens), "text/csv;charset=windows-1252")}><Download className="size-4" /> Baixar CSV da IA06</button>
        <button type="button" className={BOTAO_SECUNDARIO}
          onClick={() => baixar(ARQ_VBS, scriptInclusao(teste), "text/vbscript;charset=windows-1252")}><FileCode2 className="size-4" /> Baixar script VBS</button>
        <a href={`/api/machine_ledger?planilha=operacoes&id=${ledger}`} className={BOTAO_SECUNDARIO}><Download className="size-4" /> Excel da associação</a>
      </div>
      {estado.erro && <p role="alert" className="text-[13px] text-[var(--st-critico)]">{estado.erro}</p>}
      <ul className="space-y-2" aria-label="Operações por componente">
        {visiveis.slice(0, MAX).map((l) => {
          const atual = escolha[l.chave] ?? valorOp(l.confirmada ?? l.sugestao);
          return (
            <li key={l.chave} data-componente={l.chave} className="rounded-xl border border-borda bg-superficie p-3">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-medium">{l.componente}</span>
                <span className="text-texto-3">· {l.conjunto}{l.subconjunto ? ` › ${l.subconjunto}` : ""}</span>
                {l.codigoOk ? <Selo cor="verde">{l.codigo}</Selo> : <Selo>{l.codigo ? `${l.codigo} (inválido)` : "sem código SAP"}</Selo>}
                {l.confirmada ? <Selo cor="azul">confirmada</Selo> : l.sugestao ? <Selo cor={l.sugestao.confianca === "alta" ? "verde" : l.sugestao.confianca === "media" ? "amarelo" : "cinza"}>sugestão {l.sugestao.confianca === "media" ? "média" : l.sugestao.confianca}</Selo>
                  : <Selo>sem operação</Selo>}
                {l.jaNaOperacao && <Selo cor="cinza">já na operação</Selo>}
                {prontaParaIa06(l, incluirAlta) && <Selo cor="laranja">vai na IA06</Selo>}
              </div>
              {l.sugestao && !l.confirmada && <div className="mt-1 text-[12.5px] text-texto-3">{l.sugestao.grupo}/{l.sugestao.numerador} · {l.sugestao.operacao} {l.sugestao.texto} — {l.sugestao.motivo}</div>}
              {grava ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select aria-label={`Operação de ${l.componente}`} value={atual} onChange={(e) => setEscolha({ ...escolha, [l.chave]: e.target.value })}
                    className={`${ENTRADA} min-w-0 max-w-full flex-1 sm:max-w-[28rem]`}>
                    <option value="">Escolha a operação…</option>
                    {ops.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                  </select>
                  <input aria-label={`Quantidade de ${l.componente}`} inputMode="decimal" className={`${ENTRADA} w-20`} value={qtd[l.chave] ?? String(l.confirmada?.quantidade ?? l.qtdRcm)}
                    onChange={(e) => setQtd({ ...qtd, [l.chave]: e.target.value })} />
                  <span className="text-[12px] text-texto-3">{l.um}</span>
                  <button type="button" className={LINHA} disabled={!!estado.ocupado} onClick={() => gravar(l, false)}>
                    {estado.ocupado === l.chave ? <LoaderCircle className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Confirmar
                  </button>
                  {l.confirmada && <button type="button" className={LINHA} disabled={!!estado.ocupado} onClick={() => gravar(l, true)}><Trash2 className="size-3.5" /> Remover</button>}
                </div>
              ) : l.confirmada && <div className="mt-1 text-[12.5px] text-texto-2">{l.confirmada.grupo}/{l.confirmada.numerador} · {l.confirmada.operacao}</div>}
            </li>
          );
        })}
      </ul>
      {visiveis.length > MAX && <p className="text-[12.5px] text-texto-3">Mostrando {MAX} de {visiveis.length} componentes; o Excel traz todos (e a IA06 inclui todos os prontos).</p>}
    </div>
  );
}
