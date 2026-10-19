import clsx from "clsx";
import { X } from "lucide-react";
import Link from "next/link";

import { Barras, Grafico, Tabela, type Cor } from "@/components/graficos";
import { analisarModos, comPalavra, palavras as normalizar, tamanhoNuvem, TIPO_QUEBRA } from "@/lib/wcm/modosFalha";
import { tiposPorOrdem } from "@/lib/wcm/preparo";
import { bases } from "@/lib/wcm/dados";
import { dataBr, partes } from "@/lib/wcm/util";

import { AbasParam, GradeNumeros, Numero } from "../equipamentos/_ui/Blocos";

type Params = Record<string, string | string[] | undefined>;
const um = (p: Params, k: string) => (Array.isArray(p[k]) ? p[k]![0] : p[k]) ?? "";
const n0 = new Intl.NumberFormat("pt-BR");
const pct = (v: number) => `${Math.round(v * 100)}%`;
// as mais frequentes mais escuras (rampa sequencial do site); a cor só reforça o tamanho
const COR = ["var(--seq-4)", "var(--seq-5)", "var(--seq-6)", "var(--seq-7)"];

/**
 * Modos de causa das quebras: nuvem com as palavras que mais aparecem no texto de confirmação (IW47) das ordens YM11,
 * as expressões mais comuns, os modos de causa (dicionário em lib/wcm/modosFalha.ts) e, ao clicar numa palavra, os
 * apontamentos que a citam. Todo o histórico enviado, ou um ano.
 */
export async function ModosFalha({ params }: { params: Params }) {
  const b = await bases();
  const conf = b.confirmacoes.dados ?? [];
  const tipos = tiposPorOrdem(b.ordens.dados ?? [], b.operacoes.dados ?? [], conf);
  const anos = [...new Set(conf.filter((c) => c.data != null && (c.tipo || tipos.get(c.ordem) || "").toUpperCase() === TIPO_QUEBRA)
    .map((c) => String(partes(c.data!).ano)))].sort().reverse();
  const ano = anos.includes(um(params, "ano")) ? um(params, "ano") : "";
  const a = analisarModos(conf, tipos, ano);
  const palavra = normalizar(um(params, "palavra"))[0] ?? "";
  const qs = (mudar: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ visao: "causas", ano, palavra, ...mudar })) if (v) p.set(k, v);
    return `?${p.toString()}`;
  };

  if (!conf.length) {
    return <p className="rounded-cartao border border-dashed border-borda-forte p-8 text-center text-[14px] text-texto-2">
      A IW47 (confirmações) ainda não foi enviada em Fontes de dados.</p>;
  }
  const maior = a.palavras[0]?.ordens ?? 1, menor = a.palavras[a.palavras.length - 1]?.ordens ?? 1;
  // nuvem em ordem alfabética (a frequência fica no tamanho), como um bloco de palavras
  const nuvem = [...a.palavras].sort((x, y) => x.rotulo.localeCompare(y.rotulo, "pt-BR"));
  const nomeEq = new Map((b.equipamentos.dados ?? []).map((e) => [e.equipamento, e.denominacao]));
  const lista = palavra ? comPalavra(conf, tipos, palavra, ano) : [];
  const periodo = a.periodo ? `${dataBr(a.periodo.de)} a ${dataBr(a.periodo.ate)}` : "—";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <AbasParam params={{ ...params, palavra: undefined }} param="ano" atual={ano}
          abas={[{ id: "", rotulo: "Todo o histórico" }, ...anos.map((x) => ({ id: x, rotulo: x }))]} />
        <p className="text-[12.5px] text-texto-3">
          Texto de confirmação da IW47 das ordens de quebra ({TIPO_QUEBRA}), de {periodo}. Cada palavra conta uma vez por ordem.
        </p>
      </div>

      <GradeNumeros colunas={4}>
        <Numero rotulo="Ordens de quebra com texto" valor={n0.format(a.ordens)} detalhe={`${n0.format(a.apontamentos)} apontamento(s) analisados`} />
        <Numero rotulo="Principal modo de causa" valor={a.modos[0]?.modo.split(" (")[0] ?? "—"}
          detalhe={a.modos[0] ? `${pct(a.modos[0].pct)} das ordens (${n0.format(a.modos[0].ordens)})` : "nenhum termo reconhecido"} />
        <Numero rotulo="Palavra mais citada" valor={a.palavras[0]?.rotulo ?? "—"} detalhe={a.palavras[0] ? `em ${n0.format(a.palavras[0].ordens)} ordem(ns)` : undefined} />
        <Numero rotulo="Sem texto ou sem modo" valor={n0.format(a.semTexto + a.semModo)}
          detalhe={`${n0.format(a.semTexto)} sem texto · ${n0.format(a.semModo)} com texto fora dos modos`}
          tom={a.ordens && (a.semTexto + a.semModo) / (a.ordens + a.semTexto) > 0.4 ? "atencao" : undefined} />
      </GradeNumeros>

      <section className="rounded-cartao border border-borda bg-superficie">
        <div className="flex flex-wrap items-baseline gap-x-3 border-b border-borda px-4 py-2.5">
          <h3 className="font-display text-[15px] font-medium">Bloco de palavras — o que mais aparece nas quebras</h3>
          <span className="text-[12.5px] text-texto-3">maior = em mais ordens · clique para ver os apontamentos</span>
        </div>
        {nuvem.length ? (
          <ul className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2 px-4 py-6" aria-label="Palavras mais citadas nos textos de confirmação">
            {nuvem.map((p) => {
              const t = tamanhoNuvem(p.ordens, maior, menor);
              const nivel = Math.min(COR.length - 1, Math.floor(((t - 12) / 29) * COR.length));
              return (
                <li key={p.termo}>
                  <Link prefetch={false} href={qs({ palavra: p.termo === palavra ? "" : p.termo })} scroll={false}
                    aria-label={`${p.rotulo}: ${p.ordens} ordem(ns)`} title={`${p.rotulo} · ${n0.format(p.ordens)} ordem(ns)`}
                    className={clsx("rounded-md px-1 font-display font-medium leading-tight hover:underline focus-visible:outline-2 focus-visible:outline-marca-500",
                      p.termo === palavra && "bg-marca-500/15 ring-1 ring-marca-500")}
                    style={{ fontSize: t, color: COR[nivel] }}>
                    {p.rotulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <p className="px-4 py-8 text-center text-[13.5px] text-texto-3">Nenhum texto de confirmação nas ordens {TIPO_QUEBRA} deste período.</p>}
      </section>

      {palavra && (
        <section className="overflow-hidden rounded-cartao border border-marca-500/40 bg-superficie">
          <div className="flex items-center gap-3 border-b border-borda px-4 py-2.5">
            <h3 className="font-display text-[15px] font-medium">Apontamentos com “{a.palavras.find((p) => p.termo === palavra)?.rotulo ?? palavra.toLowerCase()}”</h3>
            <span className="text-[12.5px] text-texto-3">{lista.length >= 50 ? "os 50 mais recentes" : `${lista.length} apontamento(s)`}</span>
            <Link href={qs({ palavra: "" })} scroll={false} className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-texto-3 hover:text-texto">
              <X className="size-3.5" /> fechar
            </Link>
          </div>
          <Tabela colunas={["Data", "Ordem", "Equipamento", "Texto de confirmação"]}
            linhas={lista.map((c) => [c.data != null ? dataBr(c.data) : "—", c.ordem, [c.equipamento, nomeEq.get(c.equipamento)].filter(Boolean).join(" · ") || "—", c.texto])} />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Grafico titulo="Principais modos de causa" subtitulo="% das ordens de quebra com texto · uma ordem pode ter mais de um modo"
          dica="Cada modo junta palavras do texto de confirmação (ex.: rolamento, mancal, bucha → Rolamentos e mancais)."
          tabela={{ colunas: ["Modo de causa", "Ordens", "%"], linhas: a.modos.map((m) => [m.modo, m.ordens, pct(m.pct)]) }}>
          {a.modos.length
            ? <Barras formato="%" larguraRotulo={230} max={100}
                itens={a.modos.map((m) => ({ rotulo: m.modo, valor: Math.round(m.pct * 1000) / 10, cor: "serie-1" as Cor, detalhe: `${n0.format(m.ordens)} ordem(ns) · ex.: ${m.exemplos[0] ?? ""}` }))} />
            : <p className="py-8 text-center text-[13.5px] text-texto-3">Nenhum modo reconhecido nos textos.</p>}
        </Grafico>
        <Grafico titulo="Expressões mais comuns" subtitulo="duas palavras seguidas, em 2 ou mais ordens"
          tabela={{ colunas: ["Expressão", "Ordens"], linhas: a.expressoes.map((e) => [e.rotulo, e.ordens]) }}>
          {a.expressoes.length
            ? <Barras formato="inteiro" larguraRotulo={200}
                itens={a.expressoes.slice(0, 12).map((e) => ({ rotulo: e.rotulo, valor: e.ordens, cor: "serie-3" as Cor }))} />
            : <p className="py-8 text-center text-[13.5px] text-texto-3">Poucas repetições para formar expressões.</p>}
        </Grafico>
      </div>

      <details className="rounded-cartao border border-borda bg-superficie">
        <summary className="cursor-pointer px-4 py-3 font-display text-[15px] font-medium">Ranking das palavras ({a.palavras.length})</summary>
        <Tabela colunas={["#", "Palavra", "Ordens", "% das ordens"]}
          linhas={a.palavras.map((p, i) => [i + 1, p.rotulo, p.ordens, a.ordens ? pct(p.ordens / a.ordens) : "—"])} />
      </details>
      <p className="text-[12px] text-texto-3">
        Ficam de fora palavras sem significado para a causa (preposições, “realizado”, “serviço”, “troca”, “substituído”… — dizem a ação, não a causa), números e códigos; plural
        conta junto do singular. Para melhorar a leitura, peça à equipe para descrever no apontamento a peça e o que aconteceu com ela
        (ex.: “correia rompida”, “rolamento travado por falta de lubrificação”).
      </p>
    </div>
  );
}
