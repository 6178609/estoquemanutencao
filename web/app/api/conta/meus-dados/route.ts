import { NextResponse } from "next/server";

import { eventos, registrar } from "@/lib/auditoria";
import { usuarioAtual } from "@/lib/auth/sessao";
import { usuarios } from "@/lib/auth/usuarios";

export const dynamic = "force-dynamic";

/** Só estes campos do cadastro saem (nunca a senha, o sal, o hash nem os tokens das sessões). */
const CAMPOS = ["nome", "funcao", "perfil", "abas", "email", "ativo", "trocar_senha", "ultimo_acesso", "atualizado_em", "atualizado_por"];

/** LGPD (acesso aos dados): o que o site guarda da própria pessoa — cadastro de usuário e registros de auditoria. */
export async function GET() {
  const u = await usuarioAtual();
  if (!u) return NextResponse.json({ erro: "Entre no site para baixar os seus dados." }, { status: 401 });
  if (u.demo) return NextResponse.json({ erro: "Na demonstração não há dados pessoais guardados." }, { status: 400 });
  const reg = (await usuarios())[u.login] ?? {};
  const agora = new Date().toISOString();
  const cadastro = Object.fromEntries(CAMPOS.filter((k) => reg[k] !== undefined).map((k) => [k, reg[k]]));
  const corpo = {
    gerado_em: agora,
    usuario: u.login,
    cadastro,
    aparelhos_conectados: (reg.sessoes ?? []).filter((s) => (s.ate || "") > agora).length,
    ...(await Promise.all([eventos({ quem: u.login, limite: 2_000 }), eventos({ alvo: u.login, limite: 2_000 })])
      .then(([feitas, sobre]) => ({ auditoria_o_que_voce_fez: feitas, auditoria_feito_sobre_voce: sobre.filter((e) => e.quem !== u.login) }))
      .catch(() => ({ auditoria: "indisponível agora; tente de novo mais tarde" }))),
    observacao: "Senha (hash e sal) e tokens de sessão ficam de fora por segurança. Correção ou exclusão: peça a um administrador do site.",
  };
  registrar(u.login, "meus_dados", u.login);
  return new NextResponse(JSON.stringify(corpo, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="meus_dados_${u.login}.json"`,
      "Cache-Control": "no-store" },
  });
}
