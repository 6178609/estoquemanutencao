import { chave } from "@/lib/dados/texto";

/**
 * Validação dos parâmetros "Custo da produção parada" (custo do par em R$ e pares por hora).
 * Sem dependências além da regra de texto: usada pela ação do servidor e pelo editor. null = apagar (vale).
 */
export function validarCustoParada(custoPar: number | null, paresHora: number | null): string {
  if (custoPar != null && !(Number.isFinite(custoPar) && custoPar >= 0 && custoPar <= 10000))
    return "O custo do par deve ficar entre R$ 0 e R$ 10.000.";
  if (paresHora != null && !(Number.isFinite(paresHora) && paresHora >= 0 && paresHora <= 100000))
    return "Os pares por hora devem ficar entre 0 e 100.000.";
  return "";
}

/**
 * Validação da lista "Pessoas da manutenção" (quem solicita pela manutenção): até 50 nomes, cada um de 1 a 120
 * caracteres depois de aparado, e sem repetidos (comparação pela chave: sem acento, maiúsculas, espaços). "" = vale.
 */
export function validarSolicitantes(nomes: string[]): string {
  if (!Array.isArray(nomes) || nomes.some((n) => typeof n !== "string")) return "A lista de pessoas da manutenção é inválida.";
  if (nomes.length > 50) return "São aceitas no máximo 50 pessoas da manutenção.";
  const vistos = new Set<string>();
  for (const n of nomes) {
    const t = n.trim();
    if (!t || t.length > 120) return "Cada nome deve ter de 1 a 120 caracteres.";
    const k = chave(t);
    if (vistos.has(k)) return `“${t}” aparece mais de uma vez na lista.`;
    vistos.add(k);
  }
  return "";
}
