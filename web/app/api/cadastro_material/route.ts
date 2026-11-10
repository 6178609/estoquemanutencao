import { NextResponse, type NextRequest } from "next/server";

import { registrar } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sessao";
import * as cad from "@/lib/cadastroMaterial/dados";
import { type Acao, csvPedidos, filtrarPedidos } from "@/lib/cadastroMaterial/regras";
import { catalogo } from "@/lib/dados/bases";
import { LIMITE_DOCUMENTO } from "@/lib/dados/documentos";
import { FonteErro } from "@/lib/dados/fonte";
import { podeEnviar } from "@/lib/dados/fotos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ABA = "cadastro_material";
const ETAPAS: readonly string[] = ["aprovar", "recusar", "chegou", "validar", "recusar_chegada"];
const MB = Math.round(LIMITE_DOCUMENTO / 1_000_000);
const semZeros = (v: string) => v.replace(/^0+/, "");

/**
 * Foto de um pedido (?p=&f=pedido|chegada), planilha dos pedidos filtrados (?planilha=1&situacao=&mes=&q=) ou a
 * descrição de um código SAP no catálogo (?sap=). Tudo só para quem tem a aba.
 */
export async function GET(req: NextRequest) {
  const u = await autorizar(ABA);
  if (!u) return new NextResponse("Sem acesso.", { status: 403 });
  const p = req.nextUrl.searchParams;

  const sap = p.get("sap");
  if (sap !== null) {
    if (!/^\d{5,12}$/.test(sap)) return NextResponse.json({ erro: "Número SAP: só números, de 5 a 12 dígitos." }, { status: 400 });
    const itens = (await catalogo().catch(() => null))?.dados ?? [];
    const item = itens.find((i) => semZeros(String(i.material ?? "")) === semZeros(sap));
    const descricao = (item?.descricaoCurta || item?.descrCompleta || "").trim() || null;
    return NextResponse.json({ descricao }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (p.get("planilha")) {
    const ps = filtrarPedidos(await cad.lerPedidos(), {
      situacao: p.get("situacao") ?? "", mes: p.get("mes") ?? "", q: p.get("q") ?? "" });
    registrar(u.login, "exportacao", "cadastro_material.csv", { pedidos: ps.length });
    return new NextResponse(csvPedidos(ps), { headers: { "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="cadastro_material.csv"', "Cache-Control": "no-store" } });
  }

  const qual = p.get("f");
  if (qual !== "pedido" && qual !== "chegada") return new NextResponse("Foto inválida.", { status: 400 });
  const r = await cad.lerFoto(p.get("p") ?? "", qual);
  if (!r) return new NextResponse("Foto não encontrada.", { status: 404 });
  return new NextResponse(Buffer.from(r.bytes), { headers: {
    "Content-Type": r.tipo,
    "Content-Disposition": `inline; filename="${r.nome.replace(/[^\w.\- ]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(r.nome)}`,
    // a URL leva o id do arquivo (v=) e cada foto nova é um arquivo novo, nunca sobrescrito; v= diferente não guarda
    "Cache-Control": p.get("v") === r.arquivo ? "private, max-age=86400, immutable" : "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
}

/** Ações que podem enviar foto: só elas passam pelo limite de envios. */
const COM_FOTO = ["lancar", "editar", "chegou"];

/** Ações da aba (formulário multipart): lançar, editar, excluir e as etapas do Almoxarifado e do PCM. */
export async function POST(req: NextRequest) {
  const u = await autorizar(ABA);
  if (!u) return NextResponse.json({ erro: "Sem acesso à aba Cadastro de material." }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: `Pedido inválido (foto maior que ${MB} MB?).` }, { status: 400 });
  }
  const s = (k: string) => String(form.get(k) ?? "");
  // limite só nas ações que enviam foto (aprovar, recusar, validar e excluir não gravam arquivo)
  if (COM_FOTO.includes(s("acao")) && u.demo !== true && !podeEnviar(`cadastro_material:${u.login}`)) {
    return NextResponse.json({ erro: "Muitas alterações em pouco tempo. Espere alguns minutos." }, { status: 429 });
  }
  const papel = cad.papelDe(u, true); // autorizar já conferiu a aba
  const por = u.nome || u.login;
  const arq = form.get("foto");
  try {
    let foto: { nome: string; bytes: Uint8Array } | null = null;
    if (arq instanceof File && arq.size > 0) {
      if (arq.size > LIMITE_DOCUMENTO) return NextResponse.json({ erro: `A foto passou de ${MB} MB.` }, { status: 413 });
      foto = { nome: arq.name, bytes: new Uint8Array(await arq.arrayBuffer()) };
    }
    const entrada = { descricao: s("descricao"), sap: s("sap"), tag: s("tag"), observacao: s("observacao") };
    const acao = s("acao");
    let aviso: string | undefined;
    // a auditoria de cada ação fica em lib/cadastroMaterial/dados.ts
    if (acao === "lancar") {
      if (!foto) throw new FonteErro("Anexe a foto do material.");
      await cad.lancarPedido(papel, entrada, foto, por);
    } else if (acao === "editar") await cad.editarPedido(papel, s("id"), entrada, foto, por);
    else if (acao === "excluir") await cad.excluirPedido(papel, s("id"), por);
    else if (ETAPAS.includes(acao)) ({ aviso } = await cad.agir(papel, s("id"), acao as Acao, s("motivo"), foto, por));
    else return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
    return NextResponse.json(aviso ? { ok: true, aviso } : { ok: true });
  } catch (e) {
    if (e instanceof FonteErro) return NextResponse.json({ erro: e.message }, { status: 400 });
    console.error("cadastro de material:", e);
    return NextResponse.json({ erro: "Não foi possível gravar agora; tente de novo." }, { status: 500 });
  }
}
