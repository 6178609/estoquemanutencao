import { NextResponse, type NextRequest } from "next/server";

import { camposDeOrdenacao } from "@/app/(app)/programacao/campos";
import * as md from "@/app/(app)/programacao/logica";
import { gerarVbs, nomeArquivoVbs } from "@/app/(app)/programacao/vbs";
import { autorizar } from "@/lib/auth/sessao";
import { lerCadastro } from "@/lib/dados/cadastros";
import { bases } from "@/lib/wcm/dados";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Script VBS da mudança de datas (programação do mês) para rodar direto no PC com o SAP: os dias de `de` a `ate`
 * com campo de ordenação, as mesmas consultas da IW38 do pedido ao robô. `teste=1` = troca na tela e não grava.
 */
export async function GET(req: NextRequest) {
  const u = await autorizar("programacao", true);
  if (!u) return NextResponse.json({ erro: "Só administrador ou editor pode gerar o script." }, { status: 403 });
  const q = req.nextUrl.searchParams;
  const de = md.deIso(q.get("de") ?? ""), ate = md.deIso(q.get("ate") ?? "");
  if (de == null || ate == null || ate < de) return NextResponse.json({ erro: "Período inválido." }, { status: 400 });
  if (ate - de > 120) return NextResponse.json({ erro: "Período longo demais (máximo de 4 meses)." }, { status: 400 });
  const atrasadas = q.get("atrasadas") === "1", teste = q.get("teste") === "1";
  const prog = md.programacaoValida(await lerCadastro(md.ARQ_PROGRAMACAO));
  const cons = md.consultas(prog, de, ate, atrasadas);
  if (!cons.length) return NextResponse.json({ erro: "Nenhum dia com campo de ordenação no período." }, { status: 404 });
  // nomes dos ativos só para os comentários do script (ajudam a conferir antes de rodar)
  let nomes: Record<string, string> = {};
  try {
    const b = await bases();
    const ordens = b.ordens.dados ?? [];
    const campoDe = await camposDeOrdenacao(b.ordens.dados);
    nomes = md.nomesDeAtivos(ordens.map((o) => ({ equipamento: o.equipamento, campo: campoDe.get(o.ordem) ?? "", objeto: o.objeto })),
      (b.equipamentos.dados ?? []).map((e) => [e.equipamento, e.denominacao]));
  } catch {
    nomes = {};
  }
  const geradoEm = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date());
  const corpo = gerarVbs(cons, { teste, de: md.isoDe(de), ate: md.isoDe(ate), por: u.nome || u.login, geradoEm, nomes, atrasadas });
  return new NextResponse(corpo, {
    headers: {
      "Content-Type": "text/vbscript; charset=windows-1252",
      "Content-Disposition": `attachment; filename="${nomeArquivoVbs(md.isoDe(de), md.isoDe(ate), teste)}"`,
      "Cache-Control": "no-store",
    },
  });
}
