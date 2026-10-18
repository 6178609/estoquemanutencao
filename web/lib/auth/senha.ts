import { createHash, pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";

/** Hash do cadastro de usuários: PBKDF2-SHA256, 260.000 iterações, sal em hex. */
export const ITERACOES = 260_000;

export function hashSenha(senha: string, salHex: string): Promise<string> {
  return new Promise((ok, erro) =>
    pbkdf2(Buffer.from(senha, "utf-8"), Buffer.from(salHex, "hex"), ITERACOES, 32, "sha256", (e, k) =>
      e ? erro(e) : ok(k.toString("hex"))));
}

export async function confere(u: Record<string, unknown> | null, senha: string): Promise<boolean> {
  const sal = typeof u?.sal === "string" ? u.sal : "00".repeat(16);
  const esperado = typeof u?.senha_hash === "string" ? u.senha_hash : "00".repeat(32);
  const calculado = await hashSenha(senha, sal);   // calcula sempre: o tempo não revela se o usuário existe
  const a = Buffer.from(calculado, "hex"), b = Buffer.from(esperado, "hex");
  return !!u?.sal && !!u?.senha_hash && a.length === b.length && timingSafeEqual(a, b);
}

/** Sal novo + hash, nos campos do cadastro de usuários. */
export async function gerarHash(senha: string): Promise<{ sal: string; senha_hash: string }> {
  const sal = randomBytes(16).toString("hex");
  return { sal, senha_hash: await hashSenha(senha, sal) };
}

/** Senha válida: 8+ caracteres, com letras e números. */
export function validarSenha(senha: string): string {
  if ((senha || "").length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/^\d+$/.test(senha) || /^\p{L}+$/u.test(senha)) return "Use letras e números na senha.";
  return "";
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function validarLogin(login: string): string {
  return /^\d{5,10}$/.test(login || "") ? "" : "Usuário: use seu Número Pessoal (NP), só números (ex.: 6178609).";
}

/** "6.178.609" → "6178609"; logins antigos (com letras) continuam como eram, em minúsculas. */
export function normalizarLogin(login: string): string {
  const t = String(login || "").trim();
  const digitos = t.replace(/[\s.\-]/g, "");
  return /^\d+$/.test(digitos) ? digitos : t.toLowerCase();
}
