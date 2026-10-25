import { NextResponse, type NextRequest } from "next/server";

import { veInteira } from "@/lib/auth/acesso";
import { autorizar } from "@/lib/auth/sessao";
import { cancelarManualEmPartes, concluirManualEmPartes, enviarParteManual, iniciarManualEmPartes } from "@/lib/dados/documentos";
import { FonteErro } from "@/lib/dados/fonte";
import { podeIniciarEnvio } from "@/lib/dados/manuaisPartes";

export const dynamic = "force-dynamic";
// iniciar varre envios abandonados (apaga partes); dá folga ao prazo
export const maxDuration = 300;

/** Quem vincula manuais: o mesmo da rota de arquivo único (editor ou administrador que vê a aba Equipamentos inteira). */
async function quemEdita(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (origem && origem !== req.nextUrl.origin) return null;
  const u = await autorizar("equipamentos", true);
  return u && veInteira(u, "equipamentos") ? u : null;
}

function erro(e: unknown) {
  if (e instanceof FonteErro) return NextResponse.json({ erro: e.message }, { status: 400 });
  console.error("manuais em partes:", e);
  return NextResponse.json({ erro: "Não foi possível gravar agora; tente de novo." }, { status: 500 });
}

/**
 * Envio de manual grande em três passos (`?acao=`):
 * - `iniciar` (JSON: eqs, titulo, nome, tamanho) devolve o `envio` e o nº de partes;
 * - `parte` (formulário: envio, indice, arquivo de até 3,5 MB);
 * - `concluir` (JSON: envio) confere as partes e grava o manual nos equipamentos;
 * - `cancelar` (JSON: envio) desiste do envio e apaga as partes (a tela chama quando uma parte falha).
 * Só quem iniciou o envio manda as partes e conclui.
 */
export async function POST(req: NextRequest) {
  const u = await quemEdita(req);
  if (!u) return NextResponse.json({ erro: "Só editor ou administrador vincula manuais." }, { status: 403 });
  const acao = req.nextUrl.searchParams.get("acao");
  const login = u.login;
  const por = u.nome || u.login;
  try {
    if (acao === "iniciar") {
      if (!podeIniciarEnvio(`manual:${login}`)) {
        return NextResponse.json({ erro: "Muitos envios em pouco tempo. Espere alguns minutos e tente de novo." }, { status: 429 });
      }
      const c = await lerCorpo(req);
      const eqs = Array.isArray(c.eqs) ? c.eqs.map((x) => String(x)) : [];
      const r = await iniciarManualEmPartes(eqs, { titulo: String(c.titulo ?? ""), nome: String(c.nome ?? ""), tamanho: Number(c.tamanho) }, login, por);
      return NextResponse.json({ ok: true, ...r });
    }
    if (acao === "parte") {
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        return NextResponse.json({ erro: "Pedido inválido (a parte passou de 3,5 MB?)." }, { status: 400 });
      }
      const arquivo = form.get("arquivo");
      if (!(arquivo instanceof Blob)) return NextResponse.json({ erro: "Falta a parte do arquivo." }, { status: 400 });
      // sem índice, NaN (recusado), não 0 (que sobrescreveria a parte 0)
      await enviarParteManual(String(form.get("envio") ?? ""), Number(form.get("indice") ?? NaN),
        new Uint8Array(await arquivo.arrayBuffer()), login);
      return NextResponse.json({ ok: true });
    }
    if (acao === "concluir") {
      const c = await lerCorpo(req);
      const vinculados = await concluirManualEmPartes(String(c.envio ?? ""), login);
      return NextResponse.json({ ok: true, vinculados: vinculados.length });
    }
    if (acao === "cancelar") {
      const c = await lerCorpo(req);
      await cancelarManualEmPartes(String(c.envio ?? ""), login);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
  } catch (e) {
    return erro(e);
  }
}

/** Corpo em JSON (objeto); pedido ruim vira objeto vazio e a validação diz o que falta. */
async function lerCorpo(req: NextRequest): Promise<Record<string, unknown>> {
  const j = await req.json().catch(() => null);
  return j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
}
