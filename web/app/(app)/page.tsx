import { AlertTriangle, ArrowRight, ArrowUpRight, BookOpen, Boxes, CircleSlash, Database, PackageX, Wallet } from "lucide-react";
import Link from "next/link";

import { Icone } from "@/components/Icone";
import { Cabecalho, Cartao, Kpi, Pagina, Selo } from "@/components/ui";
import { nomeFuncao, podeVer } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { almoxarifado } from "@/lib/dados/bases";
import { modo } from "@/lib/dados/fonte";
import { brlCurto, dataHora, idade, inteiro, saudacao } from "@/lib/formato";
import { GRUPOS, urlSiteAtual } from "@/lib/navegacao";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const u = await exigir();
  const verEstoque = podeVer(u, "estoque");
  const almox = verEstoque ? await almoxarifado() : null;
  const itens = almox?.itens || [];
  const zerados = itens.filter((i) => i.situacao === "Zerado").length;
  const abaixo = itens.filter((i) => i.situacao === "Abaixo do mínimo").length;
  const valor = itens.reduce((s, i) => s + (i.valor || 0), 0);
  const revisar = itens.filter((i) => ["Bloqueado", "Cancelado", "Duplicado"].includes(i.cadastro)).length;
  const semCadastro = itens.filter((i) => i.cadastro === "Não encontrado no Sysmat").length;
  const criticos = itens.filter((i) => i.situacao !== "OK" && i.usadoEm.includes("(Alta)"));
  const abas = GRUPOS.flatMap((g) => g.abas.map((a) => ({ ...a, grupo: g.titulo }))).filter((a) => podeVer(u, a.id));
  const migradas = abas.filter((a) => a.rota);
  const primeiroNome = (u.nome || u.login).split(" ")[0];
  const data = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const hoje = data.charAt(0).toUpperCase() + data.slice(1);

  return (
    <Pagina>
      <section className="relative overflow-hidden rounded-[1.75rem] bg-[#06281a] px-6 py-8 text-white shadow-flutuante sm:px-10 sm:py-10">
        <div aria-hidden className="absolute inset-0" style={{ background: "radial-gradient(55% 80% at 0% 0%, #0e9f46 0%, transparent 60%), radial-gradient(45% 70% at 100% 100%, #0a6ebd 0%, transparent 65%)" }} />
        <div aria-hidden className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-white/70">{hoje}</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{saudacao()}, {primeiroNome}.</h1>
            <p className="mt-2 max-w-xl text-white/75">{nomeFuncao(u)} · você tem acesso a {abas.length} aba(s) da Central de Manutenção.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {verEstoque && (
              <Link href="/estoque" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-display text-sm font-semibold text-[#06281a] shadow-cartao transition hover:bg-marca-50">
                <Boxes className="size-4" /> Abrir o estoque
              </Link>
            )}
            {verEstoque && (
              <Link href="/estoque?aba=cadastrado" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 font-display text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20">
                <BookOpen className="size-4" /> Material cadastrado
              </Link>
            )}
          </div>
        </div>
      </section>

      {verEstoque && almox && (
        <>
          <Cabecalho sobre="Custos e suprimentos" titulo="Almoxarifado agora"
            subtitulo={almox.estoque.dados ? `MB52 de ${dataHora(almox.estoque.atualizado)} (${idade(almox.estoque.atualizado)})` : "Sem o export do MB52 no repositório de dados."} />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi rotulo="Materiais no almoxarifado" valor={inteiro(itens.length)} icone={Boxes} detalhe={`${inteiro(itens.length - semCadastro)} com cadastro no Sysmat`} />
            <Kpi rotulo="Zerados" valor={inteiro(zerados)} icone={PackageX} tom={zerados ? "perigo" : "marca"} detalhe={`${inteiro(abaixo)} abaixo do mínimo`} />
            <Kpi rotulo="Cadastro a revisar" valor={inteiro(revisar)} icone={CircleSlash} tom={revisar ? "alerta" : "marca"} detalhe={`bloqueado, cancelado ou duplicado · ${inteiro(semCadastro)} sem cadastro`} />
            <Kpi rotulo="Valor em estoque" valor={valor ? brlCurto(valor) : "—"} icone={Wallet} tom="acao" detalhe={valor ? "valor de utilização livre" : "o export não traz valor"} />
          </div>
          {criticos.length > 0 && (
            <Cartao className="border-perigo-500/30 p-5">
              <div className="flex items-center gap-2 font-display font-semibold text-perigo-500"><AlertTriangle className="size-5" /> {criticos.length} peça(s) de equipamento crítico sem estoque suficiente</div>
              <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
                {criticos.slice(0, 8).map((c) => <li key={c.material}><span className="num font-mono font-semibold">{c.material}</span> {c.descricao} → <span className="text-texto-2">{c.usadoEm}</span></li>)}
              </ul>
            </Cartao>
          )}
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Cartao className="p-6">
          <h2 className="font-display text-lg font-bold">Suas abas</h2>
          <p className="text-sm text-texto-2">As marcadas como <Selo cor="verde">novo</Selo> já estão no site novo; as demais abrem no site atual enquanto a migração avança.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {abas.map((a) => {
              const conteudo = (
                <>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-superficie-2 text-marca-700 transition group-hover:bg-marca-600 group-hover:text-white dark:text-marca-300">
                    <Icone nome={a.icone} className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{a.titulo}</span>
                    <span className="block truncate text-xs text-texto-3">{a.grupo}</span>
                  </span>
                  {a.rota ? <ArrowRight className="size-4 text-texto-3 transition group-hover:translate-x-0.5" /> : <ArrowUpRight className="size-4 text-texto-3" />}
                </>
              );
              const cls = "group flex items-center gap-3 rounded-2xl border border-borda p-3 transition hover:border-marca-300 hover:bg-superficie-2";
              if (a.rota) return <Link key={a.id} href={a.rota} className={cls}>{conteudo}</Link>;
              const url = urlSiteAtual(a.id);
              return url ? <a key={a.id} href={url} className={cls}>{conteudo}</a>
                : <div key={a.id} className={cls + " cursor-default opacity-60"} title="Em breve no site novo">{conteudo}</div>;
            })}
          </div>
        </Cartao>
        <Cartao className="p-6">
          <h2 className="font-display text-lg font-bold">Migração para o site novo</h2>
          <p className="mt-1 text-sm text-texto-2">{migradas.length} de {abas.length} das suas abas já estão aqui.</p>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-superficie-2">
            <div className="h-full rounded-full bg-gradient-to-r from-marca-500 to-acao-500" style={{ width: `${abas.length ? Math.max(4, (migradas.length / abas.length) * 100) : 0}%` }} />
          </div>
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-superficie-2 p-4 text-sm">
            <Database className="mt-0.5 size-4 shrink-0 text-texto-3" />
            <div>
              <div className="font-semibold">Fonte de dados</div>
              <div className="text-texto-2">{modo() === "demo" ? "Demonstração (dados fictícios)" : modo() === "github" ? "Repositório privado de dados — o mesmo do site atual" : "Pasta local"}</div>
            </div>
          </div>
        </Cartao>
      </div>
    </Pagina>
  );
}
