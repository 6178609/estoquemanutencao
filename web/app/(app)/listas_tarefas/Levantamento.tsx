import Link from "next/link";

import { Selo } from "@/components/ui";
import { paginar } from "@/lib/paginacao";
import type { MaterialOperacao } from "@/lib/wcm/materiaisOperacoes";

import { GradeNumeros, inteiroBr, Numero, Paginacao, TabelaT } from "../equipamentos/_ui/Blocos";
import { FiltrosUrl } from "../equipamentos/_ui/FiltrosUrl";
import { hrefCom } from "../equipamentos/_ui/url";
import type { PecaMro } from "../mro/logica";
import { contar, filtrarLevantamento, hrefFicha, jaNaListaSap, lerFiltroLevantamento, um, type Params } from "./logica";
import { SaldoPeca } from "./Materiais";

/**
 * Levantamento dos manuais: para cada lista de tarefas e operação de troca, o material que o manual pede, a quantidade e
 * o código SAP (com o saldo), e se já está nos componentes da lista no SAP. A carga da IA06 sai daqui para as linhas com
 * código que faltam na lista.
 */
export function Levantamento({ itens, params, peca, naIa03, existe, edita }: { itens: MaterialOperacao[]; params: Params;
  peca: (codigo: string) => PecaMro; naIa03: (x: MaterialOperacao) => boolean; existe: (lista: string) => boolean; edita: boolean }) {
  if (!itens.length) {
    return <p className="text-[13px] text-texto-3">Nenhum levantamento enviado. Envie em Fontes de dados a planilha “Lista de materiais das máquinas por lista de tarefa” (aba Todas as Máquinas).</p>;
  }
  const f = lerFiltroLevantamento(params);
  const vis = filtrarLevantamento(itens, f, naIa03);
  const pg = paginar(vis, Number(um(params, "pag")) || 1);
  const n = (fn: (x: MaterialOperacao) => boolean) => vis.filter(fn).length;
  const falta = n((x) => !!x.codigo && !jaNaListaSap(x, naIa03(x)));
  const qs = hrefCom(params, { pag: null }).slice(1);
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] leading-relaxed text-texto-3">
        Materiais levantados nos manuais e desenhos de cada máquina, ligados à lista de tarefas e à operação de troca. Eles decidem a operação das
        peças na carga da IA06 (Gestão de MRO e ficha da lista) e entram na carga mesmo sem estar vinculados ao equipamento. As listas que não estão
        no texto da IA03 nem na IP19 não abrem a ficha: envie o texto delas em Fontes de dados.
      </p>
      <FiltrosUrl campos={[
        { tipo: "busca", param: "lq", placeholder: "Material, código, lista, operação, atividade…" },
        { tipo: "multi", param: "lmaq", rotulo: "Máquina", opcoes: contar(itens.map((x) => [x.maquina])) },
        { tipo: "alternar", param: "lcod", rotulo: "Só com código SAP" },
        { tipo: "alternar", param: "lfora", rotulo: "Só as que falta incluir na lista" },
      ]} />
      <GradeNumeros colunas={5}>
        <Numero rotulo="Linhas do levantamento" valor={inteiroBr(vis.length)} detalhe={`${inteiroBr(new Set(vis.map((x) => x.lista)).size)} listas`} />
        <Numero rotulo="Com código SAP" valor={inteiroBr(n((x) => !!x.codigo))} detalhe={`${inteiroBr(new Set(vis.filter((x) => x.codigo).map((x) => x.codigo)).size)} códigos`} tom="bom" />
        <Numero rotulo="Sem código SAP" valor={inteiroBr(n((x) => !x.codigo))} tom={n((x) => !x.codigo) ? "atencao" : undefined} detalhe="cadastrar ou identificar" />
        <Numero rotulo="Falta incluir na lista" valor={inteiroBr(falta)} detalhe="com código, fora dos componentes" />
        <Numero rotulo="Sem estoque" valor={inteiroBr(n((x) => !!x.codigo && peca(x.codigo).status !== "ok" && peca(x.codigo).status !== "baixo"))} detalhe="com código, saldo zero" />
      </GradeNumeros>
      {edita && falta > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-[13px]">
          <a href={`/api/listas_tarefas?${qs}&planilha=ia06lev`} download className="inline-flex h-9 items-center rounded-lg bg-[var(--acao)] px-3 font-medium text-white">Baixar carga IA06 (CSV)</a>
          <span className="text-[12.5px] text-texto-3">{inteiroBr(falta)} linha(s) com código que faltam na lista, com a operação e a quantidade do levantamento. O script VBS sai da ficha de qualquer ativo na Gestão de MRO.</span>
        </p>
      )}
      <TabelaT vazio="Nenhuma linha com estes filtros." colunas={[{ rotulo: "Máquina" }, { rotulo: "Lista · operação" }, { rotulo: "Atividade", larga: true },
        { rotulo: "Material (manual)", larga: true }, { rotulo: "Qtd.", dir: true }, { rotulo: "Código SAP" }, { rotulo: "Na lista?" }, { rotulo: "Saldo", dir: true }]}
        linhas={pg.itens.map((x, i) => {
          const p = x.codigo ? peca(x.codigo) : null;
          const naLista = jaNaListaSap(x, naIa03(x));
          return {
            chave: `${x.lista}|${x.operacao}|${x.codigo}|${i}`,
            celulas: [x.maquina, existe(x.lista)
              ? <Link key="l" prefetch={false} href={hrefFicha(x)} className="text-alp-azul hover:underline">{x.grupo}/{x.numerador} · {x.operacao}</Link>
              : <span key="l" title="Lista fora do texto da IA03">{x.grupo}/{x.numerador} · {x.operacao}</span>,
              <span key="a" className="text-[12px] text-texto-2" title={x.atividade}>{x.atividade.replace(/\s+/g, " ").slice(0, 90) || "—"}</span>,
              <span key="m" className="inline-flex flex-col"><span>{x.material || "—"}</span>
                {(x.informacoes || x.observacao) && <span className="text-[11.5px] text-texto-3" title={x.observacao}>{(x.informacoes || x.observacao).slice(0, 110)}</span>}</span>,
              x.quantidade != null ? `${String(x.quantidade).replace(".", ",")} ${x.um}` : "—",
              p ? <span key="c" className="inline-flex flex-col"><span className="font-mono text-[12.5px]">{p.codigo}</span><span className="text-[11.5px] text-texto-3">{p.descricao || x.textoSap}</span></span>
                : <Selo key="c" cor="amarelo">sem código</Selo>,
              !x.codigo ? "—" : naLista ? <Selo key="n" cor="verde">sim</Selo> : <Selo key="n" cor="azul">falta incluir</Selo>,
              p ? <SaldoPeca key="s" x={{ estoque: p.estoque, um: p.um, statusEstoque: p.status }} /> : "—"],
          };
        })} />
      <Paginacao params={params} {...pg} mostrados={pg.itens.length} rotulo="linha(s)" baixar={`/api/listas_tarefas?${qs}&planilha=levantamento`} />
    </div>
  );
}
