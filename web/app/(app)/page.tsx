import { redirect } from "next/navigation";

import { podeVer, soEstoque } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { GRUPOS } from "@/lib/navegacao";

export const dynamic = "force-dynamic";

/**
 * Página inicial: não é uma aba. Leva ao Painel Geral; quem não vê o painel vai para a primeira aba que vê no menu
 * (Terceiro e Manutentor, só Estoque e Suporte Técnico, vão direto para o Estoque).
 */
export default async function Inicio() {
  const u = await exigir();
  if (soEstoque(u)) redirect("/estoque");
  const aba = GRUPOS.flatMap((g) => g.abas).find((a) => !a.oculta && podeVer(u, a.id));
  redirect(aba?.rota ?? "/estoque");
}
