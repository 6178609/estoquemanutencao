import { NextResponse, type NextRequest } from "next/server";

import { infoCad, inventarioAtivos, materiaisDe } from "@/app/(app)/equipamentos/dados";
import { baseMateriais, camposDosAtivos, listasDosAtivos } from "@/app/(app)/mro/dados";
import { ansi, csvInclusao } from "@/app/(app)/mro/ia06";
import * as M from "@/app/(app)/mro/logica";
import { podeEditar, soEstoque, veInteira } from "@/lib/auth/acesso";
import { autorizar } from "@/lib/auth/sessao";
import { contexto } from "@/lib/wcm/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Planilhas da Gestão de MRO, com os filtros da tela: ?planilha=ativos (ativo × peça), ?planilha=materiais (onde é
 * usado) ou ?planilha=ia06 (carga de inclusão nas listas de tarefas de todos os ativos filtrados: operação 0010,
 * quantidade 1 e EXECUTAR em branco, para revisar e marcar com X antes de rodar o script).
 */
export async function GET(req: NextRequest) {
  const u = await autorizar("mro");
  if (!u) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const params: Record<string, string> = Object.fromEntries(req.nextUrl.searchParams.entries());
  const c = await contexto(params);
  const [inv, bm, campos] = await Promise.all([inventarioAtivos(c), baseMateriais(), camposDosAtivos(c)]);
  const t = M.linhasPorAtivo(inv, (k) => materiaisDe(infoCad(c, k)), (m) => M.pecaMro(m, bm, c.cad.materiais),
    (k) => campos.get(k) ?? "");
  if (params.planilha === "ia06") {
    if (!(veInteira(u, "mro") && podeEditar(u) && !soEstoque(u))) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
    const listas = await listasDosAtivos(c);
    const itens = M.filtrarAtivos(t, M.lerFiltroAtivos(params)).flatMap((a) => (listas.get(a.codigo) ?? []).flatMap((l) => a.pecas.map((p) => ({
      grupo: l.grupo, numerador: l.numerador, operacao: "0010", material: p.codigo, quantidade: 1, um: p.um, texto: p.descricao,
      equipamento: M.rotuloAtivo(a), usoLista: l.equipamentos,
    }))));
    return new NextResponse(ansi(csvInclusao(itens, false)) as BodyInit, {
      headers: { "Content-Type": "text/csv; charset=windows-1252", "Content-Disposition": 'attachment; filename="SAP_IA06_INCLUIR_materiais.csv"',
        "Cache-Control": "no-store" },
    });
  }
  const materiais = params.planilha === "materiais";
  const corpo = materiais ? M.csvMateriais(M.filtrarMateriais(M.linhasPorMaterial(t), M.lerFiltroMateriais(params)))
    : M.csvAtivos(M.filtrarAtivos(t, M.lerFiltroAtivos(params)));
  return new NextResponse(corpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${materiais ? "mro_materiais" : "mro_ativos"}.csv"`,
      "Cache-Control": "no-store" },
  });
}
