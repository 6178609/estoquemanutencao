import { Inatividade } from "@/components/Inatividade";
import { Shell, type ItemMenu } from "@/components/Shell";
import { ehAdmin, nomeFuncao, PAGINAS_PARCIAIS, PERFIS, podeVer, veInteira } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { pendentes } from "@/lib/auth/solicitacoes";
import { GRUPOS } from "@/lib/navegacao";
import { acaoSair, acaoSairPorInatividade } from "./acoes";
import { TrocaObrigatoria } from "./TrocaObrigatoria";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const u = await exigir();
  if (u.trocarSenha && !u.demo) return <><TrocaObrigatoria nome={u.nome || u.login} sair={acaoSair} /><Inatividade sair={acaoSairPorInatividade} /></>;
  const grupos = GRUPOS.map((g) => ({
    titulo: g.titulo,
    itens: g.abas
      .filter((a) => podeVer(u, a.id))
      .flatMap((a): ItemMenu[] => {
        if (a.rota) return [{ id: a.id, titulo: a.titulo, icone: a.icone, href: a.rota, externo: false }];
        const parcial = !veInteira(u, a.id) ? PAGINAS_PARCIAIS[a.id] : undefined;
        return [{ id: a.id, titulo: parcial ? `${a.titulo} (${parcial})` : a.titulo, icone: a.icone, href: "", externo: true, parcial }];
      }),
  })).filter((g) => g.itens.length);
  const admin = ehAdmin(u) && !u.demo;
  // pedidos de acesso aguardando: o administrador vê o número no menu
  const nPedidos = admin ? Object.keys(await pendentes().catch(() => ({}))).length : 0;
  grupos.push({ titulo: "Conta", itens: [
    { id: "conta", titulo: "Minha conta", icone: "UserRound", href: "/conta", externo: false },
    ...(admin ? [{ id: "usuarios", titulo: nPedidos ? `Usuários (${nPedidos} pedido${nPedidos > 1 ? "s" : ""})` : "Usuários",
      icone: "UsersRound", href: "/usuarios", externo: false }] : []),
  ] });
  return (
    <Shell grupos={grupos} sair={acaoSair}
      pessoa={{ nome: u.nome || u.login, funcao: nomeFuncao(u), perfil: PERFIS[u.perfil || ""] || "Leitor", demo: !!u.demo }}>
      {children}
      <Inatividade sair={acaoSairPorInatividade} />
    </Shell>
  );
}
