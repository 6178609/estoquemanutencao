import Link from "next/link";

import { Campo, Seletor } from "@/components/Campos";
import { BOTAO_SECUNDARIO } from "@/components/ui";
import { Aviso, Secao } from "@/components/PaginaWcm";
import { podeVer, type Usuario } from "@/lib/auth/acesso";
import { documentosTecnicos, todosDocumentosEquipamentos } from "@/lib/dados/documentos";
import { casaBusca, normalizarBusca } from "@/lib/dados/texto";
import { ACERVO, buscarAcervo, type ItemAcervo } from "@/lib/suporte/acervo";
import { AREAS, type Area } from "@/lib/suporte/guias";

import { EnviarDocumento } from "./EnviarDocumento";

const LIMITE_ACERVO = 60;
const TIPO_ROTULO: Record<ItemAcervo["tipo"], string> = {
  manual: "Manual", catalogo: "Catálogo", guia: "Guia", norma: "Norma", calculadora: "Calculadora", curso: "Curso", artigo: "Artigo",
};
const IDIOMA_ROTULO: Record<ItemAcervo["idioma"], string> = { pt: "Português", en: "Inglês", es: "Espanhol" };
const nomeArea = (id: Area) => AREAS.find((a) => a.id === id)?.titulo ?? id;
const AREAS_OPCOES = Object.fromEntries(AREAS.map((a) => [a.id, a.titulo]));
const LISTA = "divide-y divide-borda overflow-hidden rounded-cartao border border-borda bg-superficie";

export interface FiltrosBiblioteca { q: string; area?: Area; tipo?: ItemAcervo["tipo"]; idioma?: ItemAcervo["idioma"] }

/**
 * Biblioteca técnica: filtros, acervo de referência (links públicos), documentos enviados pela equipe e os
 * documentos dos equipamentos (leitura, com link para a ficha). Só editor ou administrador envia.
 */
export async function Biblioteca({ u, edita, filtros }: { u: Usuario; edita: boolean; filtros: FiltrosBiblioteca }) {
  const { q, area, tipo, idioma } = filtros;
  const acervo = buscarAcervo(q, { area, tipo, idioma });
  const docs = (await documentosTecnicos(area)).filter((d) => casaBusca(normalizarBusca(`${d.titulo} ${d.nome ?? ""}`), q));
  const verEquip = podeVer(u, "equipamentos");
  const docsEquip = verEquip
    ? (await todosDocumentosEquipamentos()).filter((x) => casaBusca(normalizarBusca(`${x.doc.titulo} ${x.tag}`), q))
    : [];

  return (
    <div className="space-y-10">
      <form method="get" action="/suporte" role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
        <input type="hidden" name="visao" value="biblioteca" />
        <Campo rotulo="Buscar na biblioteca" name="q" type="search" defaultValue={q} maxLength={120} placeholder="Ex.: SKF, NR-10, lubrificação" />
        <Seletor rotulo="Área" name="area" opcoes={AREAS_OPCOES} vazio="Todas as áreas" defaultValue={area ?? ""} />
        <Seletor rotulo="Tipo" name="tipo" opcoes={TIPO_ROTULO} vazio="Todos os tipos" defaultValue={tipo ?? ""} />
        <Seletor rotulo="Idioma" name="idioma" opcoes={IDIOMA_ROTULO} vazio="Todos os idiomas" defaultValue={idioma ?? ""} />
        <button type="submit" className={BOTAO_SECUNDARIO}>Filtrar</button>
      </form>

      <Secao titulo="Acervo" destaque="de referência" sub="Links públicos e gratuitos de fabricantes e órgãos oficiais. Abre o original no site de quem publica; nada é copiado para cá.">
        <p className="text-[13px] text-texto-3">{acervo.length} de {ACERVO.length} itens{acervo.length > LIMITE_ACERVO ? `. Mostrando os ${LIMITE_ACERVO} primeiros; refine a busca ou os filtros.` : ""}</p>
        {acervo.length === 0 ? (
          <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">Nenhum item do acervo para esta busca.</p>
        ) : (
          <ul className={LISTA}>
            {acervo.slice(0, LIMITE_ACERVO).map((it) => (
              <li key={it.url} className="space-y-1.5 px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-texto-3">
                  <span className="text-acao">{TIPO_ROTULO[it.tipo]}</span>
                  <span>· {nomeArea(it.area)}</span>
                  <span>· {IDIOMA_ROTULO[it.idioma]}</span>
                </div>
                <a href={it.url} target="_blank" rel="noopener noreferrer" className="block break-words font-medium text-texto hover:text-acao">
                  {it.titulo}
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
                <p className="text-[13px] text-texto-2"><span className="text-texto-3">{it.fonte}.</span> {it.descricao}</p>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Documentos" destaque="enviados" sub={area ? `Documentos de ${nomeArea(area)}.` : "Manuais, normas e tabelas que a equipe enviou."}>
        {docs.length === 0 ? (
          <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">
            Nenhum documento enviado{area ? ` em ${nomeArea(area)}` : ""} ainda.
          </p>
        ) : (
          <ul className={LISTA}>
            {docs.map((d) => {
              const href = d.tipo === "link" ? d.url! : `/api/suporte/documento?${new URLSearchParams({ area: d.area, id: d.id })}`;
              return (
                <li key={`${d.area}-${d.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-[13.5px]">
                  <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words font-medium text-texto hover:text-acao">
                    {d.titulo}<span className="sr-only"> (abre em nova aba)</span>
                  </a>
                  <span className="text-texto-3">{nomeArea(d.area)} · {d.tipo === "link" ? "Link" : d.tipo === "application/pdf" ? "PDF" : "Imagem"}</span>
                </li>
              );
            })}
          </ul>
        )}
        {edita ? (
          <EnviarDocumento areas={AREAS.map((a) => ({ id: a.id, titulo: a.titulo }))} areaInicial={area} />
        ) : (
          <Aviso tom="azul">Só editor ou administrador envia documentos para a biblioteca técnica.</Aviso>
        )}
      </Secao>

      {verEquip && (
        <Secao titulo="Documentos" destaque="dos equipamentos" sub="Manuais e documentos guardados na ficha de cada equipamento (Gestão de ativos).">
          {docsEquip.length === 0 ? (
            <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">Nenhum documento de equipamento{q ? " para esta busca" : ""}.</p>
          ) : (
            <ul className={LISTA}>
              {docsEquip.slice(0, LIMITE_ACERVO).map((x) => (
                <li key={`${x.tag}-${x.doc.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-[13.5px]">
                  <span className="min-w-0 break-words font-medium text-texto">{x.doc.titulo}</span>
                  <Link prefetch={false} href={`/equipamentos/biblioteca?eq=${encodeURIComponent(x.tag)}`} className="num font-mono text-acao hover:text-[var(--acao-forte)]">
                    {x.tag}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      )}
    </div>
  );
}
