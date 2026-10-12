import { NextResponse, type NextRequest } from "next/server";

import { autorizar } from "@/lib/auth/sessao";
import { contexto, dados } from "@/lib/wcm/contexto";
import * as ind from "@/lib/wcm/indicadores";

/**
 * Histórico de quebras de UM equipamento (todas as datas, com os filtros de área/centro/tipo do endereço) para a
 * gaveta da aba Confiabilidade — a lista completa não vai junto com a página.
 * GET /api/confiabilidade?eq=<código>&<filtros>
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await autorizar("confiabilidade"))) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const params: Record<string, string | string[]> = {};
  for (const k of new Set(req.nextUrl.searchParams.keys())) {
    const v = req.nextUrl.searchParams.getAll(k);
    params[k] = v.length > 1 ? v : v[0];
  }
  const eq = String(params.eq ?? "");
  if (!eq) return NextResponse.json({ erro: "Informe o equipamento." }, { status: 400 });
  const c = await contexto(params);
  const d = await dados(c);
  const linhas = ind.quebras(d).filter((x) => x.equipChave === eq).sort((a, b) => b.data! - a.data!)
    .map((x) => [x.nota, x.data, x.tipoNota, x.descricao, x.ordem, x.horasReparo, x.diasDesdeAnterior, x.reincidente ? "Sim" : "", x.notificador]);
  return NextResponse.json({ linhas });
}
