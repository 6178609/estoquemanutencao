"use client";

import clsx from "clsx";
import { LoaderCircle, Save, Trash2, UserPlus, UserRoundCog } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { Campo, Mensagem, Seletor } from "@/components/Campos";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Cartao } from "@/components/ui";
import { acaoCriarUsuario, acaoEditarUsuario, acaoExcluirUsuario, type EstadoUsuario } from "./acoes";

export interface Pessoa {
  login: string; nome: string; funcao: string; perfil: string; ativo: boolean; abas: string[] | null;
  trocarSenha: boolean; ultimoAcesso: string; unicoAdmin: boolean;
}

const FUNCOES = { lider: "Líder de manutenção", analista: "Analista", manutentor: "Manutentor" };
const PERFIS = { admin: "Administrador", editor: "Editor", leitor: "Leitor" };
const VAZIO: EstadoUsuario = { erro: "", ok: "" };

function Botao({ enviando, children, className = BOTAO_PRIMARIO }: { enviando: boolean; children: React.ReactNode; className?: string }) {
  return <button disabled={enviando} className={className}>{enviando ? <LoaderCircle className="size-5 animate-spin" /> : children}</button>;
}

function NovoUsuario() {
  const [estado, enviar, enviando] = useActionState(acaoCriarUsuario, VAZIO);
  return (
    // a chave muda a cada usuário criado: o formulário limpa só quando deu certo (com erro, o que foi digitado fica)
    <form action={enviar} key={estado.ok} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Nome" name="nome" required />
        <Campo rotulo="Número Pessoal (NP)" name="login" required inputMode="numeric" placeholder="Ex.: 6178609" />
        <Seletor rotulo="Função" name="funcao" opcoes={FUNCOES} vazio="Escolha a função" required
          dica="Líder e Analista veem todas as abas; Manutentor, Estoque e Gestão de ativos." />
        <Seletor rotulo="Perfil" name="perfil" opcoes={PERFIS} defaultValue="leitor"
          dica="Editor altera cadastros; Administrador também gerencia usuários." />
      </div>
      <Campo rotulo="Senha provisória" name="senha" type="password" required autoComplete="new-password" className="max-w-sm"
        dica="Mínimo de 8 caracteres, com letras e números. A pessoa troca no primeiro acesso." />
      {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
      {estado.ok && <Mensagem tipo="ok">{estado.ok}</Mensagem>}
      <Botao enviando={enviando}><UserPlus className="size-4" /> Criar usuário</Botao>
    </form>
  );
}

function EditarUsuario({ pessoas, eu, abas }: { pessoas: Pessoa[]; eu: string; abas: { id: string; titulo: string }[] }) {
  const [alvo, setAlvo] = useState(pessoas[0]?.login || "");
  const [estado, enviar, enviando] = useActionState(acaoEditarUsuario, VAZIO);
  const [estadoExc, excluir, excluindo] = useActionState(acaoExcluirUsuario, VAZIO);
  useEffect(() => { if (estado.alvo && estado.alvo !== alvo && pessoas.some((p) => p.login === estado.alvo)) setAlvo(estado.alvo); },
    [estado.alvo, pessoas, alvo]);
  const d = pessoas.find((p) => p.login === alvo) || pessoas[0];
  const [escolher, setEscolher] = useState(!!d?.abas);
  useEffect(() => setEscolher(!!d?.abas), [d?.login, d?.abas]);
  if (!d) return <p className="text-[14px] text-texto-3">Nenhum usuário.</p>;
  const proprio = d.login === eu;

  return (
    <div className="space-y-5">
      <Seletor rotulo="Usuário" className="max-w-md" value={d.login} onChange={(e) => setAlvo(e.target.value)}
        opcoes={Object.fromEntries(pessoas.map((p) => [p.login, `${p.login} · ${p.nome}`]))} />
      <form action={enviar} key={`${d.login}|${estado.ok}`} className="space-y-4">
        <input type="hidden" name="alvo" value={d.login} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Número Pessoal (NP)" name="novo_login" defaultValue={d.login} required
            dica="Mudar aqui troca o login (a senha continua a mesma)." />
          <Campo rotulo="Nome" name="nome" defaultValue={d.nome} />
          <Seletor rotulo="Função" name="funcao" opcoes={FUNCOES} vazio="Escolha a função" defaultValue={d.funcao in FUNCOES ? d.funcao : ""} />
          <Seletor rotulo="Perfil" name="perfil" opcoes={PERFIS} defaultValue={d.perfil in PERFIS ? d.perfil : "leitor"} disabled={d.unicoAdmin} />
        </div>
        {d.unicoAdmin && <input type="hidden" name="perfil" value={d.perfil} />}
        <label className="flex items-center gap-2 text-[14px] text-texto-2">
          <input type="checkbox" name="ativo" defaultChecked={d.ativo} disabled={d.unicoAdmin || proprio} className="size-4 accent-marca-600" />
          Ativo {(d.unicoAdmin || proprio) && <span className="text-[12.5px] text-texto-3">({proprio ? "sua conta" : "único administrador ativo"})</span>}
        </label>
        {(d.unicoAdmin || proprio) && <input type="hidden" name="ativo" value="on" />}
        <Campo rotulo="Redefinir senha (opcional)" name="nova_senha" type="password" autoComplete="new-password" className="max-w-sm"
          dica="Só se a pessoa esqueceu a senha. Ela terá de trocar no próximo acesso." />
        <fieldset className="space-y-3 rounded-xl border border-borda p-4">
          <legend className="px-1 text-[13px] font-medium text-texto-2">Abas</legend>
          <div className="flex flex-wrap gap-4 text-[14px]">
            <label className="flex items-center gap-2"><input type="radio" name="modo_abas" value="padrao" checked={!escolher}
              onChange={() => setEscolher(false)} className="accent-marca-600" /> Padrão da função</label>
            <label className="flex items-center gap-2"><input type="radio" name="modo_abas" value="escolher" checked={escolher}
              onChange={() => setEscolher(true)} className="accent-marca-600" /> Escolher as abas</label>
          </div>
          {escolher && (
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {abas.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-[13px] text-texto-2">
                  <input type="checkbox" name="abas" value={a.id} defaultChecked={d.abas?.includes(a.id)} className="size-4 accent-marca-600" />
                  {a.titulo}
                </label>
              ))}
              <p className="text-[12px] text-texto-3 sm:col-span-2 lg:col-span-3">O Estoque é sempre liberado; a Gestão de ativos também, mesmo sem marcar Equipamentos.</p>
            </div>
          )}
        </fieldset>
        {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
        {estado.ok && <Mensagem tipo="ok">{estado.ok}</Mensagem>}
        <Botao enviando={enviando}><Save className="size-4" /> Salvar alterações</Botao>
      </form>
      {!proprio && !d.unicoAdmin && (
        <form action={excluir} onSubmit={(e) => { if (!confirm(`Excluir ${d.login} de vez? (Para só bloquear o acesso, desative.)`)) e.preventDefault(); }}
          className="border-t border-borda pt-4">
          <input type="hidden" name="alvo" value={d.login} />
          {estadoExc.erro && <div className="mb-3"><Mensagem>{estadoExc.erro}</Mensagem></div>}
          {estadoExc.ok && <div className="mb-3"><Mensagem tipo="ok">{estadoExc.ok}</Mensagem></div>}
          <Botao enviando={excluindo} className={clsx(BOTAO_SECUNDARIO, "text-perigo-500")}><Trash2 className="size-4" /> Excluir usuário</Botao>
        </form>
      )}
    </div>
  );
}

export function GestaoUsuarios({ pessoas, eu, abas }: { pessoas: Pessoa[]; eu: string; abas: { id: string; titulo: string }[] }) {
  const [aba, setAba] = useState<"novo" | "editar">("novo");
  const ABAS = [{ id: "novo" as const, titulo: "Novo usuário", icone: UserPlus }, { id: "editar" as const, titulo: "Editar usuário", icone: UserRoundCog }];
  return (
    <Cartao className="p-6">
      <nav className="mb-6 flex flex-wrap gap-1">
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={clsx("inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] transition",
              aba === a.id ? "bg-superficie-3 font-medium text-texto" : "text-texto-3 hover:text-texto")}>
            <a.icone className="size-4" strokeWidth={1.75} />{a.titulo}
          </button>
        ))}
      </nav>
      {aba === "novo" ? <NovoUsuario /> : <EditarUsuario pessoas={pessoas} eu={eu} abas={abas} />}
    </Cartao>
  );
}
