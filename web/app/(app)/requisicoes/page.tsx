import type { Metadata } from "next";

import { Barras, Grafico } from "@/components/graficos";
import { Aviso, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { brl, brlCurto, inteiro } from "@/lib/formato";
import { bases } from "@/lib/wcm/dados";
import { descrever } from "@/lib/wcm/filtros";
import type { Requisicao } from "@/lib/wcm/preparo";
import { dataBr } from "@/lib/wcm/util";
import { Baixar, query } from "../ordens/_comum/Baixar";
import { FiltrosLocais } from "../ordens/_comum/FiltrosLocais";
import { Numeros } from "../ordens/_comum/Numeros";
import { TabelaDados } from "../ordens/_comum/TabelaDados";
import { faixaDe, href, paginar, type Params } from "../ordens/_comum/url";
import { COLUNAS, FAIXAS_ESPERA, PERIODOS, filtrar, lerFiltro, linha, ordenarReq, paraIso } from "./dados";

export const metadata: Metadata = { title: "Requisições" };
export const dynamic = "force-dynamic";

/** Topo da escala com folga para o rótulo de valor na ponta da barra (R$ é mais longo). */
const folga = (xs: [string, number][]) => Math.max(1, ...xs.map(([, v]) => v)) * 1.18;

function Moldura({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1320px] space-y-10 px-4 py-8 sm:px-8">{children}</div>;
}

export default async function Requisicoes(props: { searchParams: Promise<Params> }) {
  await exigir("requisicoes");
  const params = await props.searchParams;
  const b = await bases();
  const todas = b.requisicoes.dados;
  if (!todas) return <Moldura><Cabecalho titulo="Requisições de compra" /><SemDados base="Requisições de compra" /></Moldura>;
  const f = lerFiltro(params, b.hoje);
  const { filtradas, fora } = filtrar(todas, f);
  const { lista, ord, desc } = ordenarReq(filtradas, params);
  const { itens, pagina, paginas } = paginar(lista, params.pag);
  const pend = filtradas.filter((r) => r.pendente);
  const soma = (xs: Requisicao[]) => xs.reduce((s, r) => s + r.total, 0);
  const maisAntiga = Math.max(-1, ...pend.map((r) => r.diasAguardando ?? -1));
  const conta = (f: (r: Requisicao) => string) => {
    const m = new Map<string, number>();
    for (const r of todas) { const v = f(r); if (v) m.set(v, (m.get(v) ?? 0) + 1); }
    return [...m.keys()].sort((a, b) => a.localeCompare(b, "pt-BR")).map((v) => ({ valor: v, n: m.get(v) }));
  };
  const periodoTxt = f.ini == null && f.fim == null ? "todo o histórico" : descrever(f.ini ?? f.fim!, f.fim ?? b.hoje);

  // gráficos
  const somaPor = (xs: Requisicao[], k: (r: Requisicao) => string) => {
    const m = new Map<string, number>();
    for (const r of xs) m.set(k(r), (m.get(k(r)) ?? 0) + r.total);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const porStatus = somaPor(filtradas, (r) => r.status || "(sem status)");
  const porAprovador = somaPor(pend, (r) => r.aprovador || "(sem aprovador)");
  const espera = FAIXAS_ESPERA.map(() => ({ n: 0, valor: 0 }));
  for (const r of pend) if (r.diasAguardando != null) { const i = faixaDe(r.diasAguardando, FAIXAS_ESPERA); espera[i].n++; espera[i].valor += r.total; }

  return (
    <Moldura>
      <Cabecalho titulo="Requisições de compra," destaque="o que espera aprovação, com quem e há quanto tempo." sobre="Custos e suprimentos"
        subtitulo={`Período pelo “Enviado em”: ${periodoTxt}. Os filtros de área e centro não se aplicam às requisições.`} />

      <Secao titulo="Requisições" destaque="do filtro" acoes={<Baixar href={`/api/requisicoes?${query(params, ["pag"])}`}>Baixar requisições (CSV)</Baixar>}>
        <FiltrosLocais campos={[
          { tipo: "busca", chave: "q", placeholder: "Nº da requisição ou PO, item, justificativa, solicitante…" },
          { tipo: "segmentos", chave: "per", opcoes: PERIODOS, padrao: "mes", limpa: ["de", "ate"], atual: f.per || "—" },
          { tipo: "datas", de: "de", ate: "ate", rotulo: "Enviado em", padraoDe: f.ini != null ? paraIso(f.ini) : "", padraoAte: f.fim != null ? paraIso(f.fim) : "", limpa: ["per"] },
          { tipo: "alternar", chave: "pend", rotulo: "Só pendentes de aprovação", padrao: true },
          { tipo: "multi", chave: "apr", rotulo: "Aprovador atual", opcoes: conta((r) => r.aprovador) },
          { tipo: "multi", chave: "sol", rotulo: "Solicitado por", opcoes: conta((r) => r.solicitante) },
        ]} />

        {fora.length > 0 && (
          <Aviso><b>{inteiro(fora.length)} requisição(ões) pendente(s)</b> ({brl(soma(fora))}) foram enviadas fora do período escolhido —{" "}
            <a href={href(params, { per: "tudo", de: null, ate: null, pag: null })} className="font-medium underline">ver tudo</a>.</Aviso>
        )}

        <Numeros colunas={4} itens={[
          { rotulo: "Aguardando aprovação", valor: brlCurto(soma(pend)), detalhe: `${inteiro(pend.length)} requisições · ${brl(soma(pend))}`, dica: "Status com “pendente”" },
          { rotulo: "Total no filtro", valor: brlCurto(soma(filtradas)), detalhe: `${inteiro(filtradas.length)} requisições` },
          { rotulo: "Mais antiga pendente", valor: maisAntiga >= 0 ? `${inteiro(maisAntiga)} dias` : "—", dica: "Dias desde o último envio (ou o envio)", alerta: maisAntiga > 7 },
          { rotulo: "Pendentes há mais de 7 dias", valor: inteiro(pend.filter((r) => (r.diasAguardando ?? 0) > 7).length) },
        ]} />

        {filtradas.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Grafico className="min-w-0" titulo="Valor por status" subtitulo="Soma do total das requisições do filtro"
              tabela={{ colunas: ["Status", "Total"], linhas: porStatus.map(([k, v]) => [k, brl(v)]) }}>
              <Barras formato="R$" larguraRotulo={200} max={folga(porStatus)} itens={porStatus.slice(0, 10).map(([k, v]) => ({ rotulo: k, valor: v }))} />
            </Grafico>
            <Grafico className="min-w-0" titulo="Pendente por aprovador" subtitulo="Gargalos · os 10 com mais valor parado"
              tabela={{ colunas: ["Aprovador", "Total pendente"], linhas: porAprovador.map(([k, v]) => [k, brl(v)]) }}>
              {porAprovador.length ? <Barras formato="R$" larguraRotulo={200} max={folga(porAprovador)} itens={porAprovador.slice(0, 10).map(([k, v]) => ({ rotulo: k, valor: v, cor: "serie-2" }))} />
                : <p className="text-[13px] text-texto-3">Nada pendente no filtro.</p>}
            </Grafico>
            {pend.length > 0 && (
              <Grafico className="min-w-0 lg:col-span-2" titulo="Há quanto tempo esperam" subtitulo="Pendentes por dias aguardando aprovação — valor parado em cada faixa"
                tabela={{ colunas: ["Espera", "Requisições", "Total"], linhas: FAIXAS_ESPERA.map(([r], i) => [r, espera[i].n, brl(espera[i].valor)]) }}>
                <Barras formato="R$" larguraRotulo={130} max={folga(espera.map((e) => ["", e.valor]))} itens={FAIXAS_ESPERA.map(([r], i) => ({ rotulo: r, valor: espera[i].valor, detalhe: `${espera[i].n} req.`,
                  cor: (["st-bom", "st-atencao", "st-serio", "st-critico"] as const)[i] }))} />
              </Grafico>
            )}
          </div>
        )}

        <TabelaDados colunas={COLUNAS} linhas={itens.map(linha)} params={params} ord={ord} desc={desc} pagina={pagina} paginas={paginas}
          total={lista.length} rotulo="requisições" vazio="Nenhuma requisição no filtro." />
        <p className="text-[12px] text-texto-3">Pendentes primeiro, maior valor primeiro · dias aguardando contados até hoje ({dataBr(b.hoje)}).</p>
      </Secao>
    </Moldura>
  );
}
