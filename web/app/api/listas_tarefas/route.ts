import { NextResponse, type NextRequest } from "next/server";

import { csv } from "@/app/(app)/equipamentos/logica";
import { filtrarMateriais, lerFiltroMateriais } from "@/app/(app)/listas_tarefas/logica";
import { cruzamentoMateriais } from "@/app/(app)/mro/cruzamento";
import { baseMateriais } from "@/app/(app)/mro/dados";
import { pecaMro } from "@/app/(app)/mro/logica";
import { ansi, csvInclusao } from "@/app/(app)/mro/ia06";
import { filtrarLevantamento, jaNaListaSap, lerFiltroLevantamento } from "@/app/(app)/listas_tarefas/logica";
import { registrar } from "@/lib/auditoria";
import { podeEditar, soEstoque, veInteira } from "@/lib/auth/acesso";
import { listasTarefas } from "@/lib/dados/listasTarefas";
import { materiaisOperacoes } from "@/lib/dados/materiaisOperacoes";
import { autorizar } from "@/lib/auth/sessao";
import { contexto } from "@/lib/wcm/contexto";
import { ROTULO_MANUAL, ROTULO_SITUACAO } from "@/lib/wcm/cruzamentoMateriais";
import { ROTULO_NIVEL } from "@/lib/wcm/distribuicaoIa06";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Planilhas da aba Listas de tarefas, com os filtros da tela: ?planilha=materiais (Materiais × listas), ?planilha=levantamento
 * (levantamento dos manuais) e ?planilha=ia06lev (carga da IA06 com as linhas do levantamento que faltam na lista).
 */
export async function GET(req: NextRequest) {
  const u = await autorizar("listas_tarefas");
  if (!u) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const params: Record<string, string> = Object.fromEntries(req.nextUrl.searchParams.entries());
  if (params.planilha === "levantamento" || params.planilha === "ia06lev") return levantamento(params, u);
  const c = await contexto(params);
  const cruz = await cruzamentoMateriais(c, await baseMateriais());
  const nome = (t: string) => cruz.nomes[t] ?? "";
  const linhas = filtrarMateriais(cruz.linhas, lerFiltroMateriais(params), nome);
  const corpo = csv(["Material", "Descrição", "Tipo técnico", "Equipamento", "Nome do equipamento", "Máquina", "Nome da máquina", "Grupo da lista",
    "Numerador", "Operação", "Texto da operação", "Situação", "Confiança", "Motivo", "Manual", "Saldo", "UM"],
  linhas.map((x) => {
    const l = x.lista ? cruz.listas[x.lista] : undefined;
    return [x.codigo, x.descricao, x.tipo, x.equipamento, nome(x.equipamento), x.raiz, nome(x.raiz), l?.grupo ?? "", l?.numerador ?? "", x.operacao,
      l?.operacoes.find((o) => o.operacao === x.operacao)?.texto ?? "", ROTULO_SITUACAO[x.situacao], x.situacao === "na-lista" ? "" : ROTULO_NIVEL[x.nivel], x.motivo, ROTULO_MANUAL[x.manual],
      x.estoque ?? "", x.um];
  }));
  registrar(u.login, "exportacao", "listas_materiais.csv", { linhas: linhas.length });
  return new NextResponse(corpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="listas_materiais.csv"', "Cache-Control": "no-store" },
  });
}

async function levantamento(params: Record<string, string>, u: NonNullable<Awaited<ReturnType<typeof autorizar>>>) {
  const carga = params.planilha === "ia06lev";
  if (carga && !(veInteira(u, "mro") && podeEditar(u) && !soEstoque(u))) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const c = await contexto(params);
  const [lev, base, bm] = await Promise.all([materiaisOperacoes(), listasTarefas(), baseMateriais()]);
  const porChave = new Map((base.dados ?? []).map((l) => [l.chave, l]));
  const naIa03 = (x: { lista: string; operacao: string; codigo: string }) => !!x.codigo && !!porChave.get(x.lista)?.operacoes
    .find((o) => o.operacao === x.operacao)?.componentes.some((k) => k.material.replace(/^0+(?=\d)/, "") === x.codigo);
  const linhas = filtrarLevantamento(lev.dados ?? [], lerFiltroLevantamento(params), naIa03);
  if (carga) {
    const itens = linhas.filter((x) => x.codigo && !jaNaListaSap(x, naIa03(x))).map((x) => {
      const p = pecaMro(x.codigo, bm, c.cad.materiais);
      return { grupo: x.grupo, numerador: x.numerador, operacao: x.operacao, material: x.codigo, quantidade: x.quantidade ?? 1, um: p.um || x.um,
        texto: p.descricao || x.textoSap || x.material, equipamento: x.maquina };
    });
    registrar(u.login, "exportacao", "SAP_IA06_INCLUIR_levantamento.csv", { linhas: itens.length });
    return new NextResponse(ansi(csvInclusao(itens)) as BodyInit, {
      headers: { "Content-Type": "text/csv; charset=windows-1252", "Content-Disposition": 'attachment; filename="SAP_IA06_INCLUIR_materiais.csv"', "Cache-Control": "no-store" },
    });
  }
  const corpo = csv(["Máquina", "Grupo da lista", "Numerador", "Operação", "Atividade", "Frequência", "Tipo", "Material (manual)", "Informações técnicas",
    "Qtd.", "UM", "Código SAP", "Texto SAP", "Saldo", "Na lista do SAP", "Situação do código", "Observação"],
  linhas.map((x) => {
    const p = x.codigo ? pecaMro(x.codigo, bm, c.cad.materiais) : null;
    return [x.maquina, x.grupo, x.numerador, x.operacao, x.atividade, x.frequencia, x.tipo, x.material, x.informacoes, x.quantidade ?? "", x.um, x.codigo,
      p?.descricao || x.textoSap, p?.estoque ?? "", x.codigo ? (jaNaListaSap(x, naIa03(x)) ? "Sim" : "Falta incluir") : "", x.situacaoCodigo, x.observacao];
  }));
  registrar(u.login, "exportacao", "listas_levantamento.csv", { linhas: linhas.length });
  return new NextResponse(corpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="listas_levantamento.csv"', "Cache-Control": "no-store" },
  });
}
