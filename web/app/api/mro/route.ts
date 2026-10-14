import { NextResponse, type NextRequest } from "next/server";

import { infoCad, inventarioAtivos, materiaisDe } from "@/app/(app)/equipamentos/dados";
import { baseMateriais, camposDosAtivos } from "@/app/(app)/mro/dados";
import * as M from "@/app/(app)/mro/logica";
import { autorizar } from "@/lib/auth/sessao";
import { contexto } from "@/lib/wcm/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Planilhas da Gestão de MRO: ?planilha=ativos (ativo × peça) ou ?planilha=materiais (onde é usado), com os filtros da tela. */
export async function GET(req: NextRequest) {
  if (!(await autorizar("mro"))) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const params: Record<string, string> = Object.fromEntries(req.nextUrl.searchParams.entries());
  const c = await contexto(params);
  const [inv, bm, campos] = await Promise.all([inventarioAtivos(c), baseMateriais(), camposDosAtivos(c)]);
  const t = M.linhasPorAtivo(inv, (k) => materiaisDe(infoCad(c, k)), (m) => M.pecaMro(m, bm, c.cad.materiais),
    (k) => campos.get(k) ?? "");
  const materiais = params.planilha === "materiais";
  const corpo = materiais ? M.csvMateriais(M.filtrarMateriais(M.linhasPorMaterial(t), M.lerFiltroMateriais(params)))
    : M.csvAtivos(M.filtrarAtivos(t, M.lerFiltroAtivos(params)));
  return new NextResponse(corpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${materiais ? "mro_materiais" : "mro_ativos"}.csv"`,
      "Cache-Control": "no-store" },
  });
}
