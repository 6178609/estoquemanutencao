import { NextResponse, type NextRequest } from "next/server";

import { respostaCsv } from "@/app/(app)/ordens/_comum/csv";
import { hojeArquivo, paramsDe } from "@/app/(app)/ordens/_comum/rota";
import { COLUNAS, filtrar, lerFiltro, linha, ordenarReq } from "@/app/(app)/requisicoes/dados";
import { autorizar } from "@/lib/auth/sessao";
import { lerCadastro } from "@/lib/dados/cadastros";
import { bases } from "@/lib/wcm/dados";
import { ARQ_METAS } from "@/lib/wcm/indicadores";
import { pessoasAtivas, soManutencao, solicitantesDe } from "@/lib/wcm/solicitantes";

/** Exportação da aba Requisições: todas as requisições do filtro. GET /api/requisicoes?<mesmos parâmetros da página> */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await autorizar("requisicoes"))) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  const p = paramsDe(req);
  const [b, metas] = await Promise.all([bases(), lerCadastro(ARQ_METAS)]);
  // mesmo recorte da página: só as pessoas da manutenção (padrão salvo) ou as do endereço (pes; pes=todas = fábrica inteira)
  const reqs = soManutencao(b.requisicoes.dados ?? [], pessoasAtivas(p, solicitantesDe(metas))) ?? [];
  const { filtradas } = filtrar(reqs, lerFiltro(p, b.calendario));
  return respostaCsv(`requisicoes_${hojeArquivo()}`, COLUNAS, ordenarReq(filtradas, p).lista.map(linha));
}
