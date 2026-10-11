import { Shell, type ItemMenu } from "@/components/Shell";
import { nomeFuncao, PAGINAS_PARCIAIS, PERFIS, podeVer, veInteira } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { GRUPOS, urlSiteAtual } from "@/lib/navegacao";
import { acaoSair } from "./acoes";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const u = await exigir();
  const grupos = GRUPOS.map((g) => ({
    titulo: g.titulo,
    itens: g.abas
      .filter((a) => podeVer(u, a.id))
      .flatMap((a): ItemMenu[] => {
        if (a.rota) return [{ id: a.id, titulo: a.titulo, icone: a.icone, href: a.rota, externo: false }];
        const url = urlSiteAtual(a.id) || ""; // sem o endereço do site atual: aparece como "em breve"
        const parcial = !veInteira(u, a.id) ? PAGINAS_PARCIAIS[a.id] : undefined;
        return [{ id: a.id, titulo: parcial ? `${a.titulo} (${parcial})` : a.titulo, icone: a.icone, href: url, externo: true, parcial }];
      }),
  })).filter((g) => g.itens.length);
  return (
    <Shell grupos={grupos} sair={acaoSair}
      pessoa={{ nome: u.nome || u.login, funcao: nomeFuncao(u), perfil: PERFIS[u.perfil || ""] || "Leitor", demo: !!u.demo }}>
      {children}
    </Shell>
  );
}
