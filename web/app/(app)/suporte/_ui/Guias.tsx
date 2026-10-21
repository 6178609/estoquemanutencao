import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Campo } from "@/components/Campos";
import { Aviso, Secao } from "@/components/PaginaWcm";
import { BOTAO_SECUNDARIO, Pilula } from "@/components/ui";
import { AREAS, GUIAS, buscarGuias, guiaPorId, type Area, type Guia } from "@/lib/suporte/guias";

import { hrefSuporte, pilula } from "./url";

const nomeArea = (id: Area) => AREAS.find((a) => a.id === id)?.titulo ?? id;

/** Lista de guias: busca, chips de área e cartões. Com `guia`, mostra o guia aberto (ver GuiaAberto). */
export function Guias({ q, area, guia }: { q: string; area?: Area; guia?: string }) {
  const aberto = guia ? guiaPorId(guia) : undefined;
  if (guia) {
    return aberto ? <GuiaAberto guia={aberto} q={q} area={area} /> : (
      <Aviso>Este guia não existe mais. <Link prefetch={false} href={hrefSuporte("guias", { q, area })} className="font-semibold underline">Voltar aos guias</Link>.</Aviso>
    );
  }
  const achados = buscarGuias(q, area);
  return (
    <div className="space-y-6">
      <form method="get" action="/suporte" role="search" className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <input type="hidden" name="visao" value="guias" />
        {area && <input type="hidden" name="area" value={area} />}
        <Campo rotulo="Buscar guia" name="q" type="search" defaultValue={q} maxLength={120}
          placeholder="Ex.: rolamento, graxa, NR-10, vibração" dica="Aceita sem acento e sem maiúsculas. Cada palavra precisa aparecer no guia." />
        <button type="submit" className={BOTAO_SECUNDARIO}>Buscar</button>
      </form>

      <nav aria-label="Áreas técnicas" className="flex flex-wrap gap-2">
        <Link prefetch={false} href={hrefSuporte("guias", { q })} aria-current={!area ? "page" : undefined} className={pilula(!area)}>Todas</Link>
        {AREAS.map((a) => (
          <Link prefetch={false} key={a.id} href={hrefSuporte("guias", { q, area: a.id })} aria-current={area === a.id ? "page" : undefined}
            className={pilula(area === a.id)}>{a.titulo}</Link>
        ))}
      </nav>

      {achados.length === 0 ? (
        <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">
          Nenhum guia para “{q}”{area ? ` em ${nomeArea(area)}` : ""}. Tente outra palavra ou{" "}
          <Link prefetch={false} href={hrefSuporte("guias", { area })} className="font-semibold text-texto-2 underline">veja todos os guias da área</Link>.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {achados.map(({ guia: g }) => (
            <li key={g.id}>
              <Link prefetch={false} href={hrefSuporte("guias", { q, area, guia: g.id })}
                className="block h-full rounded-cartao border border-borda bg-superficie p-4 transition hover:border-borda-forte hover:bg-superficie-2">
                <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-acao">{nomeArea(g.area)}</span>
                <h3 className="mt-1 font-display text-[16px] font-medium text-texto">{g.titulo}</h3>
                <p className="mt-1.5 text-[13.5px] text-texto-2">{g.resumo}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SECOES: { chave: keyof Pick<Guia, "sintomas" | "causas" | "verificar" | "acoes" | "praticas">; titulo: string; ordenada?: boolean }[] = [
  { chave: "sintomas", titulo: "Sintomas" },
  { chave: "causas", titulo: "Causas prováveis", ordenada: true },
  { chave: "verificar", titulo: "Como verificar", ordenada: true },
  { chave: "acoes", titulo: "Ações" },
  { chave: "praticas", titulo: "Boas práticas" },
];

/** Um guia aberto: seções, textos, links internos e os guias relacionados da mesma área. */
function GuiaAberto({ guia: g, q, area }: { guia: Guia; q: string; area?: Area }) {
  const relacionados = GUIAS.filter((x) => x.area === g.area && x.id !== g.id).slice(0, 6);
  return (
    <article className="space-y-8">
      <Link prefetch={false} href={hrefSuporte("guias", { q, area })} className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-medium text-texto-2 hover:text-texto">
        <ArrowLeft className="size-4" aria-hidden /> Todos os guias
      </Link>
      <header className="space-y-3">
        <Pilula>{nomeArea(g.area)}</Pilula>
        <h2 className="font-display text-[26px] font-medium tracking-[-0.02em] text-texto">{g.titulo}</h2>
        <p className="max-w-3xl text-[15px] text-texto-2">{g.resumo}</p>
      </header>

      {SECOES.map((s) => {
        const itens = g[s.chave];
        if (!itens?.length) return null;
        const Lista = s.ordenada ? "ol" : "ul";
        return (
          <section key={s.chave} aria-labelledby={`g-${s.chave}`} className="space-y-3">
            <h3 id={`g-${s.chave}`} className="font-display text-[18px] font-medium text-texto">{s.titulo}</h3>
            <Lista className={`${s.ordenada ? "list-decimal" : "list-disc"} space-y-2 pl-5 text-[14.5px] text-texto-2 marker:text-texto-3`}>
              {itens.map((t) => <li key={t}>{t}</li>)}
            </Lista>
          </section>
        );
      })}

      {g.texto?.length ? (
        <section aria-label="Texto de apoio" className="space-y-3 text-[14.5px] leading-relaxed text-texto-2">
          {g.texto.map((t) => <p key={t}>{t}</p>)}
        </section>
      ) : null}

      {g.links?.length ? (
        <section aria-labelledby="g-links" className="space-y-3">
          <h3 id="g-links" className="font-display text-[18px] font-medium text-texto">Veja também</h3>
          <ul className="flex flex-wrap gap-2">
            {g.links.map((l) => (
              <li key={l.rota + l.rotulo}>
                <Link prefetch={false} href={l.rota} className="inline-flex min-h-11 items-center rounded-full border border-borda bg-superficie px-4 text-[13.5px] text-texto transition hover:border-borda-forte">
                  {l.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {relacionados.length > 0 && (
        <Secao titulo="Guias" destaque="relacionados" sub={`Outros guias de ${nomeArea(g.area)}.`}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {relacionados.map((x) => (
              <li key={x.id}>
                <Link prefetch={false} href={hrefSuporte("guias", { q, area, guia: x.id })}
                  className="flex min-h-11 items-center rounded-cartao border border-borda bg-superficie px-4 py-3 text-[14px] text-texto transition hover:bg-superficie-2">
                  {x.titulo}
                </Link>
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </article>
  );
}
