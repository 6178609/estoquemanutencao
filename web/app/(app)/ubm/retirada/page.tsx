import { redirect } from "next/navigation";

/**
 * O QR de RETIRADA saiu (22/11/2026): a retirada agora é confirmada pelo líder na validação da IW13. As etiquetas antigas
 * já coladas nos armários continuam funcionando: o endereço leva à sub-aba "Validação do líder".
 */
export default function RetiradaUbm() {
  redirect(`/ubm?${new URLSearchParams({ visao: "Validação do líder" })}`);
}
