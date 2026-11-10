import { NextResponse } from "next/server";

import { registrar } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sessao";
import { gerarXlsxAbas } from "@/lib/exportacao/xlsx";
import { programacaoParadas } from "@/lib/paradas/dados";
import { abasDaProgramacao } from "@/lib/paradas/exportar";
import { isoDe } from "@/lib/paradas/calendario";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** "Baixar Excel" da Programação de paradas: uma aba por visão (quem vê a aba pode baixar). */
export async function GET() {
  const u = await autorizar("programacao_paradas");
  if (!u) return new NextResponse("Sem acesso.", { status: 403 });
  const prog = await programacaoParadas();
  if (!prog) return new NextResponse("Sem a IP19 no repositório de dados.", { status: 404 });
  const abas = abasDaProgramacao(prog.montado, prog.calculo);
  const arquivo = `programacao_paradas_${isoDe(prog.montado.entrada.inicio)}.xlsx`;
  registrar(u.login, "exportacao", arquivo, { linhas: prog.calculo.r.linhas.length });
  return new NextResponse(Buffer.from(gerarXlsxAbas(abas)), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${arquivo}"`, "Cache-Control": "no-store" } });
}
