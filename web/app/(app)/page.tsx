import { redirect } from "next/navigation";

import { podeVer } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { GRUPOS } from "@/lib/navegacao";

export const dynamic = "force-dynamic";

/**
 * Página inicial: não é uma aba. Leva ao Painel Geral; quem não vê o painel vai para a primeira aba que vê no menu
 * (quem tem o Estoque e não tem o Painel vai direto para o Estoque; quem não tem nenhuma aba, para Minha conta).
 */
export default async function Inicio() {
  const u = await exigir();
  if (!podeVer(u, "painel") && podeVer(u, "estoque")) redirect("/estoque");
  const aba = GRUPOS.flatMap((g) => g.abas).find((a) => !a.oculta && podeVer(u, a.id));
  redirect(aba?.rota ?? "/conta");
}
