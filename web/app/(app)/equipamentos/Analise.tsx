import { Pencil, Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { Colunas, Grafico, Legenda } from "@/components/graficos";
import { SemDados } from "@/components/PaginaWcm";
import { Selo } from "@/components/ui";
import { brl } from "@/lib/formato";
import * as ativos from "@/lib/wcm/ativos";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { dados, type Contexto } from "@/lib/wcm/contexto";
import { descrever } from "@/lib/wcm/filtros";
import * as ind from "@/lib/wcm/indicadores";
import { NAT_BACKLOG, NAT_PLANO, PENDENTES } from "@/lib/wcm/preparo";
import { dataBr, partes } from "@/lib/wcm/util";

import { FABRICA } from "../saude/calculo";
import { Cartao, GradeNumeros, inteiroBr, Numero, Paginacao, TabelaT } from "./_ui/Blocos";
import { FiltrosUrl } from "./_ui/FiltrosUrl";
import { hrefCom, type Params } from "./_ui/url";
import { infoCad, mapaEstoque, pecasDe, type MapaEstoque } from "./dados";
import { agregarAnalise, CRITICIDADES, filtrarAnalise, intervaloMedio, lerFiltroAnalise, NAO_CLASSIFICADO, paginar, param, ROTULO_CAMPO, V_CADASTRO } from "./logica";
import { SeloPeca } from "./SeloPeca";

/** Visão "Análise pelas ordens (IW38)": uma linha por equipamento no recorte e a ficha do equipamento. */

const SELO_CRIT: Record<string, "vermelho" | "laranja" | "verde"> = { Alta: "vermelho", "Média": "laranja", Baixa: "verde" };
const n1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export async function Analise({ c, params, cadastra }: { c: Contexto; params: Params; cadastra: boolean }) {
  if (!c.b.ordens.dados) return <SemDados base="IW38 (ordens)" />;
  const [d, est, campoEq] = await Promise.all([dados(c), mapaEstoque(), campoDoEquipamento(c)]);
  const sel = param(params, "eq").toUpperCase();
  const tab = agregarAnalise(d.ordens, c.f.ini, c.f.fim, {
    cadEq: c.cad.equipamentos, equip: c.b.equipamentos.dados, notas: c.b.notas.dados, pecas: (k) => pecasDe(c, k, est), extra: sel || undefined,
  });
  const f = lerFiltroAnalise(params);
  const vis = filtrarAnalise(tab, f, campoEq);
  const pg = paginar(vis, Number(param(params, "pag")) || 1);
  const temNotas = !!c.b.notas.dados;
  const temIh08 = !!c.b.equipamentos.dados;
  const periodo = descrever(c.f.ini, c.f.fim);
  const cols = [
    { rotulo: ROTULO_CAMPO }, { rotulo: "Código" }, { rotulo: "Nome", larga: true }, { rotulo: "Criticidade" }, { rotulo: "ABC" }, { rotulo: "Categoria" }, { rotulo: "Local" },
    { rotulo: "Centro" }, { rotulo: "Ordens no período", dir: true }, { rotulo: "Backlog", dir: true, dica: "Ordens sem plano de manutenção no período" },
    { rotulo: "Custo no período", dir: true }, { rotulo: "Pendentes", dir: true, dica: "Ordens abertas, liberadas ou encerradas sem confirmação (todas as datas)" },
    ...(temNotas ? [{ rotulo: "Notas", dir: true }, { rotulo: "Notas sem ordem", dir: true }, { rotulo: "Quebras", dir: true }] : []),
    { rotulo: "Última ordem" }, { rotulo: "Peças", dir: true }, { rotulo: "Peças em falta", dir: true, dica: "Peças vinculadas sem estoque ou abaixo do mínimo" },
  ];
  const opcoesFicha = [...tab].sort((a, b) => b.custo - a.custo).slice(0, 400);
  return (
    <div className="space-y-6">
      <GradeNumeros>
        <Numero rotulo="Equipamentos com ordens" valor={inteiroBr(tab.filter((x) => x.ordens > 0).length)} detalhe={`período: ${periodo}`} />
        <Numero rotulo="Criticidade alta" valor={inteiroBr(tab.filter((x) => x.criticidade === "Alta").length)}
          detalhe={temIh08 ? "classe A no SAP (IH08) ou cadastrada no site" : "cadastrada no site"} />
        <Numero rotulo="Com ordens pendentes" valor={inteiroBr(tab.filter((x) => x.pendentes > 0).length)} />
        <Numero rotulo="Com peça em falta" valor={inteiroBr(tab.filter((x) => x.pecasEmFalta > 0).length)} detalhe="peças vinculadas sem estoque / abaixo do mínimo"
          tom={tab.some((x) => x.pecasEmFalta > 0) ? "atencao" : undefined} />
      </GradeNumeros>

      <div className="space-y-3">
        <FiltrosUrl zerar={["eq"]} campos={[
          { tipo: "busca", param: "aq", placeholder: "Buscar código, nome ou local…" },
          { tipo: "multi", param: "acrit", rotulo: "Criticidade", opcoes: [...CRITICIDADES, NAO_CLASSIFICADO].map((x) => ({ valor: x, n: tab.filter((t) => (t.criticidade || NAO_CLASSIFICADO) === x).length })) },
          { tipo: "alternar", param: "apend", rotulo: "Só com pendências" },
          { tipo: "alternar", param: "aper", rotulo: "Só com ordens no período", padrao: true },
        ]} />
        <TabelaT colunas={cols} vazio="Nenhum equipamento com estes filtros."
          linhas={pg.itens.map((x) => ({
            chave: x.codigo, ativa: x.codigo === sel, href: hrefCom(params, { eq: x.codigo }, "ficha"),
            celulas: [campoEq(x.codigo) || "—", x.codigo, x.nome || "—", x.criticidade || <span className="text-texto-3">—</span>, x.abc || "—", x.categoria || "—", x.local || "—", x.centro || "—",
              x.ordens, x.backlog, brl(x.custo), x.pendentes, ...(temNotas ? [x.notas ?? 0, x.notasSemOrdem ?? 0, x.quebras ?? 0] : []),
              dataBr(x.ultima), x.pecas, x.pecasEmFalta],
          }))} />
        <Paginacao params={params} {...pg} mostrados={pg.itens.length} rotulo="equipamento(s)" baixar={`/api/equipamentos${hrefCom(params, { planilha: "analise", pag: null, eq: null })}`} />
      </div>

      <div id="ficha" className="scroll-mt-24 space-y-4 border-t border-borda pt-6">
        <Form action="/equipamentos" scroll={false} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="visao" value={String(params.visao ?? "")} />
          <label className="block min-w-0 flex-1 sm:max-w-md">
            <span className="mb-1.5 block text-[13px] font-medium text-texto-2">Ficha do equipamento</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-texto-3" />
              <input name="eq" list="eq-opcoes" defaultValue={sel} placeholder="Selecione na tabela acima ou digite o código…"
                className="h-11 w-full rounded-xl border border-borda bg-superficie-2 pl-9 pr-3 text-[14px] outline-none transition focus:border-marca-500 focus:bg-superficie" />
            </span>
            <datalist id="eq-opcoes">{opcoesFicha.map((x) => <option key={x.codigo} value={x.codigo}>{x.nome}</option>)}</datalist>
          </label>
          <button className="inline-flex h-11 items-center rounded-xl border border-borda bg-superficie px-4 text-[14px] font-medium transition hover:bg-superficie-2">Abrir ficha</button>
        </Form>
        {sel && (tab.some((x) => x.codigo === sel) || c.b.ordens.dados.some((o) => o.equipChave === sel))
          ? <Ficha c={c} sel={sel} nome={tab.find((x) => x.codigo === sel)?.nome ?? ""} campo={campoEq(sel)} est={est} cadastra={cadastra} />
          : sel ? <p className="text-[13px] text-texto-3">Equipamento <b>{sel}</b> não encontrado nas ordens, no IH08 nem no cadastro do site.</p> : null}
      </div>
    </div>
  );
}

async function Ficha({ c, sel, nome, campo, est, cadastra }: { c: Contexto; sel: string; nome: string; campo: string; est: MapaEstoque | null; cadastra: boolean }) {
  const hist = (c.b.ordens.dados ?? []).filter((o) => o.equipChave === sel).sort((a, b) => (b.data ?? -Infinity) - (a.data ?? -Infinity));
  const info = infoCad(c, sel);
  const temCad = sel in c.cad.equipamentos;
  const corr = hist.filter((o) => !o.comPlano && o.data != null);
  const intervalo = intervaloMedio(corr.map((o) => o.data!));
  const custoTotal = hist.reduce((s, o) => s + (Number.isNaN(o.custoReal) ? 0 : o.custoReal), 0);

  // confiabilidade: quebras da fábrica inteira (como no site atual), deste equipamento
  const dF = await dados(c, FABRICA);
  const qEq = ind.quebras(dF).filter((q) => q.equipChave === sel);
  const qPer = qEq.filter((q) => q.data != null && q.data >= c.f.ini && q.data <= c.f.fim);
  const diasPer = c.f.fim - c.f.ini + 1;
  const rep = qPer.map((q) => q.horasReparo).filter((h): h is number => h != null && h > 0);
  const ordensEq = new Set(hist.map((o) => o.ordem));
  const hh = c.b.confirmacoes.dados ? c.b.confirmacoes.dados.filter((x) => ordensEq.has(x.ordem)).reduce((s, x) => s + x.horas, 0) : null;

  // ordens por ano e natureza
  const anos = [...new Set(hist.filter((o) => o.data != null).map((o) => partes(o.data!).ano))].sort();
  const porAno = (nat: string) => anos.map((a) => hist.filter((o) => o.data != null && partes(o.data).ano === a && o.natureza === nat).length);
  const custoAno = anos.map((a) => hist.filter((o) => o.data != null && partes(o.data).ano === a).reduce((s, o) => s + (Number.isNaN(o.custoReal) ? 0 : o.custoReal), 0));
  const series = [{ nome: NAT_PLANO, valores: porAno(NAT_PLANO), cor: "serie-1" as const }, { nome: NAT_BACKLOG, valores: porAno(NAT_BACKLOG), cor: "serie-2" as const }];

  const notas = (c.b.notas.dados ?? []).filter((n) => n.equipChave === sel).sort((a, b) => (b.data ?? -Infinity) - (a.data ?? -Infinity));
  const eqSap = c.b.equipamentos.dados?.find((e) => e.equipamento === sel);
  const critSap = ativos.ABC_PARA_CRITICIDADE[(eqSap?.codigoAbc ?? "").toUpperCase()] ?? "";
  const pecas = pecasDe(c, sel, est);

  return (
    <div className="space-y-4">
      <h3 className="font-display text-[22px] font-medium tracking-[-0.02em]">{campo ? `${campo} · ` : ""}{nome || String(info.nome ?? "") || eqSap?.denominacao || "—"} <span className="tom2">· {sel}</span></h3>
      <GradeNumeros colunas={5}>
        <Numero rotulo="Ordens (todas as datas)" valor={inteiroBr(hist.length)} />
        <Numero rotulo="Custo total" valor={brl(custoTotal)} dica="Custo real de todas as ordens do equipamento no IW38." />
        <Numero rotulo="Backlog" valor={inteiroBr(corr.length)} detalhe={`${inteiroBr(hist.filter((o) => o.comPlano).length)} de plano de manutenção`} dica="Ordens sem plano de manutenção (todas as datas)." />
        <Numero rotulo="Intervalo médio do backlog" valor={intervalo != null ? `${Math.round(intervalo)} dias` : "—"}
          dica="Média de dias entre uma ordem de backlog (sem plano) e a seguinte (aproxima o MTBF)." />
        <Numero rotulo="Pendentes hoje" valor={inteiroBr(hist.filter((o) => PENDENTES.has(o.situacao)).length)} detalhe={`${inteiroBr(hist.filter((o) => o.atrasada).length)} atrasadas`} />
        <Numero rotulo="Quebras no período" valor={inteiroBr(qPer.length)} detalhe={`${inteiroBr(qEq.length)} em todas as datas`}
          dica="Notas Y1 da IW28 convertidas em ordem YM11 neste equipamento." tom={qPer.length ? "atencao" : undefined} />
        <Numero rotulo="MTBF no período" valor={qPer.length ? `${Math.round(diasPer / qPer.length)} dias` : "—"} dica="Dias do período ÷ quebras do equipamento no período." />
        <Numero rotulo="MTTR no período" valor={rep.length ? `${n1.format(rep.reduce((a, b) => a + b, 0) / rep.length)} h` : "—"} dica={ind.POR_ID.mttr.formula} />
        <Numero rotulo="Reincidências (≤ 30 dias)" valor={inteiroBr(qPer.filter((q) => q.reincidente).length)} dica="Quebras a até 30 dias da anterior no mesmo equipamento." />
        <Numero rotulo="HH apontadas (IW47)" valor={hh != null ? `${inteiroBr(hh)} h` : "—"} detalhe="nas ordens do IW38 deste equipamento" />
      </GradeNumeros>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-4">
          {anos.length > 0 && (
            <Grafico titulo="Ordens por ano" subtitulo="Plano de manutenção × backlog (sem plano) · todas as datas"
              legenda={<Legenda series={series} />}
              tabela={{ colunas: ["Ano", NAT_PLANO, NAT_BACKLOG, "Custo"], linhas: anos.map((a, i) => [String(a), series[0].valores[i], series[1].valores[i], brl(custoAno[i])]) }}>
              <Colunas rotulos={anos.map(String)} series={series} empilhar formato="inteiro" altura={200} rotular="todos" />
            </Grafico>
          )}
          <Cartao titulo="Histórico de ordens" sub={`${inteiroBr(hist.length)} ordens${hist.length > 300 ? " · as 300 mais recentes" : ""}`}>
            <TabelaT alta colunas={[{ rotulo: "Ordem" }, { rotulo: "Data" }, { rotulo: "Tipo" }, { rotulo: "Natureza" }, { rotulo: "Texto", larga: true }, { rotulo: "Situação" }, { rotulo: "Custo real", dir: true }]}
              linhas={hist.slice(0, 300).map((o) => ({ chave: o.ordem, celulas: [o.ordem, dataBr(o.data), o.tipo, o.natureza, o.texto, o.situacao, brl(o.custoReal)] }))} />
          </Cartao>
          {c.b.notas.dados && (
            <Cartao titulo="Notas do equipamento (IW28)"
              sub={`${inteiroBr(notas.length)} notas · ${inteiroBr(notas.filter((n) => n.quebra).length)} quebra(s) (Y1 → YM11) · ${inteiroBr(notas.filter((n) => !n.comOrdem).length)} sem ordem`}>
              {notas.length > 0 && (
                <TabelaT alta colunas={[{ rotulo: "Nota" }, { rotulo: "Data" }, { rotulo: "Tipo de nota" }, { rotulo: "Descrição", larga: true }, { rotulo: "Quebra" }, { rotulo: "Parada" },
                  { rotulo: "Ordem" }, { rotulo: "Tipo da ordem" }, { rotulo: "Notificador" }]}
                  linhas={notas.slice(0, 200).map((n) => ({ chave: n.nota, celulas: [n.nota, dataBr(n.data), n.tipoNota, n.descricao, n.quebra ? "Sim" : "—", n.comParada ? "Sim" : "—",
                    n.ordem || "—", n.tipoOrdem || "—", n.notificador || "—"] }))} />
              )}
            </Cartao>
          )}
        </div>
        <Cartao titulo="Cadastro do equipamento" className="h-fit"
          acoes={cadastra ? <Link href={`?${new URLSearchParams({ visao: V_CADASTRO, form: sel })}#form`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borda px-3 text-[13px] transition hover:bg-superficie-2">
            <Pencil className="size-3.5" /> {temCad ? "Editar cadastro" : "Cadastrar equipamento"}</Link> : undefined}>
          {temCad ? (
            <div className="space-y-3 text-[13px]">
              <div className="flex flex-wrap gap-1.5"><Selo cor="azul">{String(info.categoria || "—")}</Selo><Selo cor={SELO_CRIT[String(info.criticidade)] ?? "cinza"}>{String(info.criticidade || "—")}</Selo>
                {!!info.situacao && <Selo cor="ciano">{String(info.situacao)}</Selo>}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1"><dt className="text-[12px] text-texto-3">{ROTULO_CAMPO}</dt><dd className="font-medium">{campo || "—"}</dd></dl>
              {!!info.observacoes && <blockquote className="border-l-2 border-borda-forte pl-3 text-texto-2">{String(info.observacoes)}</blockquote>}
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-texto-3">Componentes vinculados</div>
              {!pecas.length ? <p className="text-texto-3">Nenhum componente vinculado.</p> : (
                <ul className="divide-y divide-borda rounded-xl border border-borda">
                  {pecas.map((p) => (
                    <li key={p.codigo} className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5"><span className="font-mono text-[12.5px] text-alp-azul">{p.codigo}</span><SeloPeca p={p} /></div>
                      <div className="text-texto-2">{p.descricao || "—"}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-texto-3">Ainda não cadastrado no site.{critSap && <> Criticidade pelo código ABC do SAP: <b className="text-texto-2">{critSap}</b>.</>}</p>
          )}
        </Cartao>
      </div>
    </div>
  );
}
