import clsx from "clsx";
import { AlertTriangle, BookOpen, Boxes } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Cabecalho, Pagina } from "@/components/ui";
import { podeEditar } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { almoxarifado } from "@/lib/dados/bases";
import { resumoCatalogo } from "@/lib/dados/catalogoBusca";
import { dataHora, idade } from "@/lib/formato";
import { Almoxarifado } from "./Almoxarifado";
import { Catalogo } from "./Catalogo";

export const metadata: Metadata = { title: "Estoque" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-alerta-500/30 bg-alerta-500/10 px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alerta-500" /><div>{children}</div>
    </div>
  );
}

export default async function Estoque(props: { searchParams: Promise<{ aba?: string }> }) {
  const u = await exigir("estoque");
  const aba = (await props.searchParams).aba === "cadastrado" ? "cadastrado" : "almox";
  const abas = [
    { id: "almox", titulo: "Material do almoxarifado", icone: Boxes, href: "/estoque" },
    { id: "cadastrado", titulo: "Material cadastrado", icone: BookOpen, href: "/estoque?aba=cadastrado" },
  ];
  const almox = aba === "almox" ? await almoxarifado() : null;
  const resumo = aba === "cadastrado" ? await resumoCatalogo() : null;
  const base = almox?.estoque;

  return (
    <Pagina>
      <Cabecalho sobre="Custos e suprimentos" titulo="Estoque de manutenção"
        subtitulo="O almoxarifado (MB52) com a ficha técnica de cada item e o catálogo inteiro de materiais cadastrados no Sysmat."
        acoes={base?.atualizado ? <span className="rounded-full border border-borda bg-superficie px-3 py-1.5 text-xs font-medium text-texto-2">MB52 de {dataHora(base.atualizado)} · {idade(base.atualizado)}</span> : undefined} />
      <nav className="flex gap-1 overflow-x-auto border-b border-borda">
        {abas.map((a) => (
          <Link key={a.id} href={a.href} scroll={false}
            className={clsx("-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition",
              aba === a.id ? "border-marca-600 text-marca-700 dark:text-marca-300" : "border-transparent text-texto-3 hover:text-texto")}>
            <a.icone className="size-4" />{a.titulo}
          </Link>
        ))}
      </nav>
      {aba === "almox" && almox && (
        <>
          {!almox.estoque.dados && <Aviso>O export do <b>MB52</b> ainda não está no repositório de dados{almox.estoque.erro ? ` (${almox.estoque.erro})` : ""}.</Aviso>}
          {almox.estoque.dados && !almox.catalogo.dados && (
            <Aviso>O <b>catálogo de materiais (Sysmat)</b> não está carregado, por isso a Descr Completa aparece vazia. Envie a extração em
              <b> Configuração › Fontes de dados</b> no site atual (ou deixe o sincronizador do PC enviar).</Aviso>
          )}
          <Almoxarifado itens={almox.itens} edita={podeEditar(u)} />
        </>
      )}
      {aba === "cadastrado" && (resumo ? <Catalogo resumo={resumo} /> : (
        <Aviso>O <b>catálogo de materiais (Sysmat)</b> ainda não está no repositório de dados. Envie a extração em <b>Configuração › Fontes de dados</b> no site atual.</Aviso>
      ))}
    </Pagina>
  );
}
