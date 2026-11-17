import "server-only";

import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { fonte } from "../dados/fonte";
import { erroAdminSoEstoque, FUNCOES, FUNCOES_SO_ESTOQUE, idPagina, PERFIS } from "./acesso";
import { gerarHash, normalizarLogin, validarLogin, validarSenha } from "./senha";
import { usuarios } from "./usuarios";

/**
 * Pedido de acesso (tela de entrada) e aprovação pelo administrador (Usuários) — gravado em
 * app/solicitacoes_acesso.json. A senha escolhida fica só como hash e some quando o pedido é decidido.
 */
const ARQ_SOLICITACOES = "solicitacoes_acesso.json";
const MAX_PENDENTES = 30;               // proteção contra abuso do formulário público
const INTERVALO_MS = 10 * 60_000;       // um pedido a cada 10 min por navegador

interface Pedido {
  nome?: string; funcao?: string; motivo?: string; status?: "pendente" | "aprovada" | "recusada"; criado_em?: string;
  sal?: string; senha_hash?: string; decidido_por?: string; decidido_em?: string; motivo_recusa?: string;
}

const agoraIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");

/** NP sem zeros à esquerda ("06178609" e "6178609" são a mesma pessoa). */
const semZeros = (login: string) => login.replace(/^0+(?=\d)/, "");
/** Nome para comparar: sem acento, maiúsculas, sem espaços repetidos. */
const nomeComparavel = (nome: string | undefined) =>
  String(nome || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().split(/\s+/).filter(Boolean).join(" ");

/**
 * Quem já tem usuário não pede cadastro de novo (pedido do PCM, 17/11/2026): bloqueia o mesmo Número Pessoal (também
 * com zeros à esquerda) e o mesmo nome completo (2 palavras ou mais) de um usuário já cadastrado, ativo ou não.
 */
export function jaTemUsuario(login: string, nome: string, us: Record<string, { nome?: unknown }>): string {
  const np = semZeros(login);
  if (Object.keys(us).some((k) => semZeros(k) === np))
    return "Esse Número Pessoal já tem usuário: não é preciso pedir cadastro de novo. Entre com ele; se esqueceu a senha, peça a um administrador do PCM para redefinir.";
  const n = nomeComparavel(nome);
  if (n.split(" ").length >= 2 && Object.values(us).some((u) => nomeComparavel(String(u?.nome ?? "")) === n))
    return "Já existe um usuário com esse nome: não é preciso pedir cadastro de novo. Entre com o seu Número Pessoal; se esqueceu a senha, peça a um administrador do PCM para redefinir.";
  return "";
}

export async function solicitacoes(): Promise<Record<string, Pedido>> {
  const d = await lerCadastro(ARQ_SOLICITACOES);
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v && typeof v === "object")) as Record<string, Pedido>;
}

export async function pendentes(): Promise<Record<string, Pedido>> {
  return Object.fromEntries(Object.entries(await solicitacoes()).filter(([, v]) => v.status === "pendente"));
}

const recentes = (globalThis as unknown as { __cmPedidos?: Map<string, number> }).__cmPedidos ??= new Map();

/** Grava o pedido. `origem` (o navegador) limita a um pedido a cada 10 min. Devolve o erro ou "". */
export async function solicitar(d: { nome: string; login: string; senha: string; senha2: string; funcao: string; motivo: string },
  origem: string): Promise<string> {
  if (!fonte()) return "O site está em demonstração: não há onde gravar o pedido.";
  const login = normalizarLogin(d.login);
  const nome = d.nome.split(/\s+/).filter(Boolean).join(" ").slice(0, 80);
  const erro = (nome.length < 3 ? "Informe seu nome." : "") || validarLogin(login) || validarSenha(d.senha)
    || (d.senha !== d.senha2 ? "As senhas não conferem." : "");
  if (erro) return erro;
  if (Date.now() - (recentes.get(origem) ?? 0) < INTERVALO_MS)
    return "Você acabou de enviar um pedido. Aguarde a aprovação (ou tente de novo em alguns minutos).";
  const jaTem = jaTemUsuario(login, nome, await usuarios());
  if (jaTem) return jaTem;
  const pend = await pendentes();
  if (Object.keys(pend).some((k) => semZeros(k) === semZeros(login))
    || (nomeComparavel(nome).split(" ").length >= 2 && Object.values(pend).some((p) => nomeComparavel(p.nome) === nomeComparavel(nome))))
    return "Já existe um pedido seu aguardando aprovação. Aguarde o PCM aprovar.";
  if (Object.keys(pend).length >= MAX_PENDENTES) return "Há muitos pedidos aguardando aprovação. Fale direto com o PCM.";
  await gravarCadastroLote(ARQ_SOLICITACOES, { [login]: {
    nome, funcao: d.funcao in FUNCOES ? d.funcao : "", motivo: d.motivo.trim().slice(0, 300), status: "pendente",
    criado_em: agoraIso(), ...(await gerarHash(d.senha)) } }, "pedido de acesso");
  recentes.set(origem, Date.now());
  return "";
}

async function decidir(login: string, ped: Pedido, status: "aprovada" | "recusada", por: string, motivo = "") {
  // a senha do pedido não fica guardada depois da decisão
  const { sal: _s, senha_hash: _h, ...fica } = ped as Pedido & Record<string, unknown>;
  delete (fica as Record<string, unknown>).atualizado_em;
  delete (fica as Record<string, unknown>).atualizado_por;
  await gravarCadastroLote(ARQ_SOLICITACOES, { [login]: { ...fica, status, decidido_por: por, motivo_recusa: motivo, decidido_em: agoraIso() } }, por);
}

/** Cria o usuário com a senha que a pessoa escolheu e marca o pedido como aprovado. */
export async function aprovar(login: string, funcao: string, perfil: string, abas: string[] | null, por: string): Promise<string> {
  const ped = (await pendentes())[login];
  if (!ped) return "Esse pedido não está mais pendente (outro administrador já decidiu?).";
  const jaTem = jaTemUsuario(login, ped.nome || "", await usuarios());
  if (jaTem) return `Esta pessoa já tem usuário (mesmo Número Pessoal ou mesmo nome): recuse o pedido. ${jaTem.split(":")[0]}.`;
  if (!(funcao in FUNCOES) || !(perfil in PERFIS)) return "Escolha a função e o perfil.";
  if (FUNCOES_SO_ESTOQUE.has(funcao) && perfil === "admin") return erroAdminSoEstoque(funcao);
  if (!ped.sal || !ped.senha_hash) return "O pedido está sem a senha; peça para a pessoa solicitar de novo.";
  await gravarCadastroLote("usuarios.json", { [login]: {
    nome: ped.nome || login, perfil, funcao, ativo: true, trocar_senha: false, sal: ped.sal, senha_hash: ped.senha_hash,
    ...(abas ? { abas: [...new Set(abas.map(idPagina))].sort() } : {}) } }, por);
  await decidir(login, ped, "aprovada", por);
  return "";
}

export async function recusar(login: string, motivo: string, por: string): Promise<string> {
  const ped = (await pendentes())[login];
  if (!ped) return "Esse pedido não está mais pendente.";
  await decidir(login, ped, "recusada", por, motivo.trim().slice(0, 300));
  return "";
}
