import { redirect } from "next/navigation";

import { exigir } from "@/lib/auth/sessao";

/** A programação semanal saiu do menu: a carga × capacidade é vista por mês no Mapa 52 semanas, da aba Planos. */
export default async function SemanalAntigo() {
  await exigir("planos");
  redirect("/planos?vista=mapa&vis=mensal");
}
