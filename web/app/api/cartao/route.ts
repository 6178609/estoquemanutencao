import { NextResponse, type NextRequest } from "next/server";

import { registrar } from "@/lib/auditoria";
import { ehAdmin } from "@/lib/auth/acesso";
import { autorizar } from "@/lib/auth/sessao";
import * as cartao from "@/lib/cartao/dados";
import { blocosVisiveis, csvMes } from "@/lib/cartao/regras";
import { LIMITE_DOCUMENTO } from "@/lib/dados/documentos";
import { FonteErro } from "@/lib/dados/fonte";
import { podeEnviar } from "@/lib/dados/fotos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cupom de um gasto (?b=&g=) ou planilha do mês (?planilha=AAAA-MM), só do que a pessoa vê. */
export async function GET(req: NextRequest) {
  const u = await autorizar("cartao");
  if (!u) return new NextResponse("Sem acesso.", { status: 403 });
  const p = req.nextUrl.searchParams;
  const papel = cartao.papelDe(u);
  const mes = p.get("planilha");
  if (mes) {
    if (!/^\d{4}-\d{2}$/.test(mes)) return new NextResponse("Mês inválido.", { status: 400 });
    const { blocos } = await cartao.lerCartao();
    const vis = blocosVisiveis(papel, blocos);
    registrar(u.login, "exportacao", `cartao_${mes}.csv`, { blocos: vis.length });
    return new NextResponse(csvMes(vis, mes), { headers: { "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cartao_${mes}.csv"`, "Cache-Control": "no-store" } });
  }
  const r = await cartao.lerCupom(papel, p.get("b") ?? "", p.get("g") ?? "");
  if (!r) return new NextResponse("Cupom não encontrado.", { status: 404 });
  return new NextResponse(Buffer.from(r.bytes), { headers: {
    "Content-Type": r.tipo,
    "Content-Disposition": `inline; filename="${r.nome.replace(/[^\w.\- ]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(r.nome)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    ...(r.tipo === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; sandbox" }),
  } });
}

/** Ações da aba (formulário multipart): lançar, editar, excluir, conferir, criar/ativar bloco, fechar/reabrir mês. */
export async function POST(req: NextRequest) {
  const u = await autorizar("cartao");
  if (!u) return NextResponse.json({ erro: "Sem acesso à aba Cartão de crédito." }, { status: 403 });
  if (u.demo !== true && !podeEnviar(`cartao:${u.login}`)) return NextResponse.json({ erro: "Muitas alterações em pouco tempo. Espere alguns minutos." }, { status: 429 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido (cupom maior que 4 MB?)." }, { status: 400 });
  }
  const s = (k: string) => String(form.get(k) ?? "");
  const papel = cartao.papelDe(u);
  const por = u.nome || u.login;
  const arq = form.get("cupom");
  try {
    let arquivo: { nome: string; bytes: Uint8Array } | null = null;
    if (arq instanceof File && arq.size > 0) {
      if (arq.size > LIMITE_DOCUMENTO) return NextResponse.json({ erro: "O cupom passou de 4 MB." }, { status: 413 });
      arquivo = { nome: arq.name, bytes: new Uint8Array(await arq.arrayBuffer()) };
    }
    const entrada = { data: s("data"), valor: s("valor"), estabelecimento: s("estabelecimento"), descricao: s("descricao"),
      categoria: s("categoria"), documento: s("documento"), ordem: s("ordem"), centroCusto: s("centroCusto") };
    switch (s("acao")) {
      case "lancar": await cartao.lancarGasto(papel, s("bloco"), entrada, arquivo, por); break;
      case "editar": await cartao.editarGasto(papel, s("bloco"), s("gasto"), entrada, arquivo, por); break;
      case "excluir": await cartao.excluirGasto(papel, s("bloco"), s("gasto"), por); break;
      case "conferir": await cartao.conferirGasto(papel, s("bloco"), s("gasto"), s("status"), s("motivo"), por); break;
      case "bloco": await cartao.criarBloco(papel, { nome: s("nome"), login: s("login") }, por); break;
      case "ativar": await cartao.ativarBloco(papel, s("bloco"), s("ativo") === "1", por); break;
      case "fechar": case "reabrir": await cartao.fecharMes({ ...papel, admin: ehAdmin(u) }, s("mes"), s("acao") === "fechar", por); break;
      default: return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
    }
    registrar(u.login, `cartao_${s("acao")}`, s("bloco") || s("mes"), { gasto: s("gasto") || undefined });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FonteErro) return NextResponse.json({ erro: e.message }, { status: 400 });
    console.error("cartão:", e);
    return NextResponse.json({ erro: "Não foi possível gravar agora; tente de novo." }, { status: 500 });
  }
}
