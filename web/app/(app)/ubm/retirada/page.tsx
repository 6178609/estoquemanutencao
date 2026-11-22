import { redirect } from "next/navigation";

import { idArmarioValido, normalizarIdArmario } from "@/lib/ubm/regras";

/**
 * O QR de RETIRADA saiu (22/11/2026): a retirada agora é confirmada pelo líder na validação da IW13. As etiquetas antigas
 * já coladas nos armários continuam funcionando: o endereço leva à sub-aba "Validação do líder" (com o armário, se o ?u=
 * for uma identificação válida).
 */
export default async function RetiradaUbm(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const u = (await props.searchParams).u;
  const id = normalizarIdArmario(Array.isArray(u) ? u[0] : u);
  redirect(`/ubm?${new URLSearchParams({ visao: "Validação do líder", ...(idArmarioValido(id) ? { u: id } : {}) })}`);
}
