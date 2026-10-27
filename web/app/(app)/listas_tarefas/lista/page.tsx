import { ArrowLeft, BookOpen, CalendarRange, ClipboardList, FileText, LifeBuoy, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PaginaWcm } from "@/components/PaginaWcm";
import { BOTAO_COMPACTO, Cabecalho, Pilula, Selo } from "@/components/ui";
import { podeEditar, podeVer, soEstoque, veInteira } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { conferidaNoManual } from "@/lib/dados/regrasVinculo";
import { GUIAS } from "@/lib/suporte/guias";
import { barra, contexto } from "@/lib/wcm/contexto";
import { documentoDoTema, pecaCombina, rotuloCiclo, temasDoTexto, type OperacaoLT } from "@/lib/wcm/listasTarefas";
import { dataBr } from "@/lib/wcm/util";

import { Cartao, GradeNumeros, inteiroBr, Numero, TabelaT } from "../../equipamentos/_ui/Blocos";
import { infoCad, materiaisDe } from "../../equipamentos/dados";
import { baseMateriais } from "../../mro/dados";
import { DistribuicaoIa06 } from "../../mro/DistribuicaoIa06";
import { distribuirPecas, opcaoLista } from "@/lib/wcm/distribuicaoIa06";
import { pecaMro, type PecaMro } from "../../mro/logica";
import { acharLista, dadosListas, documentosDaLista, type DocEquip } from "../dados";
import { um, type Params } from "../logica";

export const metadata: Metadata = { title: "Ficha da lista de tarefas" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COR_STATUS: Record<string, "verde" | "amarelo" | "vermelho" | "cinza"> = { ok: "verde", baixo: "amarelo", zerado: "vermelho", ausente: "cinza" };
const horas = (h: number | null) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : `${String(Math.round(h * 10) / 10).replace(".", ",")} h`);
const hrefDoc = (d: DocEquip) => (d.tipo === "link" && d.url ? d.url : `/api/equipamentos/documento?${new URLSearchParams({ eq: d.tag, id: d.id })}`);

/** Uma peça (do MRO ou componente da lista) com o saldo do Estoque e a origem do vínculo. */
function LinhaPeca({ p, qtd }: { p: PecaMro; qtd?: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1 text-[13px]">
      <span className="font-mono text-[12.5px] text-alp-azul">{p.codigo}</span>
      <span className="min-w-0 flex-1 truncate text-texto-2" title={p.descrCompleta || p.descricao}>{p.descricao || "—"}</span>
      {qtd && <span className="text-[12px] text-texto-3">{qtd}</span>}
      <Selo cor={COR_STATUS[p.status] ?? "cinza"}>{p.texto}</Selo>
      {conferidaNoManual(p.codigo) ? <Selo cor="verde">conferida no manual</Selo> : null}
    </li>
  );
}

/**
 * Ficha de uma lista de tarefas: as operações (texto completo, centro, tempos, ciclo), os equipamentos que a usam, os
 * manuais desses equipamentos (o capítulo do assunto da operação em destaque), o guia do Suporte Técnico, as peças do
 * MRO para as operações de troca (com o saldo do Estoque) e a inclusão delas nos componentes da lista (IA06).
 */
export default async function FichaLista(props: { searchParams: Promise<Params> }) {
  const u = await exigir("listas_tarefas");
  const params = await props.searchParams;
  const c = await contexto(params);
  const [d, bm] = await Promise.all([dadosListas(c), baseMateriais()]);
  const lt = acharLista(d, um(params, "g"), um(params, "n"));
  const voltar = (
    <Link prefetch={false} href="/listas_tarefas" className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-medium text-texto-2 hover:text-texto">
      <ArrowLeft className="size-4" /> Listas de tarefas
    </Link>
  );
  if (!lt) {
    return (
      <PaginaWcm barra={barra(c)} periodo={false} dimensoes={false}>
        {voltar}
        <Cabecalho titulo="Lista não encontrada" subtitulo={`A lista ${um(params, "g")}/${um(params, "n")} não está na base de listas de tarefas.`} />
      </PaginaWcm>
    );
  }
  const verMro = podeVer(u, "mro"), verPlanos = podeVer(u, "planos"), verOrdens = podeVer(u, "ordens");
  const edita = veInteira(u, "mro") && podeEditar(u) && !soEstoque(u);
  const eqs = d.equipamentos.get(lt.chave) ?? [];
  const docs = documentosDaLista(d, eqs);
  // peças do MRO: as do equipamento e as dos superiores dele (a máquina inteira costuma ter as peças do manual)
  const tags = [...new Set(eqs.flatMap((e) => [e.equipamento, ...d.superiores(e.equipamento)]))];
  const codigos = [...new Set(tags.flatMap((t) => materiaisDe(infoCad(c, t))))];
  const pecas = codigos.map((m) => pecaMro(m, bm, c.cad.materiais));
  const naLista = new Set(lt.operacoes.flatMap((o) => o.componentes.map((x) => x.material)));
  const sugestoes = (o: OperacaoLT) => pecas.filter((p) => !naLista.has(p.codigo) && pecaCombina(`${o.texto}\n${o.textoLongo}`, p.descricao));
  const porOp = new Map(lt.operacoes.map((o) => [o, sugestoes(o)]));
  const sugeridas = [...new Map([...porOp.values()].flat().map((p) => [p.codigo, p])).values()];
  // carga da IA06: as peças dos equipamentos da lista (e as dos superiores que combinam com alguma operação) distribuídas
  // nas operações desta lista
  const estaLista = opcaoLista({ grupo: lt.grupo, numerador: lt.numerador, texto: lt.titulo, equipamentos: Math.max(1, eqs.length) },
    eqs[0]?.equipamento ?? "", eqs.length > 1 ? `lista geral (${eqs.length} equipamentos)` : d.nome(eqs[0]?.equipamento ?? "") || lt.titulo,
    lt.operacoes.map((o) => ({ operacao: o.operacao, texto: o.texto, textoLongo: o.textoLongo })), lt.titulo);
  const doEquip = new Set(eqs.map((e) => e.equipamento));
  const origemDe = new Map<string, string>();
  for (const t of tags) for (const m of materiaisDe(infoCad(c, t))) if (!origemDe.has(m) || doEquip.has(t)) origemDe.set(m, t);
  const atribuicoes = distribuirPecas(pecas.filter((p) => !naLista.has(p.codigo)).map((p) => ({ codigo: p.codigo, descricao: p.descricao,
    descrCompleta: p.descrCompleta, um: p.um, origem: origemDe.get(p.codigo) ?? "", conferida: conferidaNoManual(p.codigo) })),
  () => [estaLista], (o) => [o], [estaLista]).filter((a) => a.nivel !== "sem" || doEquip.has(a.origem));
  const nomesOrigem = Object.fromEntries(tags.map((t) => [t, d.nome(t) || t]));
  const planos = [...new Set(eqs.flatMap((e) => e.planos))];
  const ordens = (c.b.ordens.dados ?? []).filter((o) => o.plano && planos.includes(o.plano)).sort((a, b) => (b.data ?? -1e9) - (a.data ?? -1e9)).slice(0, 12);
  const temasLista = [...new Map(lt.operacoes.flatMap((o) => temasDoTexto(`${o.texto}\n${o.textoLongo}`)).map((x) => [x.id, x])).values()];
  const guias = GUIAS.filter((g) => temasLista.some((t) => t.guias.includes(g.id)));

  return (
    <PaginaWcm barra={barra(c)} periodo={false} dimensoes={false}>
      {voltar}
      <Cabecalho titulo={`${lt.grupo}/${lt.numerador}`} destaque={lt.titulo || undefined} sobre={<Pilula>Lista de tarefas · {lt.estrategia || "sem estratégia"}</Pilula>}
        subtitulo={[`Centro ${lt.centro || "—"}`, lt.centrosTrabalho.join(", "), rotuloCiclo(lt.cicloDias)].filter(Boolean).join(" · ")}
        acoes={<div className="flex flex-wrap gap-2">
          {verPlanos && planos[0] && <Link prefetch={false} href={`/planos?${new URLSearchParams({ q: planos[0] })}`} className={BOTAO_COMPACTO}><CalendarRange className="size-3.5" /> Planos</Link>}
          {verOrdens && planos[0] && <Link prefetch={false} href={`/ordens?${new URLSearchParams({ q: planos[0] })}`} className={BOTAO_COMPACTO}><ClipboardList className="size-3.5" /> Ordens</Link>}
          {verMro && eqs[0] && <Link prefetch={false} href={`/mro?${new URLSearchParams({ at: eqs[0].equipamento })}#abas`} className={BOTAO_COMPACTO}><Wrench className="size-3.5" /> Gestão de MRO</Link>}
        </div>} />

      <GradeNumeros colunas={5}>
        <Numero rotulo="Operações" valor={inteiroBr(lt.operacoes.length)} detalhe={lt.suboperacoes.length ? `${lt.suboperacoes.length} suboperações` : undefined} />
        <Numero rotulo="Trabalho por execução" valor={horas(lt.trabalhoH)} />
        <Numero rotulo="Trabalho por ano" valor={horas(lt.horasAno)} dica="Trabalho × execuções por ano, pelo ciclo do pacote de cada operação." />
        <Numero rotulo="Equipamentos" valor={inteiroBr(eqs.length)} detalhe={eqs.length > 1 ? "lista geral" : eqs.length ? undefined : "nenhum plano usa"} tom={eqs.length ? undefined : "atencao"} />
        <Numero rotulo="Peças sugeridas" valor={inteiroBr(sugeridas.length)} detalhe={`${inteiroBr(naLista.size)} componente(s) já na lista`} />
      </GradeNumeros>

      {/* equipamentos */}
      <section aria-labelledby="equip" className="space-y-3">
        <h2 id="equip" className="font-display text-[20px] font-medium">Equipamentos que usam a lista</h2>
        <TabelaT vazio="Nenhum plano da IP19 nem ordem do IW38 usa esta lista." colunas={[{ rotulo: "Equipamento" }, { rotulo: "Nome", larga: true }, { rotulo: "Superior" }, { rotulo: "Planos" }, { rotulo: "Origem" }]}
          linhas={eqs.map((e) => {
            const sup = d.superiores(e.equipamento)[0];
            return {
              chave: e.equipamento, href: `/equipamentos/biblioteca?${new URLSearchParams({ eq: e.equipamento })}`,
              celulas: [e.equipamento, d.nome(e.equipamento) || "—", sup ? <Link key="s" prefetch={false} href={`/equipamentos/biblioteca?${new URLSearchParams({ eq: sup })}`} className="text-alp-azul hover:underline">{d.nome(sup) || sup}</Link> : "—",
                e.planos.join(", ") || "—", e.pelaOrdem ? "ordens do IW38" : "IP19"],
            };
          })} />
      </section>

      {/* operações */}
      <section aria-labelledby="ops" className="space-y-3">
        <h2 id="ops" className="font-display text-[20px] font-medium">Operações</h2>
        {lt.operacoes.map((o) => {
          const temas = temasDoTexto(`${o.texto}\n${o.textoLongo}`);
          const docsOp = docs.filter((x) => documentoDoTema(x.titulo, temas));
          const sug = porOp.get(o) ?? [];
          const subs = lt.suboperacoes.filter((s) => s.operacao === o.operacao);
          return (
            <Cartao key={o.operacao} titulo={<span><span className="font-mono">{o.operacao}</span> · {o.texto || "—"}</span>}
              sub={[o.centroTrabalho || "sem centro", o.pessoas != null ? `${o.pessoas} pessoa(s)` : "", `trabalho ${horas(o.trabalhoH)}`, `duração ${horas(o.duracaoH)}`,
                o.ciclos ? `${o.ciclos} (${o.pacotes})` : "sem pacote", o.horasAno != null ? `${horas(o.horasAno)}/ano` : ""].filter(Boolean).join(" · ")}>
              {temas.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{temas.map((t) => <Selo key={t.id}>{t.rotulo}</Selo>)}</div>}
              {o.textoLongo ? <p className="whitespace-pre-line text-[13px] leading-relaxed text-texto-2">{o.textoLongo}</p>
                : <p className="text-[12.5px] text-texto-3">Sem texto longo.</p>}
              {subs.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-[12.5px] text-texto-2">{subs.map((s) => <li key={s.sub}>{s.sub} · {s.texto}</li>)}</ul>
              )}
              {o.componentes.length > 0 && (
                <div className="mt-3 border-t border-borda pt-2">
                  <div className="text-[12px] font-medium text-texto-3">Componentes da lista (SAP)</div>
                  <ul className="divide-y divide-borda">{o.componentes.map((x) => (
                    <LinhaPeca key={x.material} p={pecaMro(x.material, bm, c.cad.materiais)} qtd={x.quantidade != null ? `${String(x.quantidade).replace(".", ",")} ${x.um}` : undefined} />
                  ))}</ul>
                </div>
              )}
              {sug.length > 0 && (
                <div className="mt-3 border-t border-borda pt-2">
                  <div className="text-[12px] font-medium text-texto-3">Peças do equipamento para esta troca (MRO) — ainda não estão na lista</div>
                  <ul className="divide-y divide-borda">{sug.map((p) => <LinhaPeca key={p.codigo} p={p} />)}</ul>
                </div>
              )}
              {docsOp.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-borda pt-2 text-[12.5px]">
                  <BookOpen className="size-3.5 text-texto-3" /> <span className="text-texto-3">Manual do assunto:</span>
                  {docsOp.slice(0, 4).map((x) => <a key={`${x.tag}-${x.id}`} href={hrefDoc(x)} target="_blank" rel="noopener noreferrer" className="text-alp-azul hover:underline">{x.titulo}</a>)}
                </div>
              )}
            </Cartao>
          );
        })}
      </section>

      {/* manuais e guias */}
      <section aria-labelledby="manuais" className="space-y-3">
        <h2 id="manuais" className="font-display text-[20px] font-medium">Manuais e guias</h2>
        {!docs.length ? <p className="text-[13px] text-texto-3">Nenhum manual na biblioteca dos equipamentos desta lista. Ponha o manual na Biblioteca do ativo (Equipamentos).</p> : (
          <ul className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
            {docs.map((x) => {
              const destaque = documentoDoTema(x.titulo, temasLista);
              return (
                <li key={`${x.tag}-${x.id}`} className="flex min-w-0 items-center gap-2">
                  <FileText className={`size-3.5 shrink-0 ${destaque ? "text-alp-azul" : "text-texto-3"}`} />
                  <a href={hrefDoc(x)} target="_blank" rel="noopener noreferrer" className={`truncate hover:underline ${destaque ? "font-medium text-texto" : "text-texto-2"}`} title={x.titulo}>{x.titulo}</a>
                  <span className="shrink-0 text-[11.5px] text-texto-3">{x.tag}</span>
                </li>
              );
            })}
          </ul>
        )}
        {guias.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <LifeBuoy className="size-4 text-texto-3" /> <span className="text-texto-3">Suporte Técnico:</span>
            {guias.map((g) => <Link key={g.id} prefetch={false} href={`/suporte?${new URLSearchParams({ visao: "guias", guia: g.id })}`} className="text-alp-azul hover:underline">{g.titulo}</Link>)}
          </div>
        )}
      </section>

      {/* IA06 */}
      {edita && atribuicoes.length > 0 && (
        <section aria-labelledby="ia06" className="space-y-2">
          <h2 id="ia06" className="font-display text-[20px] font-medium">Incluir as peças nos componentes da lista (IA06)</h2>
          <DistribuicaoIa06 rotulo={`Lista ${lt.grupo}/${lt.numerador}`} atribuicoes={atribuicoes} listas={{ [estaLista.chave]: estaLista }}
            nomes={nomesOrigem} comTextoIa03 />
        </section>
      )}

      {/* ordens */}
      {verOrdens && planos.length > 0 && (
        <section aria-labelledby="ordens" className="space-y-3">
          <h2 id="ordens" className="font-display text-[20px] font-medium">Últimas ordens dos planos desta lista</h2>
          <TabelaT vazio="Nenhuma ordem dos planos desta lista no IW38." colunas={[{ rotulo: "Ordem" }, { rotulo: "Texto", larga: true }, { rotulo: "Equipamento" }, { rotulo: "Plano" }, { rotulo: "Data" }, { rotulo: "Situação" }]}
            linhas={ordens.map((o) => ({ chave: o.ordem, href: `/ordens?${new URLSearchParams({ q: o.ordem })}`,
              celulas: [o.ordem, o.texto || "—", o.equipChave || "—", o.plano, o.data != null ? dataBr(o.data) : "—", o.situacao] }))} />
        </section>
      )}
    </PaginaWcm>
  );
}
