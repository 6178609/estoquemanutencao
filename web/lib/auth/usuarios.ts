import "server-only";

import { timingSafeEqual } from "node:crypto";

import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { fonte } from "../dados/fonte";
import { auditar } from "../seguranca/auditoria";
import { bloqueadoPor, ipAtual, limpar, registrarFalha, type Regra } from "../seguranca/limite";
import { acessoTotal, FUNCOES, PERFIS, type Usuario } from "./acesso";
import { confere, gerarHash, normalizarLogin, validarLogin, validarSenha } from "./senha";

/**
 * Usuários sem depender do site atual: as MESMAS regras e o MESMO arquivo (app/usuarios.json) de central/auth.py —
 * primeiro administrador, novo usuário, editar, excluir e trocar a senha. Uma conta criada aqui entra nos dois sites.
 */
export const ARQ_USUARIOS = "usuarios.json";
const FUNCOES_ACESSO_TOTAL = new Set(["lider", "analista"]);
const META = new Set(["atualizado_em", "atualizado_por"]);

export type Registro = Record<string, unknown> & {
  nome?: string; perfil?: string; funcao?: string; ativo?: boolean; abas?: unknown; trocar_senha?: boolean;
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
  return Object.keys(us).filter((k) => us[k].perfil === "admin" && us[k].ativo !== false);
}

// ----------------------------------------------------------------------------
// Primeiro acesso: o repositório de dados ainda não tem nenhum usuário
// ----------------------------------------------------------------------------
/**
 * Quem cria o primeiro administrador precisa provar que configurou o site: o código vem da variável
 * CODIGO_CONFIG da Vercel (mínimo de 16 caracteres, aleatório). Sem ela o cadastro do primeiro administrador fica
 * desligado: quem só achou o endereço do site não consegue assumir o sistema.
 */
export const CODIGO_MIN = 16;

export function codigoConfiguracao(): string {
  const c = (process.env.CODIGO_CONFIG || "").trim();
  return c.length >= CODIGO_MIN ? c : "";
}

export async function precisaPrimeiroAdmin(): Promise<boolean> {
  return !!fonte() && Object.keys(await usuarios()).length === 0;
}

const REGRA_CODIGO: Regra = { max: 5, janelaMs: 15 * 60_000 };

function codigoConfere(digitado: string, esperado: string): boolean {
  const a = Buffer.from(digitado.trim()), b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface DadosNovo { nome: string; login: string; funcao: string; perfil?: string; senha: string; senha2?: string }

export async function criarPrimeiroAdmin(d: DadosNovo & { codigo: string }): Promise<{ erro: string; login: string }> {
  const login = normalizarLogin(d.login);
  if (!fonte()) return { erro: "O site está em demonstração.", login };
  const esperado = codigoConfiguracao();
  if (!esperado)
    return { erro: `Defina CODIGO_CONFIG (mínimo de ${CODIGO_MIN} caracteres) na Vercel e refaça o deploy para criar o primeiro administrador.`, login };
  const ip = await ipAtual();
  const chave = `codigo:${ip}`, chaveGeral = "codigo:todos";
  const espera = Math.max(await bloqueadoPor(chave, REGRA_CODIGO), await bloqueadoPor(chaveGeral, { max: 30, janelaMs: 15 * 60_000 }));
  if (espera) return { erro: `Muitas tentativas com o código errado. Tente de novo em ${espera} min.`, login };
  if (!codigoConfere(d.codigo || "", esperado)) {
    await registrarFalha(chave, REGRA_CODIGO);
    await registrarFalha(chaveGeral, { max: 30, janelaMs: 15 * 60_000 });
    auditar("primeiro_admin_falha", { login, ip });
    return { erro: "Código de configuração incorreto.", login };
  }
  const erro = validarLogin(login) || validarSenha(d.senha, login) || (d.senha !== d.senha2 ? "As senhas não conferem." : "")
    || (!d.nome.trim() ? "Informe seu nome." : "")
    || (!FUNCOES_ACESSO_TOTAL.has(d.funcao) ? "O administrador vê todas as abas: escolha Líder de manutenção ou Analista." : "");
  if (erro) return { erro, login };
  if (Object.keys(await usuarios()).length) return { erro: "Já existe um administrador. Recarregue a página.", login };
  await limpar(chave);
  await salvar(login, { nome: d.nome.trim(), perfil: "admin", funcao: d.funcao, ativo: true, trocar_senha: false,
    ...(await gerarHash(d.senha)) }, login);
  auditar("primeiro_admin_criado", { login, ip });
  return { erro: "", login };
}

// ----------------------------------------------------------------------------
// Administração (tela Usuários)
// ----------------------------------------------------------------------------
export async function criarUsuario(por: string, d: DadosNovo): Promise<string> {
  const login = normalizarLogin(d.login);
  const us = await usuarios();
  const erro = validarLogin(login) || validarSenha(d.senha, login) || (!d.nome.trim() ? "Informe o nome." : "")
    || (!(d.funcao in FUNCOES) ? "Escolha a função." : "") || (!((d.perfil || "") in PERFIS) ? "Escolha o perfil." : "")
    || (login in us ? "Esse usuário já existe." : "");
  if (erro) return erro;
  await salvar(login, { nome: d.nome.trim(), perfil: d.perfil, funcao: d.funcao, ativo: true, trocar_senha: true,
    ...(await gerarHash(d.senha)) }, por);
  auditar("usuario_criado", { por, alvo: login, perfil: d.perfil, funcao: d.funcao });
  return "";
}

export interface Edicao {
  novoLogin: string; nome: string; funcao: string; perfil: string; ativo: boolean; novaSenha: string;
  abas: string[] | null; // null = padrão da função
}

export async function editarUsuario(eu: Usuario, alvo: string, e: Edicao): Promise<{ erro: string; login: string }> {
  const us = await usuarios();
  const d = Object.hasOwn(us, alvo) ? us[alvo] : undefined;
  if (!d) return { erro: "Usuário não encontrado (outra pessoa pode ter excluído).", login: alvo };
  const admins = adminsAtivos(us);
  const unicoAdmin = admins.includes(alvo) && admins.length === 1;
  const novoLogin = normalizarLogin(e.novoLogin || alvo);
  const depois: Usuario = { login: novoLogin, perfil: d.perfil, funcao: e.funcao in FUNCOES ? e.funcao : d.funcao,
    ...(e.abas ? { abas: e.abas } : {}) };
  let erro = (e.novaSenha ? validarSenha(e.novaSenha, alvo) : "")
    || (!(e.funcao in FUNCOES) && (d.funcao || "") in FUNCOES ? "Escolha a função." : "")
    || (!(e.perfil in PERFIS) ? "Escolha o perfil." : "");
  if (!erro && novoLogin !== alvo) erro = validarLogin(novoLogin) || (novoLogin in us ? "Já existe um usuário com esse NP." : "");
  if (!erro && alvo === eu.login && acessoTotal({ login: alvo, ...d }) && !acessoTotal(depois))
    erro = "Você não pode tirar de si mesmo o acesso às abas (peça a outro administrador).";
  if (erro) return { erro, login: alvo };
  const base = semMeta(d);
  delete base.abas;
  const dados: Registro = {
    ...base, ...(e.abas ? { abas: e.abas } : {}),
    nome: e.nome.trim() || d.nome || "",
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
  auditar("usuario_editado", { por: eu.login, alvo: novoLogin, perfil: String(dados.perfil), ativo: dados.ativo !== false,
    senha_redefinida: !!e.novaSenha });
  return { erro: "", login: novoLogin };
}

export async function excluirUsuario(eu: Usuario, alvo: string): Promise<string> {
  const us = await usuarios();
  if (!us[alvo]) return "";
  const admins = adminsAtivos(us);
  if (alvo === eu.login) return "Você não pode excluir a própria conta.";
  if (admins.includes(alvo) && admins.length === 1) return "Este é o único administrador ativo.";
  await salvar(alvo, null, eu.login);
  auditar("usuario_excluido", { por: eu.login, alvo });
  return "";
}

// ----------------------------------------------------------------------------
// Minha conta
// ----------------------------------------------------------------------------
/** Troca a senha da própria conta. Os outros aparelhos saem; fica só a sessão `manter` (hash), se informada. */
export async function trocarSenha(login: string, atual: string | null, s1: string, s2: string, manter: string | null):
  Promise<string> {
  const us = await usuarios();
  const d = Object.hasOwn(us, login) ? us[login] : undefined;
  if (!d) return "Usuário não encontrado.";
  const erro = (atual !== null && !(await confere(d, atual)) ? "Senha atual incorreta." : "")
    || validarSenha(s1, login) || (s1 !== s2 ? "As senhas não conferem." : "");
  if (erro) return erro;
  const sessoes = (d.sessoes || []).filter((s) => manter && s.h === manter);
  await salvar(login, { ...semMeta(d), ...(await gerarHash(s1)), trocar_senha: false, sessoes }, login);
  auditar("senha_trocada", { login });
  return "";
}

export async function desconectarTodos(login: string): Promise<void> {
  const d = (await usuarios())[login];
  if (d) await salvar(login, { ...semMeta(d), sessoes: [] }, login);
  auditar("sessoes_encerradas", { login });
}
