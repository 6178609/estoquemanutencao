/**
 * Defesa extra contra CSRF nas rotas de API: pedido que muda dados só vale se o Origin (ou o Referer) for do
 * próprio site. Navegadores sempre mandam Origin em POST; chamadas sem cabeçalho nenhum (curl) não carregam o
 * cookie de ninguém, então a rota de qualquer forma as barra por falta de login.
 */
export function origemConfere(h: Headers, hostEsperado: string): boolean {
  const origem = h.get("origin") || h.get("referer");
  if (!origem) return true;
  try {
    return new URL(origem).host === hostEsperado;
  } catch {
    return false;
  }
}
