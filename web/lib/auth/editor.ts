import "server-only";

import type { NextRequest } from "next/server";

import { veInteira } from "./acesso";
import { autorizar } from "./sessao";

/**
 * Quem pode gravar os documentos de equipamentos (manuais e documentos técnicos): sessão ativa, aba Equipamentos com
 * edição e pedido vindo do próprio site (origem igual à do endereço). Sem isso, devolve null.
 */
export async function quemEditaEquipamentos(req: NextRequest) {
  const origem = req.headers.get("origin");
  if (origem && origem !== req.nextUrl.origin) return null;
  const u = await autorizar("equipamentos", true);
  return u && veInteira(u, "equipamentos") ? u : null;
}
