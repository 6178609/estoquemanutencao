import { createHash, pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";

/** Mesmo hash do site atual: PBKDF2-SHA256, 260.000 iterações, sal em hex (central/auth.py). */
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

/** Sal novo + hash, nos mesmos campos do site atual (gerar_hash). */
export async function gerarHash(senha: string): Promise<{ sal: string; senha_hash: string }> {
  const sal = randomBytes(16).toString("hex");
  return { sal, senha_hash: await hashSenha(senha, sal) };
}

/** Senhas que aparecem em todas as listas de vazamento (e variações óbvias do nome do site). */
const COMUNS = new Set([
  "12345678", "123456789", "1234567890", "12345678910", "password", "password1", "senha123", "senha1234", "senha12345",
  "abc12345", "abcd1234", "qwerty123", "qwertyuiop", "q1w2e3r4", "alpargatas", "alpargatas1", "alpargatas123",
  "manutencao", "manutencao1", "manutencao123", "mudar123", "mudar1234", "trocar123", "trocar1234", "sim12345",
  "f26f26f26", "estoque123", "estoque1234",
]);

/** 10+ caracteres, com letras e números, fora da lista de senhas comuns e sem ser o próprio NP.
 *  (A senha só é conferida pelo PBKDF2 do arquivo compartilhado com o site antigo, que aceita qualquer tamanho.) */
export function validarSenha(senha: string, login = ""): string {
  const s = senha || "";
  if (s.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (s.length > 128) return "A senha pode ter no máximo 128 caracteres.";
  if (/^\d+$/.test(s) || /^\p{L}+$/u.test(s)) return "Use letras e números na senha.";
  if (COMUNS.has(s.toLowerCase()) || /^(.)\1+$/.test(s)) return "Essa senha é muito comum: escolha outra.";
  if (login && s.includes(login)) return "A senha não pode conter o seu NP.";
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
