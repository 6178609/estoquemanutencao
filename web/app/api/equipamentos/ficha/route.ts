import { NextResponse, type NextRequest } from "next/server";

import { csv } from "@/app/(app)/equipamentos/logica";
import { registrar } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sessao";
import { fichasTecnicas } from "@/lib/dados/fichasTecnicas";
import { atividadesDoMaterial, atividadesPorPeriodicidade, codigoSap, materiaisPorCodigo } from "@/lib/wcm/fichaTecnica";

export const dynamic = "force-dynamic";

/** Planilhas da ficha técnica do modelo: ?modelo=GEL180S&planilha=atividades (proposta de lista) ou cadastro (materiais sem código SAP). */
export async function GET(req: NextRequest) {
  const u = await autorizar("equipamentos");
  if (!u) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const modelo = req.nextUrl.searchParams.get("modelo") ?? "";
  const ficha = (await fichasTecnicas())[modelo];
  if (!ficha) return NextResponse.json({ erro: "Ficha não encontrada." }, { status: 404 });
  const nome = new Map(ficha.materiais.map((m) => [m.id, `${m.descricao}${m.especificacao ? ` ${m.especificacao}` : ""}`]));
  let corpo: string, arquivo: string;
  if (req.nextUrl.searchParams.get("planilha") === "cadastro") {
    const porMat = atividadesDoMaterial(ficha);
    corpo = csv(["Material", "Especificação", "Qtd.", "Origem", "Atividades que usam"], materiaisPorCodigo(ficha).semCodigo
      .map((m) => [m.descricao, m.especificacao ?? "", m.qtd_planilha ?? m.qtd_orcamento ?? "", m.origem, (porMat.get(m.id) ?? []).map((a) => a.descricao).join(" | ")]));
    arquivo = `${modelo}_materiais_a_cadastrar.csv`;
  } else {
    corpo = csv(["Periodicidade", "Dias", "Sistema", "Atividade", "Referência", "Materiais", "Códigos SAP"], atividadesPorPeriodicidade(ficha).flatMap((g) => g.atividades.map((a) => [
      g.periodicidade, g.dias ?? "", a.sistema, a.descricao, a.referencia, a.material_ids.map((id) => nome.get(id) ?? id).join(" | "),
      a.material_ids.map((id) => ficha.materiais.find((m) => m.id === id)).filter((m) => m && codigoSap(m)).map((m) => codigoSap(m!)).join(" | ")])));
    arquivo = `${modelo}_atividades_preventivas.csv`;
  }
  registrar(u.login, "exportacao", arquivo);
  return new NextResponse(corpo, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${arquivo}"`, "Cache-Control": "no-store" } });
}
