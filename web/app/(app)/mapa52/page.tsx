import { redirect } from "next/navigation";

import { exigir } from "@/lib/auth/sessao";

/** A aba virou a visão "Mapa 52 semanas" da aba Planos (a IP19 é a mesma): o endereço antigo segue para lá, com os filtros. */
export default async function Mapa52Antigo(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigir("planos");
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(await props.searchParams)) for (const x of Array.isArray(v) ? v : v == null ? [] : [v]) p.append(k, x);
  p.set("vista", "mapa");
  redirect(`/planos?${p.toString()}`);
}
