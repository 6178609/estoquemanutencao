import { redirect } from "next/navigation";

import { exigir } from "@/lib/auth/sessao";

/** A aba virou a visão "Por tipo de ordem" da Confiabilidade: o endereço antigo (e os filtros dele) segue para lá. */
export default async function ConfiabilidadeTipos(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigir("confiabilidade");
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(await props.searchParams)) for (const x of Array.isArray(v) ? v : v == null ? [] : [v]) p.append(k, x);
  p.set("visao", "Por tipo de ordem");
  redirect(`/confiabilidade?${p.toString()}`);
}
