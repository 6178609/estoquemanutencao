import clsx from "clsx";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BOTAO_COMPACTO, Cabecalho, Pagina, Selo } from "@/components/ui";
import { podeEditar, podeVer, veInteira } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { todosDocumentosEquipamentos } from "@/lib/dados/documentos";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { DESATIVADO } from "@/lib/wcm/ativos";
import { contexto } from "@/lib/wcm/contexto";
import { ACERVO } from "@/lib/suporte/acervo";
import {
  equipamentosSemManual, filtrarManuais, paginar, resumoManuais, type EquipamentoManual, type TipoManual,
} from "@/lib/manuais/lista";

import { GradeNumeros, inteiroBr, Numero, Paginacao, TabelaT, type LinhaT } from "../equipamentos/_ui/Blocos";
import type { Params } from "../equipamentos/_ui/url";
import { inventarioAtivos } from "../equipamentos/dados";
import { RemoverManual } from "./RemoverManual";
import { VincularManual } from "./VincularManual";

export const metadata: Metadata = { title: "Manuais" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const um = (p: Params, k: string) => (Array.isArray(p[k]) ? p[k]![0] : p[k]) ?? "";
const TIPOS: Record<string, string> = { pdf: "PDF", imagem: "Imagem", link: "Link" };
const LIMITE_SEM_MANUAL = 50;
const rotuloTipo = (tipo: string) => (tipo === "link" ? "Link" : tipo === "application/pdf" ? "PDF" : "Imagem");

/**
 * Manuais: vincula um manual (arquivo ou link) a um ou mais equipamentos e lista todos os vínculos. Usa a mesma
 * biblioteca da ficha do equipamento (Equipamentos › Biblioteca do ativo). Universo: os equipamentos do IH08 que
 * não estão desativados. A ficha só aparece para quem vê a aba Equipamentos.
 */
export default async function Manuais(props: { searchParams: Promise<Params> }) {
  const u = await exigir("manuais");
  const params = await props.searchParams;
  const edita = veInteira(u, "equipamentos") && podeEditar(u);
  const verFicha = podeVer(u, "equipamentos");
  const q = um(params, "q"), tipo = um(params, "tipo") as TipoManual | "", area = um(params, "area"), sem = um(params, "sem");
  const vincular = um(params, "vincular").trim();

  const c = await contexto({});
  const [inv, vinculos, campoEq] = await Promise.all([inventarioAtivos(c), todosDocumentosEquipamentos(), campoDoEquipamento(c)]);
  const todos: EquipamentoManual[] = inv.map((x) => ({ codigo: x.codigo, nome: x.equipamento || "", campo: campoEq(x.codigo) || "", area: x.area || "" }));
  const ativosIH08 = inv.filter((x) => x.situacao !== DESATIVADO && x.origem !== "Site").map((x) => ({ codigo: x.codigo, area: x.area || "" }));
  const codigosAtivos = new Set(ativosIH08.map((a) => a.codigo));
  const ativosTela = todos.filter((x) => codigosAtivos.has(x.codigo));
  const porCodigo = new Map(todos.map((x) => [x.codigo, x]));
  const resumo = resumoManuais(ativosIH08, vinculos);
  const manuais = vinculos.filter((v) => !v.doc.origem).length;
  const areas = [...new Set(ativosTela.map((x) => x.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const filtrados = filtrarManuais(vinculos, { q, tipo: tipo || undefined, area }, todos);
  const pag = paginar(filtrados, Number(um(params, "pag")));
  const semManual = equipamentosSemManual(ativosTela, vinculos, sem);
  const itens = pag.itens.map(({ tag, doc }) => {
    const eq = porCodigo.get(tag);
    return {
      chave: `${tag}|${doc.id}`,
      tag,
      campo: eq?.campo || "—",
      nome: eq?.nome || "",
      titulo: doc.titulo,
      abrir: doc.tipo === "link" ? doc.url! : `/api/equipamentos/documento?${new URLSearchParams({ eq: tag, id: doc.id })}`,
      tipo: rotuloTipo(doc.tipo),
      origem: doc.origem ? `Mesmo arquivo de ${doc.origem.tag}` : "",
      data: new Date(doc.em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      por: doc.por || "—",
      id: doc.id,
    };
  });
  const ficha = (tag: string) => `/equipamentos/biblioteca?${new URLSearchParams({ eq: tag })}`;

  const linhasManuais: LinhaT[] = itens.map((x) => ({
    chave: x.chave,
    href: verFicha ? ficha(x.tag) : undefined,
    celulas: [
      x.tag,
      <span key="eq" className="block max-w-[260px] truncate">{x.campo}<span className="block truncate text-[12px] text-texto-3">{x.nome}</span></span>,
      <a key="t" href={x.abrir} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-[320px] items-center gap-1 font-medium hover:text-acao">
        <span className="truncate">{x.titulo}</span><ExternalLink className="size-3.5 shrink-0 text-texto-3" aria-hidden />
        <span className="sr-only">(abre em nova aba)</span>
      </a>,
      <Selo key="s" cor={x.tipo === "Link" ? "azul" : "cinza"}>{x.tipo}</Selo>,
      x.origem ? <span key="o" className="text-[12px] text-texto-3">{x.origem}</span> : "—",
      <span key="d" className="whitespace-nowrap">{x.data}</span>,
      x.por,
      edita ? <RemoverManual key="r" eq={x.tag} id={x.id} titulo={x.titulo} /> : "",
    ],
  }));

  const acervo = ACERVO.map((a) => ({ titulo: a.titulo, url: a.url, fonte: a.fonte, area: a.area }));

  return (
    <Pagina>
      <Cabecalho titulo="Manuais" subtitulo="Vincule manuais e links aos equipamentos. Os mesmos aparecem na ficha de cada equipamento (Biblioteca do ativo)." />

      {/* 1. números */}
      <section aria-labelledby="numeros" className="space-y-4">
        <h2 id="numeros" className="font-display text-[20px] font-medium">Cobertura</h2>
        <GradeNumeros colunas={4}>
          <Numero rotulo="Manuais cadastrados" valor={inteiroBr(manuais)} detalhe="arquivos e links (sem as referências)" />
          <Numero rotulo="Equipamentos com manual" valor={inteiroBr(resumo.comManual)} detalhe={`de ${inteiroBr(ativosIH08.length)} equipamentos ativos`} />
          <Numero rotulo="Sem manual" valor={inteiroBr(resumo.semManual)} detalhe="equipamentos ativos" />
          <Numero rotulo="Cobertura" valor={`${resumo.cobertura}%`} detalhe={`${inteiroBr(resumo.vinculos)} vínculos no total`} />
        </GradeNumeros>
      </section>

      {/* 2. vincular */}
      {edita ? (
        <section id="vincular" aria-labelledby="vincular-titulo" className="space-y-4">
          <div>
            <h2 id="vincular-titulo" className="font-display text-[20px] font-medium">Vincular manual</h2>
            <p className="mt-1 text-[13px] text-texto-3">Escolha um ou mais equipamentos. Um arquivo é guardado uma vez e fica ligado a todos.</p>
          </div>
          <VincularManual equipamentos={ativosTela} acervo={acervo} inicial={vincular ? [vincular] : []} />
        </section>
      ) : (
        <p className="rounded-cartao border border-dashed border-borda px-5 py-6 text-center text-[13.5px] text-texto-3">
          Só editor ou administrador vincula manuais. Você pode abrir os manuais abaixo.
        </p>
      )}

      {/* 3. lista geral */}
      <section aria-labelledby="lista" className="space-y-4">
        <h2 id="lista" className="font-display text-[20px] font-medium">Todos os manuais <span className="text-texto-3">({inteiroBr(filtrados.length)})</span></h2>
        <form method="get" className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" role="search">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-texto">Buscar</span>
            <input name="q" type="search" defaultValue={q} placeholder="Equipamento, campo ou título" autoComplete="off"
              className="h-11 w-full rounded-xl border border-borda-forte bg-superficie px-3 text-[15px] placeholder:text-texto-3" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-texto">Tipo</span>
            <select name="tipo" defaultValue={tipo} className="h-11 w-full rounded-xl border border-borda-forte bg-superficie px-3 text-[14px]">
              <option value="">Todos</option>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-texto">Área</span>
            <select name="area" defaultValue={area} className="h-11 w-full rounded-xl border border-borda-forte bg-superficie px-3 text-[14px]">
              <option value="">Todas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className={BOTAO_COMPACTO}>Filtrar</button>
            <Link prefetch={false} href="/manuais#lista" className={clsx(BOTAO_COMPACTO, "bg-transparent")}>Limpar</Link>
          </div>
        </form>

        {!itens.length ? (
          <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">Nenhum manual com estes filtros.</p>
        ) : (
          <>
            {/* celular: cartões (sem rolagem de tabela) */}
            <ul className="space-y-3 sm:hidden">
              {itens.map((x) => (
                <li key={x.chave} className="space-y-2 rounded-cartao border border-borda bg-superficie p-4">
                  <a href={x.abrir} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 font-medium hover:text-acao">
                    <span className="min-w-0 break-words">{x.titulo}</span><ExternalLink className="mt-1 size-3.5 shrink-0 text-texto-3" aria-hidden />
                    <span className="sr-only">(abre em nova aba)</span>
                  </a>
                  <div className="text-[13px] text-texto-2">{x.tag} · {x.campo}</div>
                  {x.nome && <div className="text-[12.5px] text-texto-3">{x.nome}</div>}
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-texto-3">
                    <Selo cor={x.tipo === "Link" ? "azul" : "cinza"}>{x.tipo}</Selo>
                    <span>{x.data} · {x.por}</span>
                    {x.origem && <span>· {x.origem}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {verFicha && <Link prefetch={false} href={ficha(x.tag)} className={BOTAO_COMPACTO}>Ficha do equipamento</Link>}
                    {edita && <RemoverManual eq={x.tag} id={x.id} titulo={x.titulo} />}
                  </div>
                </li>
              ))}
            </ul>
            {/* computador: tabela */}
            <div className="hidden sm:block">
              <TabelaT colunas={[
                { rotulo: "Equipamento", dica: verFicha ? "Abre a ficha do equipamento" : undefined },
                { rotulo: "Campo / denominação" },
                { rotulo: "Manual", larga: true },
                { rotulo: "Tipo" },
                { rotulo: "Origem" },
                { rotulo: "Enviado em" },
                { rotulo: "Quem enviou" },
                { rotulo: edita ? "Remover" : "" },
              ]} linhas={linhasManuais} />
            </div>
          </>
        )}
        <Paginacao params={params} pag={pag.pag} paginas={pag.paginas} total={pag.total} inicio={pag.inicio} mostrados={pag.itens.length} rotulo="vínculos" />
      </section>

      {/* 4. sem manual */}
      <section aria-labelledby="semmanual" className="space-y-4">
        <div>
          <h2 id="semmanual" className="font-display text-[20px] font-medium">Sem manual <span className="text-texto-3">({inteiroBr(semManual.length)})</span></h2>
          <p className="mt-1 text-[13px] text-texto-3">Equipamentos ativos sem nenhum manual. Mostra até {LIMITE_SEM_MANUAL}; filtre pela área para ver outros.</p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2" role="search">
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="area" value={area} />
          <label className="block min-w-[200px]">
            <span className="mb-1.5 block text-[13px] font-semibold text-texto">Área</span>
            <select name="sem" defaultValue={sem} className="h-11 w-full rounded-xl border border-borda-forte bg-superficie px-3 text-[14px]">
              <option value="">Todas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <button type="submit" className={BOTAO_COMPACTO}>Filtrar</button>
        </form>
        {!semManual.length ? (
          <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">Todos os equipamentos ativos já têm manual.</p>
        ) : (
          <>
            <ul className="space-y-3 sm:hidden">
              {semManual.slice(0, LIMITE_SEM_MANUAL).map((x) => (
                <li key={x.codigo} className="space-y-2 rounded-cartao border border-borda bg-superficie p-4">
                  <div className="font-mono text-[13px] font-medium text-acao">{x.codigo}</div>
                  <div className="text-[13.5px]">{x.campo || "—"}</div>
                  {x.nome && <div className="text-[12.5px] text-texto-3">{x.nome}</div>}
                  <div className="text-[12.5px] text-texto-3">Área: {x.area || "—"}</div>
                  <div className="flex flex-wrap gap-2">
                    {verFicha && <Link prefetch={false} href={ficha(x.codigo)} className={BOTAO_COMPACTO}>Ficha</Link>}
                    {edita && <Link prefetch={false} scroll={false} href={`/manuais?${new URLSearchParams({ vincular: x.codigo })}#vincular`} className={clsx(BOTAO_COMPACTO, "min-h-11")}>Vincular</Link>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block">
              <TabelaT colunas={[
                { rotulo: "Equipamento" }, { rotulo: "Campo / denominação" }, { rotulo: "Área" }, { rotulo: edita ? "Ação" : "" },
              ]} linhas={semManual.slice(0, LIMITE_SEM_MANUAL).map((x) => ({
                chave: x.codigo,
                href: verFicha ? ficha(x.codigo) : undefined,
                celulas: [
                  x.codigo,
                  <span key="n" className="block max-w-[320px] truncate">{x.campo || "—"}<span className="block truncate text-[12px] text-texto-3">{x.nome}</span></span>,
                  x.area || "—",
                  edita ? <Link key="v" prefetch={false} scroll={false} href={`/manuais?${new URLSearchParams({ vincular: x.codigo })}#vincular`} className={BOTAO_COMPACTO}>Vincular</Link> : "",
                ],
              }))} />
            </div>
          </>
        )}
        {semManual.length > LIMITE_SEM_MANUAL && <p className="text-[12.5px] text-texto-3">Mostrando {LIMITE_SEM_MANUAL} de {inteiroBr(semManual.length)}.</p>}
      </section>
    </Pagina>
  );
}
