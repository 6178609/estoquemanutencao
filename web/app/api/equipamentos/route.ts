import { NextResponse, type NextRequest } from "next/server";

import { infoCad, inventarioAtivos, mapaEstoque, pecasDe } from "@/app/(app)/equipamentos/dados";
import { agregarAnalise, csvAnalise, csvInventario, filtrarAnalise, filtrarInventario, lerFiltroAnalise, lerFiltroInventario } from "@/app/(app)/equipamentos/logica";
import { registrar } from "@/lib/auditoria";
import { veInteira } from "@/lib/auth/acesso";
import { autorizar } from "@/lib/auth/sessao";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { contexto, dados } from "@/lib/wcm/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Planilhas da aba Equipamentos: ?planilha=inventario (Gestão de ativos) ou ?planilha=analise (análise pelas ordens). */
export async function GET(req: NextRequest) {
  const u = await autorizar("equipamentos");
  if (!u) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const params: Record<string, string> = Object.fromEntries(req.nextUrl.searchParams.entries());
  const c = await contexto(params);
  let corpo: string, nome: string;
  if (params.planilha === "analise") {
    if (!veInteira(u, "equipamentos")) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
    if (!c.b.ordens.dados) return NextResponse.json({ erro: "Sem a base IW38." }, { status: 404 });
    const [d, est, campoEq] = await Promise.all([dados(c), mapaEstoque(), campoDoEquipamento(c)]);
    const tab = agregarAnalise(d.ordens, c.f.ini, c.f.fim, { cadEq: c.cad.equipamentos, equip: c.b.equipamentos.dados, notas: c.b.notas.dados,
      pecas: (k) => (Object.keys(infoCad(c, k)).length ? pecasDe(c, k, est) : []) });
    corpo = csvAnalise(filtrarAnalise(tab, lerFiltroAnalise(params), campoEq), campoEq);
    nome = "equipamentos.csv";
  } else {
    const campoEq = await campoDoEquipamento(c);
    corpo = csvInventario(filtrarInventario(await inventarioAtivos(c), lerFiltroInventario(params), campoEq), campoEq);
    nome = "gestao_de_ativos.csv";
  }
  registrar(u.login, "exportacao", nome);
  return new NextResponse(corpo, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "no-store" },
  });
}
