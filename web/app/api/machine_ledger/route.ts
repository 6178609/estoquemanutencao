import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { registrar } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sessao";
import { FonteErro } from "@/lib/dados/fonte";
import { gerarXlsxAbas } from "@/lib/exportacao/xlsx";
import * as D from "@/lib/machineLedger/dados";
import * as R from "@/lib/machineLedger/regras";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ABA = "machine_ledger";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const planilha = (nome: string, bytes: Uint8Array) => new NextResponse(Buffer.from(bytes), { headers: {
  "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "no-store" } });
const col = (titulos: string[]) => titulos.map((titulo) => ({ titulo, largura: /Descri|Detalhe|Componente/.test(titulo) ? 44 : 16 }));

/** Planilhas: ?planilha=achados (pente fino) | pecas&id=<ledger> (peças do ledger com saldo e situação do código). */
export async function GET(req: NextRequest) {
  const u = await autorizar(ABA);
  if (!u) return new NextResponse("Sem acesso.", { status: 403 });
  const p = req.nextUrl.searchParams;
  if (p.get("planilha") === "achados") {
    const { achados } = await D.penteFinoAtual();
    registrar(u.login, "exportacao", "machine_ledger_achados.xlsx");
    return planilha("machine_ledger_achados.xlsx", gerarXlsxAbas([{ nome: "Achados", colunas: col(["Tipo", "Abrangência", "Ativo(s)", "Ledger", "Código", "Origem do código", "Descrição", "Detalhe",
      "Para", "Sinal forte", "Uso geral", "Fora da MB52", "Aviso secundário"]),
      linhas: achados.map((a) => [R.TIPOS_ACHADO[a.tipo], R.DO_LEDGER.has(a.tipo) ? `Ledger (${a.ativos.length} equip.)` : "Ativo", a.ativos.join(", "), a.ledgerNome,
        a.codigo, a.origemCodigo ?? "", a.descricao, a.detalhe, a.para ?? "", a.forte ? "Sim" : "", a.usoGeral ? "Sim" : "", a.foraMb52 ? "Sim" : "", a.secundario ? "Sim" : ""]) }]));
  }
  if (p.get("planilha") === "pecas") {
    const id = p.get("id") ?? "";
    const idx = (await D.lerIndice()).find((i) => i.id === id);
    if (!idx) return new NextResponse("Ledger não encontrado.", { status: 404 });
    const [c, b] = await Promise.all([D.lerConteudo(id), D.baseCodigos()]);
    registrar(u.login, "exportacao", `machine_ledger_pecas_${id}.xlsx`);
    return planilha(`pecas_${id}.xlsx`, gerarXlsxAbas([{ nome: "Peças", colunas: col(["Conjunto", "Código no ledger", "Código SAP", "Origem do código", "Situação do código", "Descrição",
      "Descrição no Sysmat", "Saldo MB52", "Estratégico", "Deve ter reserva", "Est. seg. Almox", "Est. seg. UBM", "Valor unitário"]),
      linhas: c.pecas.map((x) => {
        const r = R.resolverCodigo(x.codigo, x.descricao, b);
        return [x.conjunto, x.codigo, r.codigo, R.origemDaPeca(r), r.situacao, x.descricao, b.cat?.get(r.codigo)?.descricao ?? "", r.codigo ? b.saldo?.get(r.codigo)?.estoque ?? 0 : null,
          x.estrategico ? "Sim" : "", x.reserva ? "Sim" : "", x.estSegAlmox, x.estSegUbm, x.valorUnit];
      }) }]));
  }
  if (p.get("planilha") === "operacoes") {
    const idx = (await D.lerIndice()).find((i) => i.id === p.get("id"));
    if (!idx) return new NextResponse("Ledger não encontrado.", { status: 404 });
    const { linhas } = await D.operacoesDoLedger(idx);
    registrar(u.login, "exportacao", `machine_ledger_operacoes_${idx.id}.xlsx`);
    return planilha(`operacoes_${idx.id}.xlsx`, gerarXlsxAbas([{ nome: "Operações", colunas: col(["Conjunto", "Subconjunto", "Componente", "Código SAP", "Origem do código", "Código válido", "Código pela referência",
      "Qtd. RCM", "UM", "Situação", "Grupo", "Contador", "Operação", "Texto da operação", "Confiança", "Motivo", "Já na operação"]),
      linhas: linhas.map((l) => {
        const o = l.confirmada ?? l.sugestao;
        return [l.conjunto, l.subconjunto, l.componente, l.codigo, l.origemCodigo, l.codigoOk ? "Sim" : "",
          l.codigoConfirmado ? `confirmado por ${l.codigoConfirmado.por}` : l.sugerido ? (l.codigo ? `sugerido (${l.referencia})` : `ambíguo: ${l.candidatos.map((x) => x.codigo).join(", ")}`) : "", l.qtdRcm, l.um, l.confirmada ? "Confirmada" : l.sugestao ? "Sugestão" : "Sem operação",
          o?.grupo ?? "", o?.numerador ?? "", o?.operacao ?? "", l.sugestao && !l.confirmada ? l.sugestao.texto : "", l.confirmada ? "" : l.sugestao?.confianca ?? "",
          l.confirmada ? `por ${l.confirmada.por}` : l.sugestao?.motivo ?? "", l.jaNaOperacao ? "Sim" : ""];
      }) }]));
  }
  return new NextResponse("Pedido inválido.", { status: 400 });
}

/** Gravação (JSON): acao = vinculo | conferido | correspondencia | envio. Só editores fora de Terceiro/Manutentor. */
export async function POST(req: NextRequest) {
  const u = await autorizar(ABA);
  if (!u) return NextResponse.json({ erro: "Sem acesso." }, { status: 403 });
  if (!D.podeGravarMl(u)) return NextResponse.json({ erro: "Só editores do PCM (fora de Terceiro e Manutentor) alteram o Machine Ledger e os vínculos." }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > 8_000_000) return NextResponse.json({ erro: "Planilha grande demais." }, { status: 413 });
  const j = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!j) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  try {
    let resposta: Record<string, unknown> = { ok: true };
    if (j.acao === "vinculo") {
      await D.alterarVinculo(u, String(j.ativo ?? ""), String(j.codigo ?? ""), j.tipo === "desvincular" ? "desvincular" : "vincular");
      for (const r of ["/mro", "/equipamentos", "/estoque"]) revalidatePath(r);
    } else if (j.acao === "conferido") await D.marcarConferido(u, String(j.chave ?? ""), j.sim !== false);
    else if (j.acao === "correspondencia") resposta = { ok: true, equipamentos: await D.gravarCorrespondencia(u, String(j.id ?? ""), j.equipamentos) };
    else if (j.acao === "operacao") await D.gravarOperacao(u, String(j.chave ?? ""), j.alvo && typeof j.alvo === "object" ? j.alvo as never : null);
    else if (j.acao === "codigo") await D.gravarCodigo(u, String(j.chave ?? ""), j.codigo ? String(j.codigo) : null);
    else if (j.acao === "listas") resposta = { ok: true, listas: await D.gravarListas(u, j.listas) };
    else if (j.acao === "envio") resposta = { ok: true, id: await D.substituirLedger(u, j.dados as D.EnvioLedger) };
    else return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
    revalidatePath("/machine_ledger");
    return NextResponse.json(resposta);
  } catch (e) {
    const msg = e instanceof FonteErro ? e.message : "Não foi possível gravar agora; tente de novo.";
    if (!(e instanceof FonteErro)) console.warn(`[machine_ledger] ${(e as Error).message}`);
    return NextResponse.json({ erro: msg }, { status: 400 });
  }
}
