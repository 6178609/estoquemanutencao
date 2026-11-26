import { NextResponse, type NextRequest } from "next/server";

import { registrar } from "@/lib/auditoria";
import { podeVerValores } from "@/lib/auth/acesso";
import { autorizar } from "@/lib/auth/sessao";
import { precosOuNada } from "@/lib/dados/custo";
import { precoDe, valorDe } from "@/lib/dados/custoMaterial";
import { LIMITE_DOCUMENTO } from "@/lib/dados/documentos";
import { FonteErro } from "@/lib/dados/fonte";
import { podeEnviar } from "@/lib/dados/fotos";
import { gerarXlsx, gerarXlsxAbas } from "@/lib/exportacao/xlsx";
import * as D from "@/lib/ubm/dados";
import { enderecosQr, etiquetaSvg, ETIQUETAS, qrPng, qrSvg, siteDe } from "@/lib/ubm/qr";
import * as R from "@/lib/ubm/regras";
import * as V from "@/lib/ubm/validacao";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ABA = "ubm";
const MB = Math.round(LIMITE_DOCUMENTO / 1_000_000);
const SEM_CACHE = { "Cache-Control": "private, no-store" };
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FUSO = "America/Sao_Paulo";
const dataHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(d);
};
const planilha = (nome: string, bytes: Uint8Array) => new NextResponse(Buffer.from(bytes), { headers: {
  "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "no-store" } });

/**
 * Tudo só para quem tem a aba: foto de um movimento (?foto=<id>&v=<arquivo>), descrição de um código no catálogo e no
 * kit do armário (?codigo=&u=), QR para baixar (?qr=solicitacao&u=&formato=svg|png|etiqueta; o de retirada saiu: 404),
 * planilhas (?planilha=retiradas|reposicao|validacao|kit|modelo_kit).
 */
export async function GET(req: NextRequest) {
  const u = await autorizar(ABA);
  if (!u) return new NextResponse("Sem acesso.", { status: 403 });
  const p = req.nextUrl.searchParams;

  const qr = p.get("qr");
  if (qr !== null) {
    // QR de retirada desativado (a retirada é confirmada na validação do líder)
    if (qr === "retirada") return new NextResponse("O QR de retirada foi desativado: a retirada agora é confirmada pelo líder na validação.", { status: 404 });
    if (qr !== "solicitacao") return new NextResponse("QR inválido.", { status: 400 });
    const a = await D.armario(p.get("u") ?? "");
    if (!a) return new NextResponse("Armário não encontrado.", { status: 404 });
    const e = ETIQUETAS.find((x) => x.qual === qr)!;
    const url = enderecosQr(siteDe(req.nextUrl.origin), a.id)[qr];
    const formato = p.get("formato") ?? "svg";
    const baixar = (corpo: BodyInit, tipo: string, nome: string) => new NextResponse(corpo, { headers: {
      "Content-Type": tipo, "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" } });
    if (formato === "png") return baixar(Buffer.from(await qrPng(url)), "image/png", `${a.id}_${qr}_qr.png`);
    if (formato === "etiqueta") {
      return baixar(await etiquetaSvg({ titulo: e.titulo, armario: a.id, nome: a.nome, local: a.local, instrucao: e.instrucao, url }),
        "image/svg+xml; charset=utf-8", `${a.id}_${qr}_etiqueta.svg`);
    }
    if (formato !== "svg") return new NextResponse("Formato inválido.", { status: 400 });
    const svg = (await qrSvg(url)).replace(/^<svg /, '<svg width="1200" height="1200" ');
    return baixar(`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, "image/svg+xml; charset=utf-8", `${a.id}_${qr}_qr.svg`);
  }

  const codigo = p.get("codigo");
  if (codigo !== null) {
    const c = R.normalizarCodigo(codigo);
    if (!R.codigoValido(c)) return NextResponse.json({ erro: "Código inválido." }, { status: 400 });
    const [descricao, a] = await Promise.all([D.descricaoCatalogo(c), D.armario(p.get("u") ?? "")]);
    const kit = R.itemDoKit(a, c);
    return NextResponse.json({ codigo: c, descricao: descricao || kit?.descricao || null, kit: kit ? { um: kit.um, descricao: kit.descricao } : null },
      { headers: SEM_CACHE });
  }

  const qual = p.get("planilha");
  if (qual) {
    if (qual === "modelo_kit")
      return planilha("modelo_kit_ubm.xlsx", gerarXlsx("Kit", R.COLUNAS_KIT.map((titulo) => ({ titulo, largura: titulo === "Descrição" ? 40 : 18 })), []));
    const [armarios, movs] = await Promise.all([D.lerArmarios(), D.lerMovimentos()]);
    if (qual === "kit") {
      const a = armarios.find((x) => x.id === R.normalizarIdArmario(p.get("u")));
      if (!a) return new NextResponse("Armário não encontrado.", { status: 404 });
      registrar(u.login, "exportacao", `ubm_kit_${a.id}.xlsx`, { itens: a.itens.length });
      return planilha(`kit_${a.id}.xlsx`, gerarXlsx("Kit", R.COLUNAS_KIT.map((titulo) => ({ titulo, largura: titulo === "Descrição" ? 40 : 18 })),
        R.linhasKitPlanilha(a.itens)));
    }
    const filtro = { armario: p.get("u") ?? "", de: p.get("de") ?? "", ate: p.get("ate") ?? "" };
    if (qual === "reposicao") {
      const lista = R.listaReposicao(armarios.filter((a) => !R.idArmarioValido(filtro.armario) || a.id === filtro.armario), movs);
      // preço médio e valor a separar só para quem vê valores (e com a base de custo carregada)
      const precos = podeVerValores(u) ? await precosOuNada() : null;
      registrar(u.login, "exportacao", "ubm_reposicao.xlsx", { itens: lista.length });
      return planilha("ubm_reposicao.xlsx", gerarXlsx("Reposição", [
        { titulo: "Armário", largura: 12 }, { titulo: "Código", largura: 14 }, { titulo: "Descrição", largura: 40 }, { titulo: "UM", largura: 8 },
        { titulo: "Saldo", largura: 10 }, { titulo: "Mínimo", largura: 10 }, { titulo: "Padrão", largura: 10 }, { titulo: "Separar", largura: 10 },
        ...(precos ? [{ titulo: "Preço médio", largura: 14 }, { titulo: "Valor a separar", largura: 16 }] : []),
      ], lista.map((l) => [l.armario, l.codigo, l.descricao, l.um, l.saldo, l.minimo, l.maximo, l.separar,
        ...(precos ? [precoDe(precos, l.codigo), valorDe(precos, l.codigo, l.separar, l.um)] : [])])));
    }
    if (qual === "validacao") {
      const [iw13, ordens, vs] = await Promise.all([D.linhasIw13(), D.ordensDeQuebra(), D.lerValidacoes()]);
      const pend = V.pendencias(iw13.dados ?? [], ordens ?? new Map(), armarios, movs, vs, filtro);
      const hist = V.filtrarValidacoes(vs, { ...filtro, decisao: p.get("dec") ?? "" });
      registrar(u.login, "exportacao", "ubm_validacao.xlsx", { pendentes: V.totalPendente(pend), validacoes: hist.length });
      return planilha("ubm_validacao.xlsx", gerarXlsxAbas([
        { nome: "Pendências", colunas: [
          { titulo: "Ordem", largura: 14 }, { titulo: "Texto da ordem", largura: 40 }, { titulo: "Nota de quebra", largura: 14 }, { titulo: "Equipamento", largura: 16 },
          { titulo: "Lançado na IW13", largura: 14 }, { titulo: "Código", largura: 14 }, { titulo: "Descrição", largura: 40 }, { titulo: "Tomado", largura: 10 },
          { titulo: "UM", largura: 8 }, { titulo: "Armários com o item", largura: 24 }, { titulo: "Saldo na UBM", largura: 12 },
        ], linhas: pend.flatMap((o) => o.itens.map((i) => [o.ordem, o.info?.texto ?? "", o.info?.nota ?? "", o.equipamento, i.data ? i.data.split("-").reverse().join("/") : "",
          i.codigo, i.descricao, i.tomada, i.umIw13, i.armarios.map((a) => a.id).join(", "), i.armarios.reduce((t, a) => t + a.saldo, 0)])) },
        { nome: "Validações", colunas: [
          { titulo: "Validado em", largura: 18 }, { titulo: "Decisão", largura: 16 }, { titulo: "Ordem", largura: 14 }, { titulo: "Código", largura: 14 },
          { titulo: "Armário", largura: 12 }, { titulo: "Quantidade", largura: 12 }, { titulo: "UM", largura: 8 }, { titulo: "Tomado na IW13", largura: 14 },
          { titulo: "Lançado na IW13", largura: 14 }, { titulo: "Equipamento", largura: 16 }, { titulo: "Validado por", largura: 24 },
        ], linhas: hist.map((v) => [dataHora(v.em), V.DECISOES[v.decisao], v.ordem, v.codigo, v.armario, v.quantidade, v.um, v.tomada,
          v.dataIw13 ? v.dataIw13.split("-").reverse().join("/") : "", v.equipamento, v.porNome]) },
      ]));
    }
    if (qual === "retiradas") {
      const rs = R.filtrar(movs, filtro).filter((m) => m.tipo === "retirada");
      const ordens = await D.ordensIw38();
      registrar(u.login, "exportacao", "ubm_retiradas.xlsx", { retiradas: rs.length });
      const solic = R.filtrar(movs, filtro).filter((m) => m.tipo === "solicitacao");
      return planilha("ubm_retiradas.xlsx", gerarXlsxAbas([
        { nome: "Retiradas", colunas: [
          { titulo: "Data", largura: 18 }, { titulo: "Armário", largura: 12 }, { titulo: "Código", largura: 14 }, { titulo: "Quantidade", largura: 12 },
          { titulo: "Ordem", largura: 14 }, { titulo: "Ordem na IW38", largura: 40 }, { titulo: "Equipamento", largura: 18 },
          { titulo: "Origem", largura: 22 }, { titulo: "Descrição do uso", largura: 50 }, { titulo: "Confirmado por", largura: 24 },
        ], linhas: rs.map((m) => {
          const o = ordens?.get(R.chaveOrdem(m.ordem));
          return [dataHora(m.em), m.armario, m.codigo, m.quantidade, m.ordem, o ? o.texto : ordens ? "Não encontrada na IW38" : "", o?.equipamento ?? "",
            m.origem === "validacao" ? "Validação do líder (IW13)" : "QR de retirada (antigo)", m.uso, m.porNome];
        }) },
        { nome: "Solicitações", colunas: [
          { titulo: "Data", largura: 18 }, { titulo: "Armário", largura: 12 }, { titulo: "Tipo", largura: 30 }, { titulo: "Código", largura: 14 },
          { titulo: "Quantidade", largura: 12 }, { titulo: "Observação", largura: 50 }, { titulo: "Pedido por", largura: 24 }, { titulo: "Fechada em", largura: 18 },
        ], linhas: solic.map((m) => [dataHora(m.em), m.armario, m.tipoSolicitacao ? R.TIPOS_SOLICITACAO[m.tipoSolicitacao] : "", m.codigo, m.quantidade,
          m.observacao, m.porNome, m.fechadaEm ? dataHora(m.fechadaEm) : ""]) },
      ]));
    }
    return new NextResponse("Planilha inválida.", { status: 400 });
  }

  const r = await D.lerFoto(p.get("foto") ?? "");
  if (!r) return new NextResponse("Foto não encontrada.", { status: 404 });
  return new NextResponse(Buffer.from(r.bytes), { headers: {
    "Content-Type": r.tipo,
    "Content-Disposition": `inline; filename="${r.nome.replace(/[^\w.\- ]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(r.nome)}`,
    // cada foto é um arquivo novo, nunca sobrescrito: com o id do arquivo (v=) pode guardar
    "Cache-Control": p.get("v") === r.arquivo ? "private, max-age=86400, immutable" : "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
}

/** Ações que gravam foto (limite de 20 a cada 10 min) e a validação do líder (gravação sem arquivo: limite maior). */
const COM_FOTO = ["solicitacao"];
const LIMITE_VALIDACAO = 120;

const json = (v: string): unknown => { try { return JSON.parse(v); } catch { return null; } };

/** Gravações da aba (formulário multipart). Quem gere (armário, reposição, contagem, fechar) é conferido em lib/ubm/dados.ts. */
export async function POST(req: NextRequest) {
  const u = await autorizar(ABA);
  if (!u) return NextResponse.json({ erro: "Sem acesso à aba UBM." }, { status: 403 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ erro: `Pedido inválido (foto maior que ${MB} MB?).` }, { status: 400 });
  }
  const s = (k: string) => String(form.get(k) ?? "");
  const acao = s("acao");
  if (acao === "retirada") {
    return NextResponse.json({ erro: "A retirada agora é confirmada pelo líder na validação (aba UBM → Validação do líder)." }, { status: 410 });
  }
  if (u.demo !== true && ((COM_FOTO.includes(acao) && !podeEnviar(`ubm:${u.login}`))
    || (acao === "validar" && !podeEnviar(`ubm-validar:${u.login}`, Date.now(), LIMITE_VALIDACAO)))) {
    return NextResponse.json({ erro: "Muitos envios em pouco tempo. Espere alguns minutos." }, { status: 429 });
  }
  const quem = D.quemDe(u);
  const arq = form.get("foto");
  try {
    let foto: { nome: string; bytes: Uint8Array } | null = null;
    if (arq instanceof File && arq.size > 0) {
      if (arq.size > LIMITE_DOCUMENTO) return NextResponse.json({ erro: `A foto passou de ${MB} MB.` }, { status: 413 });
      foto = { nome: arq.name, bytes: new Uint8Array(await arq.arrayBuffer()) };
    }
    const linhas = () => {
      const v = json(s("itens"));
      return Array.isArray(v) ? v.slice(0, R.MAX_ITENS_KIT + 1).map((x) => ({ codigo: String(x?.codigo ?? ""), quantidade: String(x?.quantidade ?? "") })) : [];
    };
    if (acao === "validar") {
      const v = await D.validar(quem, s("chave"), { decisao: s("decisao"), armario: s("armario"), quantidade: s("quantidade") });
      return NextResponse.json({ ok: true, decisao: v.decisao, movimento: v.movimento || null });
    }
    if (acao === "desfazer") { await D.desfazerValidacao(quem, s("chave")); return NextResponse.json({ ok: true }); }
    if (acao === "solicitacao") {
      const id = await D.registrarSolicitacao(quem, s("u"), { tipo: s("tipo"), codigo: s("codigo"), quantidade: s("quantidade"),
        observacao: s("observacao") }, foto);
      return NextResponse.json({ ok: true, id });
    }
    if (acao === "reposicao" || acao === "contagem") {
      const n = await D.lancar(quem, s("u"), acao, linhas(), s("observacao"));
      return NextResponse.json({ ok: true, itens: n });
    }
    if (acao === "fechar") { await D.fecharSolicitacao(quem, s("id")); return NextResponse.json({ ok: true }); }
    if (acao === "armario") {
      const itens = json(s("itens"));
      const id = await D.salvarArmario(quem, { id: s("id"), nome: s("nome"), local: s("local"), ativo: s("ativo") !== "nao",
        itens: Array.isArray(itens) ? itens : [] }, s("novo") === "1");
      return NextResponse.json({ ok: true, id });
    }
    return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
  } catch (e) {
    if (e instanceof FonteErro) return NextResponse.json({ erro: e.message }, { status: 400 });
    console.error("UBM:", e);
    return NextResponse.json({ erro: "Não foi possível gravar agora; tente de novo." }, { status: 500 });
  }
}
