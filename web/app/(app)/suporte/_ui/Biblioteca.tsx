import Link from "next/link";

import { Campo, Seletor } from "@/components/Campos";
import { Aviso, Secao } from "@/components/PaginaWcm";
import { BOTAO_SECUNDARIO } from "@/components/ui";
import { podeVer, type Usuario } from "@/lib/auth/acesso";
import { documentosTecnicos, todosDocumentosEquipamentos } from "@/lib/dados/documentos";
import { casaBusca, normalizarBusca } from "@/lib/dados/texto";
import { ACERVO, buscarAcervo, type ItemAcervo } from "@/lib/suporte/acervo";
import { AREAS, type Area } from "@/lib/suporte/guias";

import { EnviarDocumento } from "./EnviarDocumento";
import { RemoverDocumento } from "./RemoverDocumento";

const LIMITE_ACERVO = 20;
const TIPO_ROTULO: Record<ItemAcervo["tipo"], string> = {
  manual: "Manual", catalogo: "Catálogo", guia: "Guia", norma: "Norma", calculadora: "Calculadora", curso: "Curso", artigo: "Artigo",
};
const nomeArea = (id: Area) => AREAS.find((a) => a.id === id)?.titulo ?? id;
const AREAS_OPCOES = Object.fromEntries(AREAS.map((a) => [a.id, a.titulo]));
const LISTA = "divide-y divide-borda overflow-hidden rounded-cartao border border-borda bg-superficie";

interface FiltrosBiblioteca { q: string; area?: Area; tipo?: ItemAcervo["tipo"]; mais: boolean }

/** Endereço da biblioteca com os filtros atuais e, se `mais`, a lista do acervo inteira. */
function hrefBiblioteca(f: FiltrosBiblioteca, mais: boolean): string {
  const p = new URLSearchParams({ visao: "biblioteca" });
  if (f.q) p.set("q", f.q);
  if (f.area) p.set("area", f.area);
  if (f.tipo) p.set("tipo", f.tipo);
  if (mais) p.set("mais", "1");
  return `/suporte?${p.toString()}`;
}

/**
 * Biblioteca técnica: filtros, envio (só editor ou administrador, logo abaixo dos filtros), acervo de referência
 * (links públicos; 20 primeiros, "Ver mais" para o resto), documentos enviados (com Remover para quem edita) e os
 * documentos dos equipamentos (leitura, com link para a ficha).
 */
export async function Biblioteca({ u, edita, filtros }: { u: Usuario; edita: boolean; filtros: FiltrosBiblioteca }) {
  const { q, area, tipo, mais } = filtros;
  const acervo = buscarAcervo(q, { area, tipo });
  const mostrar = mais ? acervo : acervo.slice(0, LIMITE_ACERVO);
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
        <button type="submit" className={BOTAO_SECUNDARIO}>Filtrar</button>
      </form>

      {edita ? (
        <Secao titulo="Enviar" destaque="documento" sub="Manual, norma ou tabela da empresa. Vai para a biblioteca técnica, na área escolhida.">
          <EnviarDocumento areas={AREAS.map((a) => ({ id: a.id, titulo: a.titulo }))} areaInicial={area} />
        </Secao>
      ) : (
        <Aviso tom="azul">Só editor ou administrador envia documentos para a biblioteca técnica.</Aviso>
      )}

      <Secao titulo="Acervo" destaque="de referência" sub="Links públicos e gratuitos de fabricantes e órgãos oficiais. Abre o original no site de quem publica; nada é copiado para cá.">
        <p className="text-[13px] text-texto-3">{acervo.length} de {ACERVO.length} itens</p>
        {acervo.length === 0 ? (
          <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">Nenhum item do acervo para esta busca.</p>
        ) : (
          <ul className={LISTA}>
            {mostrar.map((it) => (
              <li key={it.url} className="space-y-1.5 px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-texto-3">
                  <span className="text-acao">{TIPO_ROTULO[it.tipo]}</span>
                  <span>· {nomeArea(it.area)}</span>
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
        {!mais && acervo.length > LIMITE_ACERVO && (
          <Link prefetch={false} href={hrefBiblioteca(filtros, true)} className="inline-flex min-h-11 items-center text-[13.5px] font-semibold text-acao hover:text-[var(--acao-forte)]">
            Ver mais ({acervo.length - LIMITE_ACERVO} itens)
          </Link>
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
                <li key={`${d.area}-${d.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[13.5px]">
                  <div className="min-w-0 flex-1">
                    <a href={href} target="_blank" rel="noopener noreferrer" className="break-words font-medium text-texto hover:text-acao">
                      {d.titulo}<span className="sr-only"> (abre em nova aba)</span>
                    </a>
                    <div className="text-[12.5px] text-texto-3">{nomeArea(d.area)} · {d.tipo === "link" ? "Link" : d.tipo === "application/pdf" ? "PDF" : "Imagem"}</div>
                  </div>
                  {edita && <RemoverDocumento area={d.area} id={d.id} titulo={d.titulo} />}
                </li>
              );
            })}
          </ul>
        )}
      </Secao>

      {verEquip && (
        <Secao titulo="Documentos" destaque="dos equipamentos" sub="Manuais e documentos guardados na ficha de cada equipamento (Gestão de ativos).">
          {docsEquip.length === 0 ? (
            <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">Nenhum documento de equipamento{q ? " para esta busca" : ""}.</p>
          ) : (
            <ul className={LISTA}>
              {docsEquip.slice(0, 60).map((x) => (
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
