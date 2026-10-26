import { NextResponse, type NextRequest } from "next/server";

import { infoCad, inventarioAtivos, mapaEstoque, pecasDe } from "@/app/(app)/equipamentos/dados";
import { registrar } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sessao";
import { catalogo } from "@/lib/dados/bases";
import { pecasSemCadastroDe } from "@/lib/dados/pecasSemCadastro";
import { gerarPdfTabela } from "@/lib/exportacao/pdf";
import { gerarXlsx } from "@/lib/exportacao/xlsx";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { contexto } from "@/lib/wcm/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITUACAO: Record<string, string> = { ok: "Em estoque", baixo: "Abaixo do mínimo", zerado: "Zerado", ausente: "Fora do almoxarifado" };

/** Peças vinculadas a um equipamento (?eq=…&formato=pdf|xlsx), com a descrição do MB52 ou, sem ela, a do Sysmat. */
export async function GET(req: NextRequest) {
  const u = await autorizar("equipamentos");
  if (!u) return new NextResponse("Sem acesso.", { status: 403 });
  const p = req.nextUrl.searchParams;
  const eq = (p.get("eq") ?? "").trim().slice(0, 40);
  const formato = p.get("formato") === "xlsx" ? "xlsx" : "pdf";
  if (!eq) return new NextResponse("Informe o equipamento.", { status: 400 });
  const c = await contexto({});
  const [inv, est, campoEq, cat] = await Promise.all([inventarioAtivos(c), mapaEstoque(), campoDoEquipamento(c), catalogo()]);
  const r = inv.find((x) => x.codigo === eq);
  if (!r) return new NextResponse("Equipamento não encontrado.", { status: 404 });
  const porCodigo = new Map((cat.dados ?? []).map((x) => [x.material, x]));
  const pecas = pecasDe(c, r.codigo, est).map((x) => {
    const s = porCodigo.get(x.codigo);
    return { codigo: x.codigo, descricao: x.descricao || s?.descricaoCurta || "", fabricante: s?.fabricanteRef ?? "", um: s?.um ?? "",
      estoque: x.estoque, minimo: x.minimo, situacao: SITUACAO[x.status] ?? x.texto, sysmat: s?.sysmat ?? "" };
  }).sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
  // as peças sem código no Sysmat vão no fim, marcadas (servem para pedir o cadastro)
  pecas.push(...pecasSemCadastroDe(infoCad(c, r.codigo)).map((x) => ({ codigo: "—", descricao: x.descricao,
    fabricante: [x.referencia, x.fabricante].filter(Boolean).join(" · "), um: "", estoque: null as number | null, minimo: null as number | null,
    situacao: `Sem cadastro no Sysmat${x.quantidade ? ` · qtd ${x.quantidade}` : ""}${x.origem ? ` · ${x.origem}` : ""}`, sysmat: "" })));
  const campo = campoEq(r.codigo);
  const nomeEq = r.equipamento || String(infoCad(c, r.codigo).nome ?? "");
  const base = `pecas_${r.codigo}`.replace(/[^\w.-]/g, "_");
  registrar(u.login, "exportacao", `${base}.${formato}`, { pecas: pecas.length });

  if (formato === "xlsx") {
    const bytes = gerarXlsx(`Peças ${r.codigo}`, [
      { titulo: "Material", largura: 12 }, { titulo: "Descrição", largura: 48 }, { titulo: "Fabricante / referência", largura: 34 },
      { titulo: "UM", largura: 6 }, { titulo: "Estoque", largura: 10 }, { titulo: "Mínimo", largura: 10 }, { titulo: "Situação", largura: 22 },
      { titulo: "Código Sysmat", largura: 14 }, { titulo: "Equipamento", largura: 12 }, { titulo: "Nome do equipamento", largura: 40 },
    ], pecas.map((x) => [x.codigo, x.descricao, x.fabricante, x.um, x.estoque, x.minimo, x.situacao, x.sysmat, r.codigo, nomeEq]));
    return new NextResponse(Buffer.from(bytes), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`, "Cache-Control": "no-store" } });
  }
  const n = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR"));
  const bytes = gerarPdfTabela({
    titulo: `Peças vinculadas · ${campo ? `${campo} · ` : ""}${r.codigo} · ${nomeEq}`,
    subtitulo: [r.localInstalacao, r.area, `${pecas.length} peça(s)`, "estoque do almoxarifado (MB52)"].filter(Boolean).join(" · "),
    rodape: "Central de Manutenção · Equipamentos",
    colunas: [{ titulo: "Material", largura: 62 }, { titulo: "Descrição", largura: 250 }, { titulo: "Fabricante / referência", largura: 170 },
      { titulo: "UM", largura: 30 }, { titulo: "Estoque", largura: 55, direita: true }, { titulo: "Mínimo", largura: 50, direita: true },
      { titulo: "Situação", largura: 110 }],
    linhas: pecas.map((x) => [x.codigo, x.descricao || "—", x.fabricante || "—", x.um, n(x.estoque), n(x.minimo), x.situacao]),
  });
  return new NextResponse(Buffer.from(bytes), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"`, "Cache-Control": "no-store" } });
}
