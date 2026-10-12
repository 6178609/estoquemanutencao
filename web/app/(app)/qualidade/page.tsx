import { ChevronDown, Wrench } from "lucide-react";
import type { Metadata } from "next";

import { Barras, Grafico, Medidor } from "@/components/graficos";
import { COR_FAROL, SeloFarol } from "@/components/Indicador";
import { PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { inteiro } from "@/lib/formato";
import { barra, contexto } from "@/lib/wcm/contexto";
import * as q from "@/lib/wcm/qualidade";
import { Baixar, query } from "../ordens/_comum/Baixar";
import { formatarCelula } from "../ordens/_comum/TabelaDados";
import type { Params } from "../ordens/_comum/url";
import { checagens as calcular, colunasDe } from "./dados";

export const metadata: Metadata = { title: "Qualidade dos dados" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MOSTRAR = 100;
const n1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pctTxt = (p: number | null) => (p == null ? "—" : `${n1.format(p)}%`);

export default async function Qualidade(props: { searchParams: Promise<Params> }) {
  await exigir("qualidade");
  const params = await props.searchParams;
  const c = await contexto(params);
  const moldura = { ...barra(c), recorte: `${c.f.areas.length || c.centros.length || c.f.tipos.length ? "Recorte da barra" : "Fábrica inteira"} · últimos 12 meses até hoje` };
  if (!c.b.ordens.dados) return <PaginaWcm barra={moldura} periodo={false}><Cabecalho titulo="Qualidade dos dados" /><SemDados base="IW38 (ordens)" /></PaginaWcm>;
  const lista = q.ordenarPorPct(await calcular(c));
  const idx = q.indice(lista);
  const n = q.contarFarois(lista);
  const filtros = query(params, ["id"]);

  return (
    <PaginaWcm barra={moldura} periodo={false}>
      <Cabecalho titulo="Qualidade dos dados," destaque="indicador bom começa no apontamento bem feito." sobre="Configuração"
        subtitulo="O que nas bases do SAP distorce os indicadores, quanto distorce e como corrigir na origem. Farol: até 2% com problema verde, até 10% amarelo, acima disso vermelho." />

      {!lista.length ? <p className="text-[14px] text-texto-3">Sem bases para conferir.</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="col-span-2 rounded-cartao border border-borda bg-superficie p-4 lg:col-span-1" title="100 − média dos % com problema de cada checagem">
              <div className="text-[12.5px] font-medium text-texto-2">Índice de qualidade</div>
              <div className="num mt-1.5 font-display text-[28px] font-medium leading-none tracking-[-0.02em]">{idx == null ? "—" : `${Math.round(idx)}`}<span className="text-[15px] text-texto-3">/100</span></div>
              <div className="mt-3"><Medidor valor={idx} rotulo="Índice de qualidade" status={idx == null ? "neutro" : Math.round(idx) >= 98 ? "st-bom" : Math.round(idx) >= 90 ? "st-atencao" : "st-critico"} /></div>
              <div className="mt-2 text-[12px] text-texto-3">100 − média dos % com problema</div>
            </div>
            {([["verde", "Checagens OK"], ["amarelo", "Em atenção"], ["vermelho", "Críticas"]] as const).map(([f, r]) => (
              <div key={f} className="rounded-cartao border border-borda bg-superficie p-4">
                <div className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-texto-2">{r}<SeloFarol farol={f} compacto /></div>
                <div className="num mt-1.5 font-display text-[28px] font-medium leading-none tracking-[-0.02em]">{inteiro(n[f])}</div>
                <div className="mt-2 text-[12px] text-texto-3">de {lista.length} checagens</div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <Grafico className="min-w-0" titulo="% de registros com problema" subtitulo="Por checagem, do pior para o melhor · cor = farol"
              tabela={{ colunas: ["Checagem", "% com problema", "Com problema", "Total"], linhas: lista.map((x) => [x.nome, pctTxt(x.pct), x.n, x.total]) }}>
              <Barras formato="%" larguraRotulo={340} max={Math.max(12, ...lista.map((x) => x.pct ?? 0)) * 1.12}
                itens={lista.map((x) => ({ rotulo: x.nome, valor: x.pct ?? 0, detalhe: `${inteiro(x.n)} de ${inteiro(x.total)}`, cor: COR_FAROL[x.farol] }))} />
            </Grafico>
            <div className="min-w-0 overflow-x-auto rounded-cartao border border-borda bg-superficie">
              <table className="w-full min-w-[560px] text-left text-[12.5px]">
                <thead className="border-b border-borda bg-superficie-2 text-[11.5px] text-texto-3">
                  <tr><th className="px-3 py-2 font-medium">Checagem</th><th className="px-3 py-2 text-right font-medium">% com problema</th>
                    <th className="px-3 py-2 text-right font-medium">Com problema</th><th className="px-3 py-2 text-right font-medium">Total</th><th className="px-3 py-2 font-medium">Afeta</th></tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {lista.map((x) => (
                    <tr key={x.id}>
                      <td className="px-3 py-2"><span className="inline-flex items-start gap-2"><SeloFarol farol={x.farol} compacto /><span>{x.nome}<span className="block text-[11.5px] text-texto-3">{x.base}</span></span></span></td>
                      <td className="num px-3 py-2 text-right tabular-nums">{pctTxt(x.pct)}</td>
                      <td className="num px-3 py-2 text-right tabular-nums">{inteiro(x.n)}</td>
                      <td className="num px-3 py-2 text-right tabular-nums">{inteiro(x.total)}</td>
                      <td className="px-3 py-2 text-texto-2">{x.afeta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Secao titulo="Registros com problema" destaque="para corrigir no SAP" sub="Abra a checagem para ver como corrigir e a lista; baixe o CSV completo para trabalhar no SAP.">
            <div className="space-y-2">
              {lista.filter((x) => x.n > 0).map((x) => {
                const cols = colunasDe(x);
                return (
                  <details key={x.id} className="group rounded-cartao border border-borda bg-superficie">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <SeloFarol farol={x.farol} compacto />
                      <span className="min-w-0 flex-1 text-[14px] font-medium">{x.nome}</span>
                      <span className="num shrink-0 text-[12.5px] text-texto-3">{inteiro(x.n)} de {inteiro(x.total)}</span>
                      <ChevronDown className="size-4 shrink-0 text-texto-3 transition group-open:rotate-180" />
                    </summary>
                    <div className="space-y-3 border-t border-borda px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <p className="max-w-3xl text-[13px] text-texto-2"><Wrench className="mr-1.5 inline size-3.5 text-texto-3" /><b className="font-medium">Como corrigir:</b> {x.corrigir}
                          <span className="block text-texto-3">Base: {x.base} · Afeta: {x.afeta}</span></p>
                        <Baixar href={`/api/qualidade?id=${x.id}${filtros ? `&${filtros}` : ""}`}>Baixar CSV ({inteiro(x.n)})</Baixar>
                      </div>
                      <div className="max-h-[420px] overflow-auto rounded-lg border border-borda">
                        <table className="w-full text-left text-[12.5px]">
                          <thead className="sticky top-0 bg-superficie-2 text-[11.5px] text-texto-3">
                            <tr>{cols.map((k) => <th key={k.chave} className="whitespace-nowrap px-3 py-1.5 font-medium">{k.rotulo}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-borda">
                            {x.problemas.slice(0, MOSTRAR).map((l, i) => (
                              <tr key={i}>{cols.map((k) => (
                                <td key={k.chave} className={k.tipo === "texto" ? "max-w-[280px] px-3 py-1.5" : "num whitespace-nowrap px-3 py-1.5 tabular-nums"}>{formatarCelula(l[k.chave], k.tipo)}</td>
                              ))}</tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {x.n > MOSTRAR && <p className="text-[12px] text-texto-3">Mostrando {MOSTRAR} de {inteiro(x.n)} — o CSV leva todos.</p>}
                    </div>
                  </details>
                );
              })}
              {!lista.some((x) => x.n > 0) && <p className="text-[13.5px] text-texto-3">Nenhum registro com problema no recorte.</p>}
            </div>
          </Secao>
        </>
      )}
    </PaginaWcm>
  );
}
