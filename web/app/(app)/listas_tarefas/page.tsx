import { ListChecks, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Barras, Grafico } from "@/components/graficos";
import { Aviso, PaginaWcm } from "@/components/PaginaWcm";
import { Cabecalho, Selo } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { dataHora } from "@/lib/formato";
import { paginar } from "@/lib/paginacao";
import { barra, contexto } from "@/lib/wcm/contexto";

import { AbasParam, GradeNumeros, inteiroBr, Numero, Paginacao, TabelaT } from "../equipamentos/_ui/Blocos";
import { FiltrosUrl } from "../equipamentos/_ui/FiltrosUrl";
import { dadosListas, documentosDaLista } from "./dados";
import { contar, filtrar, hrefFicha, lerFiltro, montarLinhas, resumir, um, V_GERAL, V_QUALIDADE, type Params } from "./logica";
import { Qualidade } from "./Qualidade";

export const metadata: Metadata = { title: "Listas de tarefas" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const horas = (h: number) => `${inteiroBr(Math.round(h))} h`;
const ABAS = [
  { id: V_GERAL, rotulo: "Visão geral", icone: <ListChecks className="size-4" strokeWidth={1.75} /> },
  { id: V_QUALIDADE, rotulo: "Qualidade das listas", icone: <ShieldAlert className="size-4" strokeWidth={1.75} /> },
];

/**
 * Listas de tarefas do SAP (texto da IA03/IA06 enviado em Fontes de dados): o que cada lista manda fazer, com que
 * frequência e quanto trabalho dá por ano, e os vínculos — equipamentos (IP19 e ordens do IW38), manuais da biblioteca
 * do ativo, peças do MRO com o saldo do Estoque e a inclusão dos componentes no SAP (IA06), na ficha de cada lista.
 */
export default async function ListasTarefas(props: { searchParams: Promise<Params> }) {
  await exigir("listas_tarefas");
  const params = await props.searchParams;
  const c = await contexto(params);
  const d = await dadosListas(c);
  const cab = <Cabecalho titulo="Listas de tarefas," destaque="o que cada preventiva manda fazer." sobre="Planejamento · IA03"
    subtitulo="As operações de cada lista de tarefas do SAP, com o trabalho por ano, os equipamentos que a usam (IP19 e IW38), os manuais da biblioteca do ativo e as peças do MRO com o saldo no Estoque." />;
  if (!d.listas.length) {
    return (
      <PaginaWcm barra={barra(c)} periodo={false} dimensoes={false}>
        {cab}
        <Aviso>Nenhuma lista de tarefas carregada{d.erro ? ` (${d.erro})` : ""}. Envie o texto das listas (IA03/IA06, salvo como .txt) em{" "}
          <Link prefetch={false} href="/dados" className="font-medium underline">Fontes de dados</Link>.</Aviso>
      </PaginaWcm>
    );
  }
  const linhas = montarLinhas(d.listas, (k) => d.equipamentos.get(k) ?? [], (eqs) => documentosDaLista(d, eqs).length, d.nome);
  const visao = um(params, "visao") === V_QUALIDADE ? V_QUALIDADE : V_GERAL;
  const f = lerFiltro(params);
  const vis = filtrar(linhas, f);
  const r = resumir(vis);
  const pg = paginar(vis, Number(um(params, "pag")) || 1);

  return (
    <PaginaWcm barra={barra(c)} periodo={false} dimensoes={false}>
      {cab}
      <p className="text-[12.5px] text-texto-3">Base: {d.listas.length} listas · enviada em Fontes de dados ({dataHora(d.atualizado)}).
        Os equipamentos vêm dos planos da IP19 e das ordens do IW38 que usam cada lista.</p>
      <div id="abas" className="scroll-mt-24 space-y-5">
        <AbasParam params={params} param="visao" abas={ABAS} atual={visao} ancora="abas" />
        <FiltrosUrl zerar={["pag"]} campos={[
          { tipo: "busca", param: "iq", placeholder: "Grupo, título, texto da operação, equipamento, plano…" },
          { tipo: "multi", param: "ictr", rotulo: "Centro de trabalho", opcoes: contar(linhas.map((x) => x.lt.centrosTrabalho)).map(({ valor, n }) => ({ valor, n })) },
          { tipo: "multi", param: "ifreq", rotulo: "Frequência", opcoes: contar(linhas.map((x) => [x.frequencia])).map(({ valor, n }) => ({ valor, n })) },
          { tipo: "alternar", param: "igeral", rotulo: "Só listas gerais (mais de um equipamento)" },
          { tipo: "alternar", param: "isem", rotulo: "Só sem equipamento" },
          { tipo: "alternar", param: "itroca", rotulo: "Só com operação de troca" },
        ]} />
        {visao === V_QUALIDADE ? <Qualidade linhas={vis} /> : (
          <>
            <GradeNumeros colunas={6}>
              <Numero rotulo="Listas" valor={inteiroBr(r.listas)} detalhe={`${inteiroBr(r.operacoes)} operações`} />
              <Numero rotulo="Trabalho por ano" valor={horas(r.horasAno)} dica="Soma de trabalho × execuções por ano (pelo ciclo do pacote de cada operação)." />
              <Numero rotulo="Com equipamento" valor={inteiroBr(r.listas - r.semEquipamento)} detalhe={`${inteiroBr(r.semEquipamento)} sem equipamento`}
                tom={r.semEquipamento ? "atencao" : "bom"} dica="Listas usadas por algum plano da IP19 ou por ordens do IW38." />
              <Numero rotulo="Listas gerais" valor={inteiroBr(r.gerais)} detalhe="usadas por mais de um equipamento" />
              <Numero rotulo="Com manual" valor={inteiroBr(r.comManual)} detalhe="equipamento com manual na biblioteca" />
              <Numero rotulo="Operações de troca" valor={inteiroBr(r.trocas)} detalhe="substituir, trocar, repor, lubrificar" />
            </GradeNumeros>
            <Grafico titulo="Trabalho por ano em cada centro de trabalho" subtitulo="Horas das operações × execuções por ano (listas filtradas)"
              tabela={{ colunas: ["Centro de trabalho", "Horas por ano", "Operações"], linhas: r.horasPorCentro.map((x) => [x.centro, x.horas, x.operacoes]) }}>
              <Barras formato="h" larguraRotulo={150} itens={r.horasPorCentro.slice(0, 12).map((x) => ({ rotulo: x.centro, valor: x.horas, detalhe: `${x.operacoes} operações` }))} />
            </Grafico>
            <TabelaT vazio="Nenhuma lista com estes filtros." colunas={[{ rotulo: "Lista" }, { rotulo: "Título", larga: true }, { rotulo: "Operações", dir: true },
              { rotulo: "Centro de trabalho" }, { rotulo: "Frequência" }, { rotulo: "Horas/ano", dir: true }, { rotulo: "Equipamentos", dir: true },
              { rotulo: "Manuais", dir: true }, { rotulo: "Assuntos" }]}
              linhas={pg.itens.map((x) => ({
                chave: x.lt.chave, href: hrefFicha(x.lt),
                celulas: [`${x.lt.grupo}/${x.lt.numerador}`, x.lt.titulo || "—", x.lt.operacoes.length, x.lt.centrosTrabalho.join(", ") || "—", x.frequencia,
                  Math.round(x.lt.horasAno * 10) / 10, x.equipamentos.length > 1 ? <Selo key="g" cor="laranja">{x.equipamentos.length} (geral)</Selo> : x.equipamentos.length || <span key="s" className="text-texto-3">0</span>,
                  x.manuais || "—", <span key="t" className="text-[12px] text-texto-3">{x.temas.slice(0, 3).join(", ") || "—"}</span>],
              }))} />
            <Paginacao params={params} {...pg} mostrados={pg.itens.length} rotulo="lista(s)" />
          </>
        )}
      </div>
    </PaginaWcm>
  );
}
