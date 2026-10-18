import { AlertTriangle, Inbox, PartyPopper } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Cabecalho, Pagina, Selo } from "@/components/ui";
import { ehAdmin, FUNCOES, PAGINAS_LIVRES, PERFIS, podeVer, veInteira } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { solicitacoes } from "@/lib/auth/solicitacoes";
import { adminsAtivos, usuarios } from "@/lib/auth/usuarios";
import { equipe } from "@/lib/wcm/dados";
import { GRUPOS, TODAS } from "@/lib/navegacao";
import { validarLogin } from "@/lib/auth/senha";
import { GestaoUsuarios, type PedidoAcesso, type Pessoa } from "./GestaoUsuarios";

export const metadata: Metadata = { title: "Usuários" };
export const dynamic = "force-dynamic";

function descrever(u: Pessoa): string {
  if (Array.isArray(u.abas)) return `${u.abas.filter((a) => TODAS.includes(String(a))).length + 1} aba(s) escolhida(s)`;
  if (u.funcao === "terceiro") return "Só Estoque";
  if (u.funcao === "manutentor") return "Estoque + Gestão de ativos";
  if (u.funcao && u.funcao in FUNCOES) return "Todas";
  return u.perfil === "admin" ? "Todas" : "Estoque + Gestão de ativos";
}

export default async function Usuarios(props: { searchParams: Promise<{ primeiro?: string }> }) {
  const eu = await exigir();
  if (!ehAdmin(eu) || eu.demo) redirect("/");
  const primeiro = (await props.searchParams).primeiro === "1";
  const us = await usuarios();
  const admins = adminsAtivos(us);
  const quando = (s?: string) => {
    if (!s) return "";
    const d = new Date(s);
    return isNaN(+d) ? s.slice(0, 16).replace("T", " ")
      : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(d);
  };
  // para o navegador vai só o que a tela mostra — nunca o hash da senha nem as sessões
  const pessoas: Pessoa[] = Object.entries(us).sort(([a], [b]) => a.localeCompare(b)).map(([login, v]) => ({
    login, nome: v.nome || "", funcao: v.funcao || "", perfil: v.perfil || "leitor", ativo: v.ativo !== false,
    abas: Array.isArray(v.abas) ? (v.abas as unknown[]).map(String) : null, trocarSenha: !!v.trocar_senha,
    ultimoAcesso: quando(v.ultimo_acesso),
    unicoAdmin: admins.includes(login) && admins.length === 1,
  }));
  // pedidos de acesso: sem a senha (hash) — só o que o administrador precisa para decidir
  const [peds, lista] = await Promise.all([solicitacoes(), equipe().catch(() => null)]);
  const naEquipe = new Map((lista || []).map((p) => [p.np.replace(/^0+/, ""), [p.cargo, p.area].filter(Boolean).join(" · ") || "sem cargo"]));
  const pedidos: PedidoAcesso[] = Object.entries(peds).map(([login, p]) => ({
    login, nome: p.nome || "", funcao: p.funcao || "", motivo: p.motivo || "", criadoEm: quando(p.criado_em),
    equipe: lista && lista.length ? naEquipe.get(login.replace(/^0+/, "")) ?? null : undefined,
    status: p.status || "pendente", decididoPor: p.decidido_por || "", decididoEm: quando(p.decidido_em), motivoRecusa: p.motivo_recusa || "",
  })).sort((a, b) => a.login.localeCompare(b.login));
  const semFuncao = pessoas.filter((p) => !(p.funcao in FUNCOES) && p.ativo).map((p) => p.login);
  const foraNp = pessoas.filter((p) => validarLogin(p.login)).map((p) => p.login);
  const abas = GRUPOS.flatMap((g) => g.abas.filter((a) => !PAGINAS_LIVRES.has(a.id)).map((a) => ({ id: a.id, titulo: `${g.titulo} › ${a.titulo}` })));
  const matriz = GRUPOS.flatMap((g) => g.abas.map((a) => ({
    aba: `${g.titulo} › ${a.titulo}`,
    funcoes: Object.keys(FUNCOES).map((f) => {
      const u = { login: "x", funcao: f };
      return veInteira(u, a.id) ? "✓" : podeVer(u, a.id) ? "parcial" : "—";
    }),
  })));

  return (
    <Pagina>
      <Cabecalho titulo="Usuários," destaque="quem acessa e o que cada um pode fazer."
        subtitulo="Função define as abas; perfil define o que a pessoa pode alterar." />
      {pedidos.some((p) => p.status === "pendente") && (
        <div className="flex gap-3 rounded-cartao border border-alp-laranja/40 bg-alp-laranja/10 px-4 py-3 text-[14px] text-texto-2">
          <Inbox className="mt-0.5 size-4 shrink-0 text-alp-laranja" />
          <span><b>{pedidos.filter((p) => p.status === "pendente").length} pedido(s) de acesso aguardando</b> — veja em <b>Solicitações</b>, logo abaixo da lista.</span>
        </div>
      )}
      {primeiro && (
        <div className="flex gap-3 rounded-cartao border border-marca-500/30 bg-marca-500/10 px-4 py-3 text-[14px] text-texto-2">
          <PartyPopper className="mt-0.5 size-4 shrink-0 text-marca-600" />
          <span><b>Administrador criado.</b> Agora cadastre a equipe em <b>Novo usuário</b>: cada pessoa recebe uma senha
            provisória e troca no primeiro acesso.</span>
        </div>
      )}
      {(semFuncao.length > 0 || foraNp.length > 0) && (
        <div className="flex gap-3 rounded-cartao border border-borda bg-superficie-2 px-4 py-3 text-[13.5px] text-texto-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alp-laranja" />
          <div className="space-y-1">
            {semFuncao.length > 0 && <p><b>{semFuncao.length} usuário(s) sem função</b>: {semFuncao.join(", ")} — defina em Editar usuário.</p>}
            {foraNp.length > 0 && <p><b>{foraNp.length} usuário(s) não usam o NP</b> como login: {foraNp.join(", ")} — troque em Editar usuário (a senha continua a mesma).</p>}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
        <table className="w-full min-w-[760px] text-left text-[13.5px]">
          <thead className="border-b border-borda bg-superficie-2 text-[12px] text-texto-3">
            <tr>{["NP", "Nome", "Função", "Perfil", "Abas", "Situação", "Último acesso"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-borda divide-y">
            {pessoas.map((p) => (
              <tr key={p.login}>
                <td className="num px-4 py-2.5 font-mono">{p.login}</td>
                <td className="px-4 py-2.5">{p.nome}</td>
                <td className="px-4 py-2.5">{FUNCOES[p.funcao] || <Selo cor="laranja">a definir</Selo>}</td>
                <td className="px-4 py-2.5">{PERFIS[p.perfil] || p.perfil}</td>
                <td className="px-4 py-2.5 text-texto-3">{descrever(p)}</td>
                <td className="px-4 py-2.5">
                  {p.ativo ? <Selo cor="verde">ativo</Selo> : <Selo>desativado</Selo>}
                  {p.trocarSenha && <Selo cor="amarelo" className="ml-1">senha provisória</Selo>}
                </td>
                <td className="num px-4 py-2.5 text-texto-3">{p.ultimoAcesso || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <GestaoUsuarios pessoas={pessoas} eu={eu.login} abas={abas} pedidos={pedidos} />

      <details className="rounded-cartao border border-borda bg-superficie">
        <summary className="cursor-pointer px-5 py-3.5 font-display text-[15px] font-medium">Quem vê cada aba</summary>
        <div className="overflow-x-auto border-t border-borda">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className="bg-superficie-2 text-[12px] text-texto-3">
              <tr><th className="px-4 py-2 font-medium">Aba</th>{Object.values(FUNCOES).map((f) => <th key={f} className="px-4 py-2 font-medium">{f}</th>)}</tr>
            </thead>
            <tbody className="divide-borda divide-y">
              {matriz.map((m) => (
                <tr key={m.aba}><td className="px-4 py-2">{m.aba}</td>{m.funcoes.map((v, i) => <td key={i} className="px-4 py-2 text-texto-2">{v}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-borda px-5 py-3 text-[12.5px] text-texto-3">“Parcial” = só a Gestão de ativos, em Equipamentos. Minha conta aparece para todos; Usuários, só para administradores.</p>
      </details>
    </Pagina>
  );
}
