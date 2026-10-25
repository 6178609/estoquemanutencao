/** Linhas por página nas listas (equipamentos, manuais). */
export const LINHAS_POR_PAGINA = 50;

/** Uma página (50 por vez); a página pedida fora da faixa cai na mais próxima. */
export function paginar<T>(itens: T[], pedida: number, tamanho = LINHAS_POR_PAGINA) {
  const paginas = Math.max(1, Math.ceil(itens.length / tamanho));
  const pag = Math.min(Math.max(1, Math.floor(Number(pedida)) || 1), paginas);
  const inicio = (pag - 1) * tamanho;
  return { pag, paginas, total: itens.length, inicio, itens: itens.slice(inicio, inicio + tamanho) };
}
