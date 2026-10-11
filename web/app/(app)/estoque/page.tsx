import clsx from "clsx";
import { AlertTriangle, BookOpen, Boxes } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Cabecalho, Pagina, Pilula } from "@/components/ui";
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
    <div className="flex gap-3 rounded-cartao border border-borda bg-superficie-2 px-4 py-3 text-[13.5px] text-texto-2">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-alp-laranja" strokeWidth={1.75} /><div>{children}</div>
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
      <Cabecalho titulo="Estoque de manutenção," destaque="com a ficha técnica de cada item."
        sobre={<Pilula>{base?.atualizado ? `MB52 de ${dataHora(base.atualizado)} · ${idade(base.atualizado)}` : "Custos e suprimentos"}</Pilula>}
        subtitulo="O almoxarifado (MB52) com a Descr Completa do Sysmat e o catálogo inteiro de materiais cadastrados — tudo numa rolagem só, sem limite." />
      <nav className="flex flex-wrap gap-1">
        {abas.map((a) => (
          <Link key={a.id} href={a.href} scroll={false}
            className={clsx("inline-flex items-center gap-2 rounded-full px-4 py-2 text-[14px] transition",
              aba === a.id ? "bg-superficie-3 font-medium text-texto" : "text-texto-3 hover:text-texto")}>
            <a.icone className="size-4" strokeWidth={1.75} />{a.titulo}
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
