import Link from "next/link";

import { Selo } from "@/components/ui";
import { paginar } from "@/lib/paginacao";
import { ROTULO_MANUAL, ROTULO_SITUACAO, type LinhaCruzamento, type OrigemManual, type SituacaoLista } from "@/lib/wcm/cruzamentoMateriais";

import { GradeNumeros, inteiroBr, Numero, Paginacao, TabelaT } from "../equipamentos/_ui/Blocos";
import { FiltrosUrl } from "../equipamentos/_ui/FiltrosUrl";
import { hrefCom } from "../equipamentos/_ui/url";
import type { Cruzamento } from "../mro/cruzamento";
import { contar, filtrarMateriais, hrefFicha, lerFiltroMateriais, um, type Params } from "./logica";

export const COR_SITUACAO: Record<SituacaoLista, "verde" | "azul" | "amarelo" | "laranja" | "cinza"> = {
  "na-lista": "verde", sugerida: "azul", "sem-operacao": "amarelo", escolher: "laranja", "sem-lista": "cinza",
};
export const COR_MANUAL: Record<OrigemManual, "verde" | "azul" | "cinza"> = { manual: "verde", modelo: "azul", sem: "cinza" };
const COR_EST = { ok: "var(--st-bom)", baixo: "var(--st-serio)", zerado: "var(--st-critico)", ausente: "var(--st-critico)" } as const;

export function SaldoPeca({ x }: { x: Pick<LinhaCruzamento, "estoque" | "um" | "statusEstoque"> }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="size-2 rounded-full" style={{ background: COR_EST[x.statusEstoque] }} aria-hidden />
      {x.estoque == null ? "—" : `${inteiroBr(x.estoque)}${x.um ? ` ${x.um}` : ""}`}
    </span>
  );
}

/**
 * Materiais × listas: cada material vinculado a equipamento, com o tipo técnico, a lista de tarefas e a operação (já no
 * SAP ou sugerida pela distribuição), a origem do vínculo (manual ou modelo) e o saldo no Estoque.
 */
export function Materiais({ cruz, params }: { cruz: Cruzamento; params: Params }) {
  const nome = (t: string) => cruz.nomes[t] ?? "";
  const f = lerFiltroMateriais(params);
  const vis = filtrarMateriais(cruz.linhas, f, nome);
  const pg = paginar(vis, Number(um(params, "pag")) || 1);
  const n = (fn: (x: LinhaCruzamento) => boolean) => vis.filter(fn).length;
  const lt = (k: string | null) => (k ? cruz.listas[k] : undefined);
  const baixar = `/api/listas_tarefas?${hrefCom(params, { planilha: "materiais", pag: null }).slice(1)}`;
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] leading-relaxed text-texto-3">
        Padrão do site: todo material vinculado a um equipamento cruzado com as listas de tarefas (a lista do subconjunto onde está e a operação
        que combina com ele), com o manual e com o tipo técnico. “Já na lista” vem dos componentes do texto da IA03; “Sugerida” falta incluir pela
        IA06 (na ficha da lista ou na Gestão de MRO).{!cruz.comTextoIa03 && " Envie o texto das listas (IA03) em Fontes de dados para o site conhecer as operações."}
      </p>
      <FiltrosUrl campos={[
        { tipo: "busca", param: "mq", placeholder: "Material, descrição, equipamento, lista…" },
        { tipo: "multi", param: "mtipo", rotulo: "Tipo técnico", opcoes: contar(cruz.linhas.map((x) => [x.tipo])) },
        { tipo: "multi", param: "msit", rotulo: "Situação na lista", opcoes: contar(cruz.linhas.map((x) => [x.situacao])).map((o) => ({ ...o, rotulo: ROTULO_SITUACAO[o.valor as SituacaoLista] })) },
        { tipo: "multi", param: "mman", rotulo: "Manual", opcoes: contar(cruz.linhas.map((x) => [x.manual])).map((o) => ({ ...o, rotulo: ROTULO_MANUAL[o.valor as OrigemManual] })) },
        { tipo: "alternar", param: "mfalta", rotulo: "Só as que falta incluir na lista" },
        { tipo: "alternar", param: "mest", rotulo: "Só sem estoque" },
      ]} />
      <GradeNumeros colunas={6}>
        <Numero rotulo="Materiais × equipamentos" valor={inteiroBr(vis.length)} detalhe={`${inteiroBr(new Set(vis.map((x) => x.codigo)).size)} materiais`} />
        <Numero rotulo="Já na lista (SAP)" valor={inteiroBr(n((x) => x.situacao === "na-lista"))} tom="bom" />
        <Numero rotulo="Falta incluir (IA06)" valor={inteiroBr(n((x) => x.situacao === "sugerida"))} detalhe="lista e operação achadas" />
        <Numero rotulo="Sem operação" valor={inteiroBr(n((x) => x.situacao === "escolher" || x.situacao === "sem-operacao"))}
          detalhe={`${inteiroBr(n((x) => x.situacao === "sem-operacao"))} por falta do texto da IA03`} />
        <Numero rotulo="Sem lista de tarefas" valor={inteiroBr(n((x) => x.situacao === "sem-lista"))} tom={n((x) => x.situacao === "sem-lista") ? "atencao" : undefined} />
        <Numero rotulo="Conferidas no manual" valor={inteiroBr(n((x) => x.manual === "manual"))} detalhe={`${inteiroBr(n((x) => x.statusEstoque !== "ok"))} sem estoque`} />
      </GradeNumeros>
      <TabelaT vazio="Nenhum material com estes filtros." colunas={[{ rotulo: "Material" }, { rotulo: "Descrição", larga: true }, { rotulo: "Tipo técnico" },
        { rotulo: "Equipamento" }, { rotulo: "Lista · operação" }, { rotulo: "Situação" }, { rotulo: "Manual" }, { rotulo: "Saldo", dir: true }]}
        linhas={pg.itens.map((x) => {
          const l = lt(x.lista), op = l?.operacoes.find((o) => o.operacao === x.operacao);
          return {
            chave: `${x.codigo}|${x.equipamento}`,
            celulas: [<span key="c" className="font-mono text-[12.5px]">{x.codigo}</span>, x.descricao || "—", x.tipo,
              <Link key="e" prefetch={false} href={`/equipamentos/biblioteca?${new URLSearchParams({ eq: x.equipamento })}`} className="text-alp-azul hover:underline" title={x.equipamento}>
                {nome(x.equipamento) || x.equipamento}</Link>,
              l ? <span key="l" className="inline-flex flex-col leading-tight"><Link prefetch={false} href={hrefFicha(l)} className="text-alp-azul hover:underline">{l.grupo}/{l.numerador}</Link>
                <span className="text-[11.5px] text-texto-3" title={op?.texto}>{x.operacao ? `op ${x.operacao}${op ? ` · ${op.texto.slice(0, 40)}` : ""}` : "sem operação"}</span></span> : "—",
              <span key="s" title={x.motivo}><Selo cor={COR_SITUACAO[x.situacao]}>{ROTULO_SITUACAO[x.situacao]}</Selo></span>,
              <Selo key="m" cor={COR_MANUAL[x.manual]}>{ROTULO_MANUAL[x.manual]}</Selo>, <SaldoPeca key="sd" x={x} />],
          };
        })} />
      <Paginacao params={params} {...pg} mostrados={pg.itens.length} rotulo="vínculo(s)" baixar={baixar} />
    </div>
  );
}
