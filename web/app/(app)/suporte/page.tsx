import type { Metadata } from "next";
import Link from "next/link";

import { Cabecalho, Pagina } from "@/components/ui";
import { podeEditar } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { AREAS, type Area } from "@/lib/suporte/guias";
import type { ItemAcervo } from "@/lib/suporte/acervo";

import { Biblioteca } from "./_ui/Biblioteca";
import { Diagnostico } from "./_ui/Diagnostico";
import { Guias } from "./_ui/Guias";
import { hrefSuporte, pilula, type Params, um } from "./_ui/url";

export const metadata: Metadata = { title: "Suporte Técnico" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VISOES = [
  { id: "guias", titulo: "Guias" },
  { id: "diagnostico", titulo: "Diagnóstico" },
  { id: "biblioteca", titulo: "Biblioteca" },
] as const;
const TIPOS = ["manual", "catalogo", "guia", "norma", "calculadora", "curso", "artigo"] as const;
const IDIOMAS = ["pt", "en", "es"] as const;

/**
 * Suporte Técnico: guias de manutenção com busca, diagnóstico guiado (tipo → sintoma → causas) e a biblioteca
 * (acervo de links públicos e documentos enviados). Endereço: ?visao=guias|diagnostico|biblioteca e os parâmetros da visão.
 */
export default async function Suporte(props: { searchParams: Promise<Params> }) {
  const u = await exigir("suporte");
  const params = await props.searchParams;
  const visao = VISOES.some((v) => v.id === um(params, "visao")) ? um(params, "visao") : "guias";
  const q = um(params, "q").slice(0, 120);
  const area = AREAS.find((a) => a.id === um(params, "area"))?.id as Area | undefined;

  return (
    <Pagina>
      <Cabecalho titulo="Suporte" destaque="técnico." sobre="Apoio à manutenção"
        subtitulo="Guias de manutenção, diagnóstico guiado por tipo de equipamento e sintoma, e a biblioteca de manuais e normas." />

      <nav aria-label="Visões do suporte" className="flex flex-wrap gap-2">
        {VISOES.map((v) => (
          <Link prefetch={false} key={v.id} href={hrefSuporte(v.id)} aria-current={visao === v.id ? "page" : undefined} className={pilula(visao === v.id)}>
            {v.titulo}
          </Link>
        ))}
      </nav>

      {visao === "guias" && <Guias q={q} area={area} guia={um(params, "guia") || undefined} />}
      {visao === "diagnostico" && <Diagnostico params={params} u={u} />}
      {visao === "biblioteca" && (
        <Biblioteca u={u} edita={podeEditar(u)} filtros={{
          q,
          area,
          tipo: TIPOS.find((t) => t === um(params, "tipo")) as ItemAcervo["tipo"] | undefined,
          idioma: IDIOMAS.find((i) => i === um(params, "idioma")) as ItemAcervo["idioma"] | undefined,
          mais: um(params, "mais") === "1",
        }} />
      )}
    </Pagina>
  );
}
