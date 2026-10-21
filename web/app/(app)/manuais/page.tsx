import clsx from "clsx";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BOTAO_COMPACTO, Cabecalho, Pagina, Selo } from "@/components/ui";
import { podeEditar, veInteira } from "@/lib/auth/acesso";
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

/**
 * Manuais: vincula um manual (arquivo ou link) a um ou mais equipamentos e lista todos os vínculos. Usa a mesma
 * biblioteca da ficha do equipamento (Equipamentos › Biblioteca do ativo). Universo: os equipamentos do IH08 que
 * não estão desativados.
 */
export default async function Manuais(props: { searchParams: Promise<Params> }) {
  const u = await exigir("manuais");
  const params = await props.searchParams;
  const edita = veInteira(u, "equipamentos") && podeEditar(u);
  const q = um(params, "q"), tipo = um(params, "tipo") as TipoManual | "", area = um(params, "area"), sem = um(params, "sem");
  const vincular = um(params, "vincular").trim();

  const c = await contexto({});
  const [inv, vinculos, campoEq] = await Promise.all([inventarioAtivos(c), todosDocumentosEquipamentos(), campoDoEquipamento(c)]);
  const todos: EquipamentoManual[] = inv.map((x) => ({ codigo: x.codigo, nome: x.equipamento || "", campo: campoEq(x.codigo) || "", area: x.area || "" }));
  const ativos = inv.filter((x) => x.situacao !== DESATIVADO && x.origem !== "Site").map((x) => ({ codigo: x.codigo, area: x.area || "" }));
  const codigosAtivos = new Set(ativos.map((a) => a.codigo));
  const ativosTela = todos.filter((x) => codigosAtivos.has(x.codigo));
  const resumo = resumoManuais(ativos, vinculos);
  const manuais = vinculos.filter((v) => !v.doc.origem).length;
  const areas = [...new Set(ativosTela.map((x) => x.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const filtrados = filtrarManuais(vinculos, { q, tipo: tipo || undefined, area }, todos);
  const pag = paginar(filtrados, Number(um(params, "pag")));
  const semManual = equipamentosSemManual(ativosTela, vinculos, sem);
  const linhas: LinhaT[] = pag.itens.map(({ tag, doc }) => {
    const eq = todos.find((x) => x.codigo === tag);
    const abrir = doc.tipo === "link" ? doc.url! : `/api/equipamentos/documento?${new URLSearchParams({ eq: tag, id: doc.id })}`;
    const ficha = `/equipamentos/biblioteca?${new URLSearchParams({ eq: tag })}`;
    return {
      chave: `${tag}|${doc.id}`,
      href: ficha,
      celulas: [
        tag,
        <span key="eq" className="block max-w-[260px] truncate">{eq?.campo || "—"}<span className="block truncate text-[12px] text-texto-3">{eq?.nome || ""}</span></span>,
        <a key="t" href={abrir} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-[320px] items-center gap-1 font-medium hover:text-acao">
          <span className="truncate">{doc.titulo}</span><ExternalLink className="size-3.5 shrink-0 text-texto-3" aria-hidden />
          <span className="sr-only">(abre em nova aba)</span>
        </a>,
        <Selo key="s" cor={doc.tipo === "link" ? "azul" : "cinza"}>{doc.tipo === "link" ? "Link" : doc.tipo === "application/pdf" ? "PDF" : "Imagem"}</Selo>,
        doc.origem ? <span key="o" className="text-[12px] text-texto-3">Mesmo arquivo de {doc.origem.tag}</span> : "—",
        <span key="d" className="whitespace-nowrap">{new Date(doc.em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>,
        doc.por || "—",
        edita ? <RemoverManual key="r" eq={tag} id={doc.id} titulo={doc.titulo} /> : "",
      ],
    };
  });

  const acervo = ACERVO.map((a) => ({ titulo: a.titulo, url: a.url, fonte: a.fonte, area: a.area }));

  return (
    <Pagina>
      <Cabecalho titulo="Manuais" subtitulo="Vincule manuais e links aos equipamentos. Os mesmos aparecem na ficha de cada equipamento (Biblioteca do ativo)." />

      {/* 1. números */}
      <section aria-labelledby="numeros" className="space-y-4">
        <h2 id="numeros" className="font-display text-[20px] font-medium">Cobertura</h2>
        <GradeNumeros colunas={4}>
          <Numero rotulo="Manuais cadastrados" valor={inteiroBr(manuais)} detalhe="arquivos e links (sem as referências)" />
          <Numero rotulo="Equipamentos com manual" valor={inteiroBr(resumo.comManual)} detalhe={`de ${inteiroBr(ativos.length)} equipamentos ativos`} />
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
        <TabelaT colunas={[
          { rotulo: "Equipamento", dica: "Abre a ficha do equipamento" },
          { rotulo: "Campo / denominação" },
          { rotulo: "Manual", larga: true },
          { rotulo: "Tipo" },
          { rotulo: "Origem" },
          { rotulo: "Enviado em" },
          { rotulo: "Quem enviou" },
          { rotulo: edita ? "Remover" : "" },
        ]} linhas={linhas} vazio="Nenhum manual com estes filtros." />
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
        <TabelaT colunas={[
          { rotulo: "Equipamento" }, { rotulo: "Campo / denominação" }, { rotulo: "Área" }, { rotulo: edita ? "Ação" : "" },
        ]} linhas={semManual.slice(0, LIMITE_SEM_MANUAL).map((x) => ({
          chave: x.codigo,
          celulas: [
            <Link key="c" prefetch={false} href={`/equipamentos/biblioteca?${new URLSearchParams({ eq: x.codigo })}`} className="font-mono text-[12.5px] font-medium text-acao underline-offset-2 hover:underline">{x.codigo}</Link>,
            <span key="n" className="block max-w-[320px] truncate">{x.campo || "—"}<span className="block truncate text-[12px] text-texto-3">{x.nome}</span></span>,
            x.area || "—",
            edita ? <Link key="v" prefetch={false} scroll={false} href={`/manuais?${new URLSearchParams({ vincular: x.codigo })}#vincular`} className={BOTAO_COMPACTO}>Vincular</Link> : "",
          ],
        }))} vazio="Todos os equipamentos ativos já têm manual." />
        {semManual.length > LIMITE_SEM_MANUAL && <p className="text-[12.5px] text-texto-3">Mostrando {LIMITE_SEM_MANUAL} de {inteiroBr(semManual.length)}.</p>}
      </section>
    </Pagina>
  );
}
