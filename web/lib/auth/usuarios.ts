import "server-only";

import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { fonte } from "../dados/fonte";
import { acessoTotal, ehAdmin, erroAdminSoEstoque, FUNCOES, FUNCOES_SO_ESTOQUE, PERFIS, type Usuario } from "./acesso";
import { confere, gerarHash, normalizarLogin, validarEmail, validarLogin, validarSenha } from "./senha";

/**
 * Usuários: primeiro administrador, novo usuário, editar, excluir e trocar a senha (arquivo app/usuarios.json).
 * Uma conta criada aqui vale para todo o sistema.
 */
const ARQ_USUARIOS = "usuarios.json";
const FUNCOES_ACESSO_TOTAL = new Set(["lider", "analista"]);
const META = new Set(["atualizado_em", "atualizado_por"]);

type Registro = Record<string, unknown> & {
  nome?: string; perfil?: string; funcao?: string; ativo?: boolean; abas?: unknown; trocar_senha?: boolean;
  /** para os avisos por e-mail (ex.: treinamentos vencendo, aos líderes) */
  email?: string;
  sessoes?: { h?: string; ate?: string }[]; ultimo_acesso?: string;
};

export async function usuarios(): Promise<Record<string, Registro>> {
  const todos = await lerCadastro(ARQ_USUARIOS);
  return Object.fromEntries(Object.entries(todos).filter(([, v]) => v && typeof v === "object")) as Record<string, Registro>;
}

function semMeta(r: Registro): Registro {
  return Object.fromEntries(Object.entries(r).filter(([k]) => !META.has(k))) as Registro;
}

function salvar(login: string, dados: Registro | null, por: string) {
  return gravarCadastroLote(ARQ_USUARIOS, { [login]: dados }, por);
}

export function adminsAtivos(us: Record<string, Registro>): string[] {
  return Object.keys(us).filter((k) => ehAdmin({ login: k, ...us[k] }) && us[k].ativo !== false);
}

// ----------------------------------------------------------------------------
// Primeiro acesso: o repositório de dados ainda não tem nenhum usuário
// ----------------------------------------------------------------------------
/**
 * Quem cria o primeiro administrador precisa provar que configurou o site: no modo GitHub, os 6 últimos caracteres
 * do token do repositório de dados (DADOS_GH_TOKEN) — quem só achou o endereço do site não sabe. Na pasta local
 * (desenvolvimento) vale CODIGO_CONFIG, se definido.
 */
export function codigoConfiguracao(): string {
  const f = fonte();
  if (f?.modo === "github") return (process.env.DADOS_GH_TOKEN || "").trim().slice(-6);
  return (process.env.CODIGO_CONFIG || "").trim();
}

export async function precisaPrimeiroAdmin(): Promise<boolean> {
  return !!fonte() && Object.keys(await usuarios()).length === 0;
}

const g = globalThis as unknown as { __cmFalhasCodigo?: { n: number; ate: number } };
const falhas = (g.__cmFalhasCodigo ??= { n: 0, ate: 0 });

interface DadosNovo { nome: string; login: string; funcao: string; perfil?: string; senha: string; senha2?: string; email?: string }

export async function criarPrimeiroAdmin(d: DadosNovo & { codigo: string }): Promise<{ erro: string; login: string }> {
  const login = normalizarLogin(d.login);
  if (!fonte()) return { erro: "O site está em demonstração.", login };
  if (falhas.ate > Date.now()) return { erro: "Muitas tentativas com o código errado. Tente de novo em alguns minutos.", login };
  const esperado = codigoConfiguracao();
  if (esperado && (d.codigo || "").trim() !== esperado) {
    falhas.n += 1;
    if (falhas.n >= 5) Object.assign(falhas, { n: 0, ate: Date.now() + 5 * 60_000 });
    return { erro: "Código de configuração incorreto.", login };
  }
  const erro = validarLogin(login) || validarSenha(d.senha) || (d.senha !== d.senha2 ? "As senhas não conferem." : "")
    || (!d.nome.trim() ? "Informe seu nome." : "")
    || (!FUNCOES_ACESSO_TOTAL.has(d.funcao) ? "O administrador vê todas as abas: escolha Líder de manutenção ou Analista." : "");
  if (erro) return { erro, login };
  if (Object.keys(await usuarios()).length) return { erro: "Já existe um administrador. Recarregue a página.", login };
  falhas.n = 0;
  await salvar(login, { nome: d.nome.trim(), perfil: "admin", funcao: d.funcao, ativo: true, trocar_senha: false,
    ...(await gerarHash(d.senha)) }, login);
  return { erro: "", login };
}

// ----------------------------------------------------------------------------
// Administração (tela Usuários)
// ----------------------------------------------------------------------------
export async function criarUsuario(por: string, d: DadosNovo): Promise<string> {
  const login = normalizarLogin(d.login);
  const us = await usuarios();
  const erro = validarLogin(login) || validarSenha(d.senha) || validarEmail(d.email ?? "") || (!d.nome.trim() ? "Informe o nome." : "")
    || (!(d.funcao in FUNCOES) ? "Escolha a função." : "") || (!((d.perfil || "") in PERFIS) ? "Escolha o perfil." : "")
    || (FUNCOES_SO_ESTOQUE.has(d.funcao) && d.perfil === "admin" ? erroAdminSoEstoque(d.funcao) : "")
    || (login in us ? "Esse usuário já existe." : "");
  if (erro) return erro;
  await salvar(login, { nome: d.nome.trim(), perfil: d.perfil, funcao: d.funcao, ativo: true, trocar_senha: true,
    ...(d.email?.trim() ? { email: d.email.trim().toLowerCase() } : {}), ...(await gerarHash(d.senha)) }, por);
  return "";
}

interface Edicao {
  novoLogin: string; nome: string; funcao: string; perfil: string; ativo: boolean; novaSenha: string;
  /** undefined = mantém o atual; "" = apaga */
  email?: string;
  abas: string[] | null; // null = padrão da função
}

export async function editarUsuario(eu: Usuario, alvo: string, e: Edicao): Promise<{ erro: string; login: string }> {
  const us = await usuarios();
  const d = us[alvo];
  if (!d) return { erro: "Usuário não encontrado (outra pessoa pode ter excluído).", login: alvo };
  const admins = adminsAtivos(us);
  const unicoAdmin = admins.includes(alvo) && admins.length === 1;
  const novoLogin = normalizarLogin(e.novoLogin || alvo);
  const depois: Usuario = { login: novoLogin, perfil: d.perfil, funcao: e.funcao in FUNCOES ? e.funcao : d.funcao,
    ...(e.abas ? { abas: e.abas } : {}) };
  let erro = (e.novaSenha ? validarSenha(e.novaSenha) : "") || validarEmail(e.email ?? "")
    || (!(e.funcao in FUNCOES) && (d.funcao || "") in FUNCOES ? "Escolha a função." : "")
    || (!(e.perfil in PERFIS) ? "Escolha o perfil." : "")
    || (FUNCOES_SO_ESTOQUE.has(depois.funcao || "") && (unicoAdmin ? d.perfil : e.perfil) === "admin" ? erroAdminSoEstoque(depois.funcao || "") : "");
  if (!erro && novoLogin !== alvo) erro = validarLogin(novoLogin) || (novoLogin in us ? "Já existe um usuário com esse NP." : "");
  if (!erro && alvo === eu.login && acessoTotal({ login: alvo, ...d }) && !acessoTotal(depois))
    erro = "Você não pode tirar de si mesmo o acesso às abas (peça a outro administrador).";
  if (erro) return { erro, login: alvo };
  const base = semMeta(d);
  delete base.abas;
  if (e.email !== undefined) delete base.email;
  const dados: Registro = {
    ...base, ...(e.abas ? { abas: e.abas } : {}),
    nome: e.nome.trim() || d.nome || "",
    ...(e.email?.trim() ? { email: e.email.trim().toLowerCase() } : {}),
    ...(e.funcao in FUNCOES ? { funcao: e.funcao } : {}),
    perfil: unicoAdmin ? d.perfil : e.perfil,
    ativo: unicoAdmin || alvo === eu.login ? true : e.ativo,
  };
  if (e.novaSenha) Object.assign(dados, await gerarHash(e.novaSenha), { trocar_senha: true, sessoes: [] });
  if (!dados.ativo) dados.sessoes = [];
  if (novoLogin !== alvo) {
    await salvar(novoLogin, dados, eu.login);
    await salvar(alvo, null, eu.login);
  } else await salvar(alvo, dados, eu.login);
  return { erro: "", login: novoLogin };
}

export async function excluirUsuario(eu: Usuario, alvo: string): Promise<string> {
  const us = await usuarios();
  if (!us[alvo]) return "";
  const admins = adminsAtivos(us);
  if (alvo === eu.login) return "Você não pode excluir a própria conta.";
  if (admins.includes(alvo) && admins.length === 1) return "Este é o único administrador ativo.";
  await salvar(alvo, null, eu.login);
  return "";
}

// ----------------------------------------------------------------------------
// Minha conta
// ----------------------------------------------------------------------------
/** Troca a senha da própria conta. Os outros aparelhos saem; fica só a sessão `manter` (hash), se informada. */
export async function trocarSenha(login: string, atual: string | null, s1: string, s2: string, manter: string | null):
  Promise<string> {
  const d = (await usuarios())[login];
  if (!d) return "Usuário não encontrado.";
  const erro = (atual !== null && !(await confere(d, atual)) ? "Senha atual incorreta." : "")
    || validarSenha(s1) || (s1 !== s2 ? "As senhas não conferem." : "");
  if (erro) return erro;
  const sessoes = (d.sessoes || []).filter((s) => manter && s.h === manter);
  await salvar(login, { ...semMeta(d), ...(await gerarHash(s1)), trocar_senha: false, sessoes }, login);
  return "";
}

export async function desconectarTodos(login: string): Promise<void> {
  const d = (await usuarios())[login];
  if (d) await salvar(login, { ...semMeta(d), sessoes: [] }, login);
}
