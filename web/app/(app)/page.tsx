import { AlertTriangle, ArrowRight, ChevronRight, Database } from "lucide-react";
import Link from "next/link";

import { Icone } from "@/components/Icone";
import { Objeto } from "@/components/Objeto";
import { BOTAO_PRIMARIO, Cartao, FaixaNumeros, Pilula, Selo, Titulo } from "@/components/ui";
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
  const criticos = itens.filter((i) => i.situacao !== "OK" && i.usadoEm.includes("(Alta)"));
  const abas = GRUPOS.flatMap((g) => g.abas.map((a) => ({ ...a, grupo: g.titulo }))).filter((a) => podeVer(u, a.id));
  const migradas = abas.filter((a) => a.rota);
  const primeiroNome = (u.nome || u.login).split(" ")[0];
  const data = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const hoje = data.charAt(0).toUpperCase() + data.slice(1);
  const pct = abas.length ? Math.round((migradas.length / abas.length) * 100) : 0;

  return (
    <>
      <section className="relative overflow-hidden border-b border-borda">
        <div aria-hidden className="pontos absolute inset-0" />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-8 px-4 py-12 sm:px-8 lg:grid-cols-[1fr_340px] lg:py-16">
          <div className="space-y-6">
            <Pilula>{hoje}</Pilula>
            <Titulo titulo={`${saudacao()}, ${primeiroNome}.`} destaque="Aqui está a manutenção agora." />
            <p className="max-w-xl text-[15.5px] leading-relaxed text-texto-3">
              {nomeFuncao(u)} · você tem acesso a {abas.length} aba(s) da Central de Manutenção.
              {verEstoque && almox?.estoque.atualizado && <> O estoque é do MB52 de {dataHora(almox.estoque.atualizado)}.</>}
            </p>
            {verEstoque && (
              <div className="flex flex-wrap items-center gap-5">
                <Link href="/estoque" className={BOTAO_PRIMARIO}>Abrir o estoque <ArrowRight className="size-4" /></Link>
                <Link href="/estoque?aba=cadastrado" className="inline-flex items-center gap-1 text-[15px] text-texto-3 transition hover:text-texto">
                  Material cadastrado <ChevronRight className="size-4" />
                </Link>
              </div>
            )}
          </div>
          <div className="hidden justify-center lg:flex"><Objeto tamanho={340} /></div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1240px] space-y-14 px-4 py-12 sm:px-8">
        {verEstoque && almox && (
          <section className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Titulo nivel={2} titulo="Almoxarifado" destaque="agora." />
              {almox.estoque.atualizado && <Pilula href="/estoque">MB52 {idade(almox.estoque.atualizado)}</Pilula>}
            </div>
            <FaixaNumeros itens={[
              { valor: inteiro(itens.length), rotulo: "materiais no almoxarifado" },
              { valor: inteiro(zerados), rotulo: `zerados · ${inteiro(abaixo)} abaixo do mínimo`, tom: zerados ? "vermelho" : "verde" },
              { valor: inteiro(revisar), rotulo: "cadastros a revisar no Sysmat", tom: revisar ? "laranja" : "verde" },
              { valor: valor ? brlCurto(valor) : "—", rotulo: "valor em estoque", tom: "azul" },
            ]} />
            {criticos.length > 0 && (
              <Cartao className="p-5">
                <div className="flex items-center gap-2 font-display font-medium text-alp-vermelho">
                  <AlertTriangle className="size-[18px]" strokeWidth={1.75} />
                  {criticos.length} peça(s) de equipamento crítico sem estoque suficiente
                </div>
                <ul className="mt-3 grid gap-1.5 text-[13.5px] text-texto-2 sm:grid-cols-2">
                  {criticos.slice(0, 8).map((c) => (
                    <li key={c.material}><span className="num font-mono font-medium text-texto">{c.material}</span> {c.descricao} → {c.usadoEm}</li>
                  ))}
                </ul>
              </Cartao>
            )}
          </section>
        )}

        <section className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <Titulo nivel={2} titulo="Suas abas," destaque="num lugar só." />
            <span className="text-[13px] text-texto-3"><Selo cor="verde">● no site novo</Selo> as demais abrem no site atual</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {abas.map((a) => {
              const conteudo = (
                <>
                  <span className="grid size-12 place-items-center rounded-[12px] border border-borda bg-superficie transition group-hover:border-borda-forte">
                    <Icone nome={a.icone} className="size-5 text-texto-2" strokeWidth={1.75} />
                  </span>
                  <span className="mt-3 block text-center text-[13px] leading-snug text-texto-2 group-hover:text-texto">
                    {a.titulo}{a.rota && <span className="ml-1 inline-block size-1.5 -translate-y-0.5 rounded-full bg-marca-500" />}
                  </span>
                </>
              );
              const cls = "group flex flex-col items-center rounded-cartao px-2 py-4 transition hover:bg-superficie-2";
              if (a.rota) return <Link key={a.id} href={a.rota} className={cls}>{conteudo}</Link>;
              const url = urlSiteAtual(a.id);
              return url ? <a key={a.id} href={url} className={cls}>{conteudo}</a>
                : <div key={a.id} className={cls + " cursor-default opacity-50"} title="Em breve no site novo">{conteudo}</div>;
            })}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-cartao border border-borda bg-superficie-2 p-6">
            <div className="font-display text-[15px] font-medium">Migração para o site novo</div>
            <p className="mt-1 text-[13.5px] text-texto-3">{migradas.length} de {abas.length} das suas abas já estão aqui ({pct}%).</p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-superficie-3">
              <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 3)}%`,
                background: "linear-gradient(90deg, #e41824, #f07818, #fcb40c, #a8c024, #009c48, #009cd8, #006cb4)" }} />
            </div>
          </div>
          <div className="flex items-start gap-4 rounded-cartao border border-borda bg-superficie-2 p-6">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-borda bg-superficie text-alp-azul">
              <Database className="size-[17px]" strokeWidth={1.75} />
            </span>
            <div>
              <div className="font-display text-[15px] font-medium">Fonte de dados</div>
              <p className="mt-1 text-[13.5px] text-texto-3">
                {modo() === "demo" ? "Demonstração (dados fictícios). Para os dados reais, preencha DADOS_GH_REPO e DADOS_GH_TOKEN nas variáveis do projeto na Vercel."
                  : modo() === "github" ? "Repositório privado de dados — o mesmo do site atual e do sincronizador." : "Pasta local."}
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
