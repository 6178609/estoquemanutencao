/**
 * Validação dos parâmetros "Custo da produção parada" (custo do par em R$ e pares por hora).
 * Sem dependências: usada pela ação do servidor e pelo editor. null = apagar (vale).
 */
export function validarCustoParada(custoPar: number | null, paresHora: number | null): string {
  if (custoPar != null && !(Number.isFinite(custoPar) && custoPar >= 0 && custoPar <= 10000))
    return "O custo do par deve ficar entre R$ 0 e R$ 10.000.";
  if (paresHora != null && !(Number.isFinite(paresHora) && paresHora >= 0 && paresHora <= 100000))
    return "Os pares por hora devem ficar entre 0 e 100.000.";
  return "";
}
