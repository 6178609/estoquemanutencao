import { NextResponse, type NextRequest } from "next/server";

import { csv } from "@/app/(app)/equipamentos/logica";
import { filtrarMateriais, lerFiltroMateriais } from "@/app/(app)/listas_tarefas/logica";
import { cruzamentoMateriais } from "@/app/(app)/mro/cruzamento";
import { baseMateriais } from "@/app/(app)/mro/dados";
import { registrar } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sessao";
import { contexto } from "@/lib/wcm/contexto";
import { ROTULO_MANUAL, ROTULO_SITUACAO } from "@/lib/wcm/cruzamentoMateriais";
import { ROTULO_NIVEL } from "@/lib/wcm/distribuicaoIa06";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Planilha da visão Materiais × listas (?planilha=materiais), com os filtros da tela. */
export async function GET(req: NextRequest) {
  const u = await autorizar("listas_tarefas");
  if (!u) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const params: Record<string, string> = Object.fromEntries(req.nextUrl.searchParams.entries());
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
