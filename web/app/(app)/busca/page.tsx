import clsx from "clsx";
import { ArrowRight, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Tabela } from "@/components/graficos";
import { Cabecalho, Selo } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { estoque as lerEstoque } from "@/lib/dados/bases";
import { brl, inteiro } from "@/lib/formato";
import * as busca from "@/lib/wcm/busca";
import { contexto, dados, type Contexto } from "@/lib/wcm/contexto";
import * as ind from "@/lib/wcm/indicadores";
import * as saude from "@/lib/wcm/saude";
import { dataBr } from "@/lib/wcm/util";
import { assinatura, guardado } from "../ordens/_comum/cache";
import { FiltrosLocais } from "../ordens/_comum/FiltrosLocais";
import { GavetaUrl } from "../ordens/_comum/GavetaUrl";
import { TabelaDados, type Coluna, type Linha, type TipoColuna } from "../ordens/_comum/TabelaDados";
import { href, um, type Params } from "../ordens/_comum/url";

export const metadata: Metadata = { title: "Buscar" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Tipo de cada coluna na tabela de resultados. */
const TIPO: Record<string, TipoColuna> = {
  data: "data", fim: "data", dataFalha: "data", custoReal: "R$", valor: "R$", estoque: "int", quebra: "bool", descricao: "longo",
  texto: "longo", resumo: "longo", ordem: "codigo", nota: "codigo", equipamento: "codigo", equipChave: "codigo", material: "codigo",
  plano: "codigo", numero: "codigo",
};
const CELULAR: Record<busca.Categoria, string[]> = {
  Ordens: ["ordem", "texto", "situacao", "data"], Notas: ["nota", "descricao", "data"], Equipamentos: ["equipamento", "denominacao", "criticidade"],
  Materiais: ["material", "descricao", "estoque"], Planos: ["plano", "texto", "data"], "Análises de falha": ["numero", "resumo", "situacao"],
};
const ROTULO_FIM: Record<string, string> = { fim: "Prazo" };
/** Coluna do equipamento em cada categoria: a coluna "Campo de ordenação" (do equipamento) entra logo antes dela. */
const COL_EQUIP: Partial<Record<busca.Categoria, string>> = { Ordens: "equipChave", Notas: "equipChave", Equipamentos: "equipamento",
  Planos: "equipamento", "Análises de falha": "equipamento" };
/** Código do equipamento de uma linha de resultado (a chave de ordens e notas; o equipamento nas demais). */
const codigoDe = (l: Linha) => txt(l.equipChave || l.codigoSap || l.equipamento || l.objeto); // AF: o código está no codigoSap

function Moldura({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1320px] space-y-8 px-4 py-8 sm:px-8">{children}</div>;
}

async function buscar(c: Contexto, termo: string): Promise<busca.ResultadoBusca> {
  const est = await lerEstoque();
  return guardado(`busca|${assinatura(c.b)}|${est.atualizado}|${busca.normalizar(termo)}`, () => busca.buscar(termo, {
    ordens: c.b.ordens.dados, notas: c.b.notas.dados, equip: c.b.equipamentos.dados, cadEq: c.cad.equipamentos, estoque: est.dados,
    chamadas: c.chamadas?.map((x) => ({ plano: x.plano, texto: x.texto, data: x.data, situacao: x.situacao, ordem: x.ordem,
      equipamento: x.equipamento, objeto: x.objeto, centroTrabalho: x.centroTrabalho })),
    afs: c.afs,
  }));
}

export default async function Buscar(props: { searchParams: Promise<Params> }) {
  await exigir("busca");
  const params = await props.searchParams;
  const termo = um(params.q).trim();
  const valido = busca.normalizar(termo).replace(/ /g, "").length >= 2;
  const c = valido ? await contexto({}) : null;
  const res = c ? await buscar(c, termo) : null;
  const campoEq = c ? await campoDoEquipamento(c) : null;
  const total = res ? busca.totalDeResultados(res) : 0;
  const com = res ? busca.CATEGORIAS.filter((k) => res[k].length) : [];
  const cat = (com.includes(um(params.cat) as busca.Categoria) ? um(params.cat) : com[0]) as busca.Categoria | undefined;

  return (
    <Moldura>
      <Cabecalho titulo="Buscar," destaque="um número ou palavra em todas as bases de uma vez." sobre="Visão geral"
        subtitulo="Ordens, notas, equipamentos, materiais, planos e análises de falha — sem filtro de período nem de área. Todas as palavras precisam aparecer (sem diferença de acento); número exato vem primeiro." />

      <FiltrosLocais limpar={["cat", "sel"]} campos={[{ tipo: "busca", chave: "q", placeholder: "Nº da ordem, nota, equipamento, material, plano, AF, texto…" }]} />

      {!valido && <p className="text-[13.5px] text-texto-3">Digite ao menos 2 caracteres.</p>}
      {valido && !total && (
        <div className="flex flex-col items-center gap-3 rounded-cartao border border-borda bg-superficie py-12 text-center">
          <SearchX className="size-8 text-texto-4" strokeWidth={1.5} />
          <p className="text-[14px] text-texto-2">Nada encontrado para <b className="font-medium">{termo}</b>.</p>
        </div>
      )}
      {res && cat && c && campoEq && (
        <div className="space-y-4">
          <p className="text-[13px] text-texto-3"><b className="num font-medium text-texto">{inteiro(total)}</b> resultado(s) — até {busca.LIMITE} por tipo</p>
          <nav className="flex flex-wrap gap-1" aria-label="Tipos de resultado">
            {com.map((k) => (
              <Link prefetch={false} key={k} href={href(params, { cat: k, sel: null })} scroll={false} aria-current={k === cat ? "page" : undefined}
                className={clsx("rounded-full px-4 py-2 text-[13.5px] transition", k === cat ? "bg-superficie-3 font-medium text-texto" : "text-texto-3 hover:text-texto")}>
                {k} <span className="num text-[12px] text-texto-3">{inteiro(res[k].length)}{res[k].length >= busca.LIMITE ? "+" : ""}</span>
              </Link>
            ))}
          </nav>
          <Resultados cat={cat} res={res} params={params} campoEq={campoEq} />
          <p className="text-[12px] text-texto-3">Clique numa linha para ver os detalhes.</p>
          {um(params.sel) !== "" && <Detalhe c={c} cat={cat} linha={(res[cat] as unknown as Linha[])[Number(um(params.sel))]} campoEq={campoEq} />}
        </div>
      )}
    </Moldura>
  );
}

function Resultados({ cat, res, params, campoEq }: { cat: busca.Categoria; res: busca.ResultadoBusca; params: Params;
  campoEq: (codigo: string | null | undefined) => string }) {
  // o campo de ordenação do próprio IW38 (da ordem) sai: a coluna mostra o do equipamento, antes da coluna dele
  const colunas: Coluna[] = [];
  for (const [k, r] of busca.COLUNAS[cat] as [string, string][]) {
    if (k === "campoOrdenacao") continue;
    if (k === COL_EQUIP[cat]) colunas.push({ chave: "campoEquip", rotulo: "Campo de ordenação" });
    colunas.push({ chave: k, rotulo: ROTULO_FIM[k] ?? r, tipo: TIPO[k], celular: CELULAR[cat].includes(k) });
  }
  const linhas: Linha[] = (res[cat] as unknown as Linha[]).map((l) => ({ ...l, campoEquip: COL_EQUIP[cat] ? campoEq(codigoDe(l)) : "" }));
  const indice = new Map(linhas.map((l, i) => [l, i]));
  const sel = um(params.sel);
  return (
    <TabelaDados colunas={colunas} linhas={linhas} params={params} pagina={1} paginas={1} total={linhas.length} porPagina={busca.LIMITE}
      ordenavel={false} alturaMax rotulo="resultados" hrefLinha={(l) => href(params, { sel: indice.get(l) ?? 0 })}
      ativa={(l) => String(indice.get(l)) === sel} />
  );
}

function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-borda bg-superficie-2 p-3">
      <div className="text-[12px] text-texto-3">{rotulo}</div>
      <div className="num mt-0.5 text-[15px] font-medium text-texto">{children}</div>
    </div>
  );
}

function Ir({ href: h, children }: { href: string; children: React.ReactNode }) {
  return <Link prefetch={false} href={h} className="inline-flex items-center gap-1 text-[13.5px] font-medium text-texto-2 hover:text-texto">{children} <ArrowRight className="size-3.5" /></Link>;
}

const ficha = (cod: string) => `/equipamentos?eq=${encodeURIComponent(cod)}`;
const n1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const txt = (v: unknown) => (v == null ? "" : String(v));

async function Detalhe({ c, cat, linha, campoEq }: { c: Contexto; cat: busca.Categoria; linha: Linha | undefined;
  campoEq: (codigo: string | null | undefined) => string }) {
  if (!linha) return null;
  const fechar = ["sel"];
  const campo = campoEq(codigoDe(linha));
  if (cat === "Ordens") {
    const o = (c.b.ordens.dados ?? []).find((x) => x.ordem === linha.ordem);
    if (!o) return null;
    const ops = (c.b.operacoes.dados ?? []).filter((x) => x.ordem === o.ordem);
    const ap = (c.b.confirmacoes.dados ?? []).filter((x) => x.ordem === o.ordem);
    const datas = ap.map((x) => x.data).filter((d): d is number => d != null);
    return (
      <GavetaUrl chaves={fechar} titulo={`Ordem ${o.ordem}`} subtitulo={`${o.tipo} · ${o.texto}`}>
        <div className="grid grid-cols-2 gap-3">
          <Info rotulo="Situação">{o.situacao}{o.atrasada && <Selo cor="vermelho" className="ml-2">atrasada</Selo>}</Info>
          <Info rotulo="Custo real">{brl(o.custoReal)}</Info>
          <Info rotulo="Data-base">{dataBr(o.inicio) || "—"}</Info>
          <Info rotulo="Prazo (fim-base)">{dataBr(o.fim) || "—"}</Info>
          <Info rotulo="Campo de ordenação">{campo || "—"}</Info>
        </div>
        <p className="text-[13px] text-texto-2">Equipamento <b className="font-medium">{o.equipChave || "—"}</b> {o.objeto} · centro {o.centroTrabalho || "—"} · {o.natureza} · status <code>{o.statusSistema || "—"}</code></p>
        {ops.length > 0 && <Tabela colunas={["Operação", "Texto", "Centro", "HH", "Pessoas", "Programada", "Fim real", "Status"]}
          linhas={ops.map((x) => [x.operacao, x.textoOperacao, x.centroTrabalho, n1.format(x.horas), x.pessoas, dataBr(x.inicio) || "—", dataBr(x.fimReal) || "—", x.statusSistema])} />}
        {ap.length > 0 && <p className="text-[13px] text-texto-3">Apontamentos (IW47): <b className="font-medium text-texto">{n1.format(ap.reduce((s, x) => s + x.horas, 0))} HH</b> por {new Set(ap.map((x) => x.np)).size} pessoa(s){datas.length ? `, de ${dataBr(Math.min(...datas))} a ${dataBr(Math.max(...datas))}` : ""}.</p>}
        <div className="flex flex-wrap gap-4">
          <Ir href={`/ordens?ordem=${encodeURIComponent(o.ordem)}`}>Abrir em Ordens</Ir>
          {o.equipChave && <Ir href={ficha(o.equipChave)}>Abrir ficha do equipamento</Ir>}
        </div>
      </GavetaUrl>
    );
  }
  if (cat === "Equipamentos") {
    const cod = txt(linha.equipamento);
    const s = (await saudeFabrica(c)).find((x) => x.codigo === cod);
    return (
      <GavetaUrl chaves={fechar} titulo={cod} subtitulo={txt(linha.denominacao)}>
        <div className="grid grid-cols-2 gap-3">
          <Info rotulo="Criticidade">{txt(linha.criticidade) || (linha.codigoAbc ? `ABC ${linha.codigoAbc}` : "—")}</Info>
          <Info rotulo="Localização">{txt(linha.localizacao) || "—"}</Info>
          <Info rotulo="Campo de ordenação">{campo || "—"}</Info>
        </div>
        {s ? (
          <div className="grid grid-cols-2 gap-3">
            <Info rotulo="Saúde (0–100)">{n1.format(s.saude)} <span className="text-[12.5px] font-normal text-texto-3">· {s.faixa}</span></Info>
            <Info rotulo="Risco">{n1.format(s.risco)}</Info>
            <Info rotulo="Principal causa">{s.principalCausa || "—"}</Info>
            <Info rotulo="Ordens atrasadas">{inteiro(s.backlogAtrasado)}</Info>
          </div>
        ) : <p className="text-[13px] text-texto-3">Sem ordens nos últimos 12 meses para calcular a saúde.</p>}
        <Ir href={ficha(cod)}>Abrir ficha do equipamento</Ir>
      </GavetaUrl>
    );
  }
  if (cat === "Materiais") {
    return (
      <GavetaUrl chaves={fechar} titulo={txt(linha.material)} subtitulo={txt(linha.descricao)}>
        <div className="grid grid-cols-2 gap-3">
          <Info rotulo="Estoque">{inteiro(Number(linha.estoque))} {txt(linha.um)}</Info>
          <Info rotulo="Valor">{brl(Number(linha.valor))}</Info>
        </div>
        <Ir href="/estoque">Abrir no Estoque</Ir>
      </GavetaUrl>
    );
  }
  if (cat === "Notas") {
    const eq = txt(linha.equipChave);
    return (
      <GavetaUrl chaves={fechar} titulo={`Nota ${linha.nota}`} subtitulo={`${txt(linha.tipoNota)} · ${txt(linha.descricao)}`}>
        <div className="grid grid-cols-2 gap-3">
          <Info rotulo="Data">{dataBr(linha.data as number | null) || "—"}</Info>
          <Info rotulo="Ordem">{txt(linha.ordem) || "sem ordem"}{linha.quebra ? <Selo cor="laranja" className="ml-2">quebra</Selo> : null}</Info>
          <Info rotulo="Campo de ordenação">{campo || "—"}</Info>
        </div>
        <p className="text-[13px] text-texto-2">Equipamento {eq || "—"} {txt(linha.objeto)} · centro {txt(linha.centroTrabalho) || "—"}</p>
        <div className="flex flex-wrap gap-4">
          {linha.ordem ? <Ir href={`/ordens?ordem=${encodeURIComponent(txt(linha.ordem))}`}>Abrir a ordem</Ir> : null}
          {eq && <Ir href={ficha(eq)}>Abrir ficha do equipamento</Ir>}
        </div>
      </GavetaUrl>
    );
  }
  if (cat === "Planos") {
    return (
      <GavetaUrl chaves={fechar} titulo={`Plano ${linha.plano}`} subtitulo={txt(linha.texto)}>
        <div className="grid grid-cols-2 gap-3">
          <Info rotulo="Chamada">{dataBr(linha.data as number | null) || "—"}</Info>
          <Info rotulo="Situação">{txt(linha.situacao) || "—"}</Info>
          <Info rotulo="Ordem">{txt(linha.ordem) || "—"}</Info>
          <Info rotulo="Equipamento">{txt(linha.equipamento) || "—"}</Info>
          <Info rotulo="Campo de ordenação">{campo || "—"}</Info>
        </div>
        <Ir href={`/planos?q=${encodeURIComponent(txt(linha.plano))}`}>Abrir em Planos</Ir>
      </GavetaUrl>
    );
  }
  return (
    <GavetaUrl chaves={fechar} titulo={txt(linha.numero)} subtitulo={`${txt(linha.equipamento)} · ${txt(linha.resumo)}`}>
      <div className="grid grid-cols-2 gap-3">
        <Info rotulo="Situação">{txt(linha.situacao) || "—"}</Info>
        <Info rotulo="Data da falha">{dataBr(linha.dataFalha as number | null) || "—"}</Info>
        <Info rotulo="Criticidade">{txt(linha.criticidade) || "—"}</Info>
        <Info rotulo="OS corretiva">{txt(linha.osCorretiva) || "—"}</Info>
        <Info rotulo="Campo de ordenação">{campo || "—"}</Info>
      </div>
      <p className="text-[13px] text-texto-2">Causa raiz: {txt(linha.causaRaiz) || "—"}</p>
      <Ir href={`/af_planos?q=${encodeURIComponent(txt(linha.numero))}`}>Abrir em Planos de AF</Ir>
    </GavetaUrl>
  );
}

/** Saúde dos ativos da fábrica inteira (sem o recorte). */
async function saudeFabrica(c: Contexto): Promise<saude.LinhaSaude[]> {
  const d = await dados(c, { areas: [], centros: [], tipos: [] });
  return guardado(`busca-saude|${assinatura(c.b)}`, () => {
    let anomalias: saude.AnomaliaSaude[] = [];
    try { anomalias = ind.anomaliasSemeq(d); } catch { anomalias = []; }
    return saude.calcular(d.ordens, d.hoje, { quebras: ind.quebras(d), afs: d.afs, chamadas: d.chamadas, anomalias,
      equip: c.b.equipamentos.dados, cadEq: c.cad.equipamentos });
  });
}

