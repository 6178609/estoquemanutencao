/**
 * Caminho de volta depois de entrar (`/entrar?volta=…`): quem abre um link do site sem estar logado (ex.: o QR da UBM)
 * entra e volta para onde ia. Só caminho interno do próprio site — nunca outro endereço (redirecionamento aberto).
 * Testado em testes/ubm.test.ts.
 */
export const PARAM_VOLTA = "volta";
/** Cabeçalho que o proxy (proxy.ts) passa às páginas com o caminho pedido. */
export const CABECALHO_CAMINHO = "x-cm-caminho";

export function caminhoDeVolta(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > 300) return "";
  // só "/algo": nada de "//host", "/\host", esquema (http:, javascript:), caracteres de controle ou barra invertida
  if (!s.startsWith("/") || s.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(s)) return "";
  let u: URL;
  try {
    u = new URL(s, "http://interno.invalid");
  } catch {
    return "";
  }
  if (u.origin !== "http://interno.invalid") return "";
  if (u.pathname === "/entrar" || u.pathname.startsWith("/entrar/") || u.pathname.startsWith("/api/")) return "";
  return `${u.pathname}${u.search}`;
}
