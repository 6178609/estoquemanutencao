"use client";

import clsx from "clsx";
import { Check, Inbox, LoaderCircle, Save, Trash2, UserCheck, UserPlus, UserRoundCog, UserX, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { Campo, Mensagem, Seletor } from "@/components/Campos";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Cartao } from "@/components/ui";
import { acaoAprovar, acaoCriarUsuario, acaoEditarUsuario, acaoExcluirUsuario, acaoRecusar, type EstadoUsuario } from "./acoes";

export interface Pessoa {
  login: string; nome: string; funcao: string; perfil: string; ativo: boolean; abas: string[] | null; email: string;
  trocarSenha: boolean; ultimoAcesso: string; unicoAdmin: boolean;
}

export interface PedidoAcesso {
  login: string; nome: string; funcao: string; motivo: string; criadoEm: string;
  /** o NP na lista da Gestão de HH: "cargo · área" (null = não está; undefined = lista não carregada) */
  equipe?: string | null;
  status: string; decididoPor: string; decididoEm: string; motivoRecusa: string;
}

const FUNCOES = { lider: "Líder de manutenção", analista: "Analista", manutentor: "Manutentor", terceiro: "Terceiro" };
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
          dica="Líder e Analista veem todas as abas; Manutentor e Terceiro, só o Estoque." />
        <Seletor rotulo="Perfil" name="perfil" opcoes={PERFIS} defaultValue="leitor"
          dica="Editor altera cadastros; Administrador também gerencia usuários." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Senha provisória" name="senha" type="password" required autoComplete="new-password"
          dica="Mínimo de 8 caracteres, com letras e números. A pessoa troca no primeiro acesso." />
        <Campo rotulo="E-mail (opcional)" name="email" type="email" autoComplete="off" inputMode="email"
          dica="Líderes com e-mail recebem toda semana o aviso de treinamentos vencendo." />
      </div>
      {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
      {estado.ok && <Mensagem tipo="ok">{estado.ok}</Mensagem>}
      <Botao enviando={enviando}><UserPlus className="size-4" /> Criar usuário</Botao>
    </form>
  );
}

type Aba = { id: string; titulo: string };

function EscolhaAbas({ abas, marcadas, escolher, setEscolher }: {
  abas: Aba[]; marcadas: string[] | null; escolher: boolean; setEscolher: (v: boolean) => void;
}) {
  return (
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
              <input type="checkbox" name="abas" value={a.id} defaultChecked={marcadas?.includes(a.id)} className="size-4 accent-marca-600" />
              {a.titulo}
            </label>
          ))}
          <p className="text-[12px] text-texto-3 sm:col-span-2 lg:col-span-3">O Estoque é sempre liberado; a Gestão de ativos também, mesmo sem marcar Equipamentos. Para Manutentor e Terceiro vale sempre só o Estoque.</p>
        </div>
      )}
    </fieldset>
  );
}

function Solicitacoes({ pedidos, abas }: { pedidos: PedidoAcesso[]; abas: Aba[] }) {
  const pend = pedidos.filter((p) => p.status === "pendente");
  const decididos = pedidos.filter((p) => p.status !== "pendente").sort((a, b) => b.decididoEm.localeCompare(a.decididoEm)).slice(0, 30);
  const [alvo, setAlvo] = useState(pend[0]?.login || "");
  const [escolher, setEscolher] = useState(false);
  const [estadoAp, aprovarAcao, aprovando] = useActionState(acaoAprovar, VAZIO);
  const [estadoRe, recusarAcao, recusando] = useActionState(acaoRecusar, VAZIO);
  const d = pend.find((p) => p.login === alvo) || pend[0];
  const ultimo = [estadoAp, estadoRe].find((e) => e.ok || e.erro);

  return (
    <div className="space-y-6">
      {ultimo?.ok && <Mensagem tipo="ok">{ultimo.ok}</Mensagem>}
      {!d ? (
        <div className="flex items-center gap-3 rounded-xl border border-borda bg-superficie-2 px-4 py-3.5 text-[14px] text-texto-2">
          <Inbox className="size-4 shrink-0 text-texto-3" />
          Nenhum pedido aguardando. Quem não tem acesso pede na tela de entrada, em <b>Solicitar acesso</b>.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-borda">
            <table className="w-full min-w-[680px] text-left text-[13.5px]">
              <thead className="border-b border-borda bg-superficie-2 text-[12px] text-texto-3">
                <tr>{["", "NP", "Nome", "Função informada", "Motivo", "Pedido em"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {pend.map((p) => (
                  <tr key={p.login} onClick={() => setAlvo(p.login)}
                    className={clsx("cursor-pointer", p.login === d.login ? "bg-marca-500/8" : "hover:bg-superficie-2")}>
                    <td className="w-8 px-3 py-2.5"><input type="radio" name="pedido" checked={p.login === d.login} onChange={() => setAlvo(p.login)}
                      aria-label={`Pedido de ${p.login}`} className="accent-marca-600" /></td>
                    <td className="num px-3 py-2.5 font-mono">{p.login}</td>
                    <td className="px-3 py-2.5">{p.nome}</td>
                    <td className="px-3 py-2.5">{FUNCOES[p.funcao as keyof typeof FUNCOES] || <span className="text-texto-3">—</span>}</td>
                    <td className="max-w-[280px] px-3 py-2.5 text-texto-2">{p.motivo || <span className="text-texto-3">—</span>}</td>
                    <td className="num px-3 py-2.5 text-texto-3">{p.criadoEm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div key={`${d.login}|${estadoAp.ok}|${estadoRe.ok}`} className="space-y-4 rounded-xl border border-borda p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-display text-[16px] font-medium">{d.nome} <span className="num font-mono text-[14px] text-texto-3">· {d.login}</span></h3>
              {d.equipe === undefined ? null : d.equipe ? (
                <span className="flex items-center gap-1 text-[13px] text-marca-600 dark:text-marca-300"><Check className="size-3.5" /> Está na lista da Gestão de HH ({d.equipe})</span>
              ) : (
                <span className="flex items-center gap-1 text-[13px] text-alp-laranja"><X className="size-3.5" /> NP não está na lista da Gestão de HH — confira antes de liberar</span>
              )}
            </div>
            <form action={aprovarAcao} className="space-y-4">
              <input type="hidden" name="alvo" value={d.login} />
              <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
                <Seletor rotulo="Função" name="funcao" opcoes={FUNCOES} vazio="Escolha a função" required
                  defaultValue={d.funcao in FUNCOES ? d.funcao : ""} dica="Já vem a que a pessoa informou; ajuste se precisar." />
                <Seletor rotulo="Perfil" name="perfil" opcoes={PERFIS} defaultValue="leitor"
                  dica="Editor altera cadastros; Administrador também gerencia usuários." />
              </div>
              <EscolhaAbas abas={abas} marcadas={null} escolher={escolher} setEscolher={setEscolher} />
              {estadoAp.erro && <Mensagem>{estadoAp.erro}</Mensagem>}
              <Botao enviando={aprovando}><UserCheck className="size-4" /> Aprovar e criar usuário</Botao>
            </form>
            <form action={recusarAcao} className="space-y-3 border-t border-borda pt-4">
              <input type="hidden" name="alvo" value={d.login} />
              <Campo rotulo="Motivo da recusa (opcional)" name="motivo" maxLength={300} className="max-w-xl" />
              {estadoRe.erro && <Mensagem>{estadoRe.erro}</Mensagem>}
              <Botao enviando={recusando} className={clsx(BOTAO_SECUNDARIO, "text-perigo-500")}><UserX className="size-4" /> Recusar pedido</Botao>
            </form>
          </div>
        </>
      )}

      {decididos.length > 0 && (
        <details className="rounded-xl border border-borda">
          <summary className="cursor-pointer px-4 py-3 text-[14px] font-medium">Pedidos já decididos ({decididos.length})</summary>
          <div className="overflow-x-auto border-t border-borda">
            <table className="w-full min-w-[620px] text-left text-[13px]">
              <thead className="bg-superficie-2 text-[12px] text-texto-3">
                <tr>{["NP", "Nome", "Decisão", "Por", "Em", "Motivo da recusa"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {decididos.map((p) => (
                  <tr key={p.login}>
                    <td className="num px-3 py-2 font-mono">{p.login}</td>
                    <td className="px-3 py-2">{p.nome}</td>
                    <td className={clsx("px-3 py-2", p.status === "aprovada" ? "text-marca-600 dark:text-marca-300" : "text-perigo-500")}>{p.status}</td>
                    <td className="num px-3 py-2 text-texto-3">{p.decididoPor}</td>
                    <td className="num px-3 py-2 text-texto-3">{p.decididoEm}</td>
                    <td className="px-3 py-2 text-texto-3">{p.motivoRecusa || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function EditarUsuario({ pessoas, eu, abas }: { pessoas: Pessoa[]; eu: string; abas: Aba[] }) {
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="E-mail" name="email" type="email" defaultValue={d.email} autoComplete="off" inputMode="email"
            dica="Líderes com e-mail recebem toda semana o aviso de treinamentos vencendo. Vazio = sem e-mail." />
          <Campo rotulo="Redefinir senha (opcional)" name="nova_senha" type="password" autoComplete="new-password"
            dica="Só se a pessoa esqueceu a senha. Ela terá de trocar no próximo acesso." />
        </div>
        <EscolhaAbas abas={abas} marcadas={d.abas} escolher={escolher} setEscolher={setEscolher} />
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

export function GestaoUsuarios({ pessoas, eu, abas, pedidos }: { pessoas: Pessoa[]; eu: string; abas: Aba[]; pedidos: PedidoAcesso[] }) {
  const pendentes = pedidos.filter((p) => p.status === "pendente").length;
  const [aba, setAba] = useState<"pedidos" | "novo" | "editar">(pendentes ? "pedidos" : "novo");
  const ABAS = [
    { id: "pedidos" as const, titulo: "Solicitações", icone: Inbox, n: pendentes },
    { id: "novo" as const, titulo: "Novo usuário", icone: UserPlus, n: 0 },
    { id: "editar" as const, titulo: "Editar usuário", icone: UserRoundCog, n: 0 },
  ];
  return (
    <Cartao className="p-6">
      <nav className="mb-6 flex flex-wrap gap-1">
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)}
            className={clsx("inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] transition",
              aba === a.id ? "bg-superficie-3 font-medium text-texto" : "text-texto-3 hover:text-texto")}>
            <a.icone className="size-4" strokeWidth={1.75} />{a.titulo}
            {a.n > 0 && <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-alp-laranja px-1.5 text-[11.5px] font-semibold text-white">{a.n}</span>}
          </button>
        ))}
      </nav>
      {aba === "pedidos" ? <Solicitacoes pedidos={pedidos} abas={abas} />
        : aba === "novo" ? <NovoUsuario /> : <EditarUsuario pessoas={pessoas} eu={eu} abas={abas} />}
    </Cartao>
  );
}
