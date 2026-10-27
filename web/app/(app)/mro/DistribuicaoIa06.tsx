"use client";

import { Download, FileCode2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Selo } from "@/components/ui";
import { ROTULO_NIVEL, type Atribuicao, type Nivel, type OpcaoLista } from "@/lib/wcm/distribuicaoIa06";

import { ansi, ARQ_CSV, ARQ_VBS, csvInclusao, operacao4, scriptInclusao, type ItemInclusao } from "./ia06";

const ENTRADA = "h-9 rounded-lg border border-borda bg-superficie-2 px-2 text-[13px] transition focus:border-[var(--acao)] focus:bg-superficie";
const COR: Record<Nivel, "verde" | "azul" | "amarelo" | "cinza"> = { alta: "verde", media: "azul", baixa: "amarelo", sem: "cinza" };

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

interface Linha { incluir: boolean; lista: string; operacao: string; qtd: string }

/**
 * Inclusão das peças do ativo nas listas de tarefas do SAP (IA06) já distribuídas: cada peça na lista do subconjunto
 * dela e na operação que combina com ela, com o motivo. A pessoa confere, troca a lista ou a operação de qualquer peça,
 * e baixa uma carga só (CSV com a operação em cada linha) + o script VBS.
 */
export function DistribuicaoIa06({ rotulo, atribuicoes, listas, nomes, comTextoIa03 }: {
  rotulo: string; atribuicoes: Atribuicao[]; listas: Record<string, OpcaoLista>; nomes: Record<string, string>; comTextoIa03: boolean;
}) {
  const [linhas, setLinhas] = useState<Record<string, Linha>>(() => Object.fromEntries(atribuicoes.map((a) => [a.codigo,
    { incluir: a.nivel !== "sem" && !!a.lista && !!a.operacao, lista: a.lista ?? "", operacao: a.operacao, qtd: "1" }])));
  const [soEscolher, setSoEscolher] = useState(false);
  const [teste, setTeste] = useState(true);
  const muda = (cod: string, x: Partial<Linha>) => setLinhas((l) => ({ ...l, [cod]: { ...l[cod], ...x } }));

  const contagem = useMemo(() => {
    const c: Record<Nivel, number> = { alta: 0, media: 0, baixa: 0, sem: 0 };
    for (const a of atribuicoes) c[a.nivel]++;
    return c;
  }, [atribuicoes]);
  const itens = useMemo((): ItemInclusao[] => atribuicoes.flatMap((a) => {
    const l = linhas[a.codigo], lt = l && listas[l.lista];
    if (!l?.incluir || !lt || !/^\d{1,4}$/.test(l.operacao.trim())) return [];
    return [{ grupo: lt.grupo, numerador: lt.numerador, operacao: operacao4(l.operacao), material: a.codigo, um: a.um, texto: a.descricao,
      quantidade: Number(String(l.qtd).replace(",", ".")) || 1, equipamento: rotulo, usoLista: lt.equipamentos }];
  }), [atribuicoes, linhas, listas, rotulo]);
  const semOperacao = atribuicoes.filter((a) => linhas[a.codigo]?.incluir && !/^\d{1,4}$/.test(linhas[a.codigo].operacao.trim())).length;
  const gerais = [...new Set(itens.filter((i) => (i.usoLista ?? 1) > 1).map((i) => `${i.grupo}/${i.numerador}`))];
  const visiveis = soEscolher ? atribuicoes.filter((a) => a.nivel === "sem") : atribuicoes;

  if (!Object.keys(listas).length) {
    return <p className="text-[13px] text-texto-3">Nenhuma lista de tarefas achada para o ativo nem para os subconjuntos dele (planos da IP19 e ordens do IW38).</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] leading-relaxed text-texto-3">
        Cada peça foi posta na lista de tarefas do subconjunto onde está vinculada e na operação que combina com ela (troca da mesma peça, mesmo
        assunto ou a operação que cita a peça). Confira, troque a lista ou a operação se precisar e baixe a carga: um CSV só, com a operação em
        cada linha, e o script. Salve os dois na mesma pasta e rode primeiro em modo teste.
        {!comTextoIa03 && <> Envie o texto das listas (IA03) em Fontes de dados para o site conhecer as operações de cada lista.</>}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <Wand2 className="size-4 text-alp-azul" />
        {(Object.keys(contagem) as Nivel[]).map((n) => <Selo key={n} cor={COR[n]}>{ROTULO_NIVEL[n]}: {contagem[n]}</Selo>)}
        <label className="ml-auto inline-flex items-center gap-2"><input type="checkbox" checked={soEscolher} onChange={(e) => setSoEscolher(e.target.checked)} /> Só as que precisam escolher</label>
      </div>
      <ul className="max-h-[32rem] divide-y divide-borda overflow-y-auto rounded-xl border border-borda bg-superficie">
        {visiveis.map((a) => {
          const l = linhas[a.codigo];
          const lt = listas[l.lista];
          return (
            <li key={a.codigo} className="grid gap-2 px-3 py-2.5 text-[13px] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_4.5rem]">
              <label className="flex min-w-0 cursor-pointer items-start gap-2">
                <input type="checkbox" className="mt-1" checked={l.incluir} onChange={(e) => muda(a.codigo, { incluir: e.target.checked })} aria-label={`Incluir ${a.codigo}`} />
                <span className="min-w-0">
                  <span className="font-mono text-[12.5px] text-alp-azul">{a.codigo}</span> <span className="text-texto-2">{a.descricao || "—"}</span>
                  <span className="block truncate text-[11.5px] text-texto-3" title={nomes[a.origem]}>Vinculada em: {nomes[a.origem] || a.origem}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    <Selo cor={COR[a.nivel]}>{ROTULO_NIVEL[a.nivel]}</Selo>
                    {a.conferida && <Selo cor="verde">conferida no manual</Selo>}
                  </span>
                  <span className="block text-[11.5px] text-texto-3">{a.motivo}</span>
                </span>
              </label>
              <select className={`${ENTRADA} w-full min-w-0`} value={l.lista} aria-label={`Lista de ${a.codigo}`}
                onChange={(e) => muda(a.codigo, { lista: e.target.value, operacao: listas[e.target.value]?.operacoes.length ? "" : "0010" })}>
                {!l.lista && <option value="">Escolha a lista</option>}
                {a.listas.map((k) => listas[k] && (
                  <option key={k} value={k}>{listas[k].grupo}/{listas[k].numerador} · {listas[k].donoNome}{listas[k].equipamentos > 1 ? ` (geral: ${listas[k].equipamentos} equip.)` : ""}</option>
                ))}
              </select>
              {lt?.operacoes.length ? (
                <select className={`${ENTRADA} w-full min-w-0`} value={l.operacao} aria-label={`Operação de ${a.codigo}`}
                  onChange={(e) => muda(a.codigo, { operacao: e.target.value, incluir: !!e.target.value || l.incluir })}>
                  <option value="">Escolha a operação</option>
                  {lt.operacoes.map((o) => <option key={o.operacao} value={o.operacao}>{o.operacao} · {o.texto}</option>)}
                </select>
              ) : (
                <input className={`${ENTRADA} w-full font-mono`} value={l.operacao} maxLength={4} placeholder="0010" aria-label={`Operação de ${a.codigo}`}
                  onChange={(e) => muda(a.codigo, { operacao: e.target.value })} onBlur={() => muda(a.codigo, { operacao: operacao4(l.operacao) })} />
              )}
              <span className="flex items-center gap-1">
                <input className={`${ENTRADA} w-full text-right`} inputMode="decimal" value={l.qtd} aria-label={`Quantidade de ${a.codigo}`}
                  onChange={(e) => muda(a.codigo, { qtd: e.target.value })} />
                <span className="text-[11.5px] text-texto-3">{a.um}</span>
              </span>
            </li>
          );
        })}
        {!visiveis.length && <li className="px-3 py-4 text-[13px] text-texto-3">Nenhuma peça para escolher: todas já têm lista e operação.</li>}
      </ul>
      {gerais.length > 0 && (
        <p className="text-[12.5px] text-[color:var(--st-serio)]">Atenção: {gerais.join(", ")} {gerais.length > 1 ? "são listas gerais" : "é lista geral"} — a peça entra para todos os equipamentos que usam a lista.</p>
      )}
      {semOperacao > 0 && <p className="text-[12.5px] text-[color:var(--st-critico)]">{semOperacao} peça(s) marcada(s) sem operação: escolha a operação ou desmarque.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-[13px]"><input type="checkbox" checked={teste} onChange={(e) => setTeste(e.target.checked)} /> Modo teste (não grava no SAP)</label>
        <span className="text-[12.5px] text-texto-3">{itens.length} inclusão(ões) em {new Set(itens.map((i) => `${i.grupo}|${i.numerador}`)).size} lista(s)</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={BOTAO_SECUNDARIO} disabled={!itens.length}
            onClick={() => baixar(ARQ_CSV, csvInclusao(itens), "text/csv;charset=windows-1252")}><Download className="size-4" /> Baixar CSV</button>
          <button type="button" className={BOTAO_PRIMARIO} disabled={!itens.length}
            onClick={() => baixar(ARQ_VBS, scriptInclusao(teste), "text/vbscript;charset=windows-1252")}><FileCode2 className="size-4" /> Baixar script VBS</button>
        </div>
      </div>
    </div>
  );
}
