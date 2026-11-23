import { ArrowRight, Download, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AbasVisao, Aviso, Secao } from "@/components/PaginaWcm";
import { Cabecalho, Kpi, Pagina, Selo } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { inteiro } from "@/lib/formato";
import * as D from "@/lib/machineLedger/dados";
import * as R from "@/lib/machineLedger/regras";
import { dataBr, hoje, MESES, partes } from "@/lib/wcm/util";

import { Controles } from "../planos/_comum/Controles";
import { hrefCom, um, type Params } from "../planos/_comum/params";
import { AcoesAchado, Correspondencia, EnviarLedger } from "./Acoes";

export const metadata: Metadata = { title: "Machine Ledger" };
export const dynamic = "force-dynamic";

const VISOES = ["Visão geral", "Máquinas", "Pente fino do MRO", "Cruzamentos", "Correspondência", "Enviar ledger"];
const MAX_LINHAS = 300;
const TH = "px-3 py-2 text-left text-[12px] font-medium text-texto-3 whitespace-nowrap";
const TD = "px-3 py-2 align-top";
const BOTAO_LINK = "inline-flex h-11 items-center gap-2 rounded-xl border border-borda bg-superficie px-4 text-[13.5px] hover:bg-superficie-2";
const COR_TIPO: Record<R.TipoAchado, "laranja" | "vermelho" | "amarelo" | "azul" | "cinza"> = {
  faltando: "laranja", sem_respaldo: "amarelo", codigo_invalido: "vermelho", descricao_divergente: "amarelo", sem_saldo: "vermelho", ledger_copiado: "azul",
};

/**
 * Machine Ledger — as planilhas RCM de cada máquina cruzadas com os ativos (spec docs/superpowers/specs/2026-11-23-machine-ledger-design.md).
 * Regras em lib/machineLedger/regras.ts; leitura e gravação em lib/machineLedger/dados.ts pela rota /api/machine_ledger.
 */
export default async function MachineLedger(props: { searchParams: Promise<Params> }) {
  const u = await exigir("machine_ledger");
  const params = await props.searchParams;
  const visao = VISOES.includes(um(params, "visao")) ? um(params, "visao") : VISOES[0];
  const grava = D.podeGravarMl(u);
  const indice = await D.lerIndice();

  return (
    <Pagina>
      <Cabecalho titulo="Machine Ledger," destaque="o RCM de cada máquina cruzado com os ativos." sobre="Confiabilidade"
        subtitulo="As planilhas WCM de cada máquina (componentes, índice H, Plano Mestre e peças de reposição) cruzadas com os vínculos de MRO, o estoque, o consumo real, os planos do SAP e as quebras." />
      <div className="space-y-6">
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        {!grava && (
          <p className="inline-flex items-center gap-1.5 text-[12.5px] text-texto-3">
            <Lock className="size-3.5" aria-hidden />Você consulta; vínculos, conferidos, correspondência e envio de ledger ficam com os editores do PCM.
          </p>
        )}
        {!indice.length ? <Aviso>Nenhum Machine Ledger carregado ainda. {grava ? "Envie a planilha em \"Enviar ledger\"." : ""}</Aviso> : (
          <>
            {visao === "Visão geral" && <VisaoGeral indice={indice} />}
            {visao === "Máquinas" && <Maquinas indice={indice} params={params} />}
            {visao === "Pente fino do MRO" && <Pente params={params} grava={grava} />}
            {visao === "Cruzamentos" && <Cruzamentos indice={indice} params={params} />}
            {visao === "Correspondência" && <Correspondencias indice={indice} grava={grava} />}
          </>
        )}
        {visao === "Enviar ledger" && (grava ? (
          <Secao titulo="Enviar ledger" sub="Escolha o .xlsx do Machine Ledger: a planilha é lida no seu navegador (precisa das abas CAPA, RCM, PLANO MESTRE e GT_SPARE_PARTS) e substitui o ledger escolhido; os equipamentos SAP já ligados ficam.">
            <EnviarLedger ledgers={indice.map((i) => ({ id: i.id, nome: i.nome }))} />
          </Secao>
        ) : <Aviso>Só editores do PCM (fora de Terceiro e Manutentor) enviam ledgers.</Aviso>)}
      </div>
    </Pagina>
  );
}

// ----------------------------------------------------------------------------
async function VisaoGeral({ indice }: { indice: R.Indice[] }) {
  const { achados, todos, base } = await D.penteFinoAtual();
  const vinc = await D.vinculos();
  const res = R.resumoAchados(achados);
  const equipamentos = new Set(indice.flatMap((i) => i.equipamentos));
  let total = 0, vinculadas = 0;
  for (const { indice: i, conteudo } of todos) {
    const ok = R.pecasResolvidas(conteudo, base).filter((p) => p.r.situacao === "ok").map((p) => p.r.codigo);
    for (const a of i.equipamentos) {
      const v = new Set(vinc(a).map(R.semZeros));
      total += ok.length;
      vinculadas += ok.filter((c) => v.has(c)).length;
    }
  }
  const porLedger = new Map<string, number>();
  for (const a of achados) porLedger.set(a.ledger, (porLedger.get(a.ledger) ?? 0) + 1);
  const soma = (k: "componentes" | "pecas") => indice.reduce((s, i) => s + i.contagens[k], 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Máquinas com ledger" valor={inteiro(indice.filter((i) => i.tipo === "maquina").length)} detalhe={`${inteiro(indice.length)} planilhas (com modelos)`} tom="azul" />
        <Kpi rotulo="Equipamentos SAP cobertos" valor={inteiro(equipamentos.size)} detalhe={`${inteiro(indice.filter((i) => !i.equipamentos.length).length)} ledgers sem equipamento`} tom="azul" />
        <Kpi rotulo="Componentes no RCM" valor={inteiro(soma("componentes"))} detalhe={`${inteiro(soma("pecas"))} peças de reposição`} tom="azul" />
        <Kpi rotulo="Peças do ledger vinculadas" valor={total ? `${Math.round((vinculadas / total) * 100)}%` : "—"} detalhe={`${inteiro(vinculadas)} de ${inteiro(total)} (ativo × código válido)`}
          tom={total && vinculadas / total >= 0.8 ? "verde" : "laranja"} />
      </div>
      <Secao titulo="Achados do pente fino" destaque={`· ${inteiro(achados.length)}`} sub="Por tipo; abra o pente fino para agir.">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(R.TIPOS_ACHADO) as R.TipoAchado[]).map((t) => (
            <Link key={t} prefetch={false} href={`?visao=${encodeURIComponent("Pente fino do MRO")}&tipo=${t}`} className="rounded-xl border border-borda bg-superficie px-3 py-2 text-[13px] hover:bg-superficie-2">
              <Selo cor={COR_TIPO[t]}>{inteiro(res.porTipo[t])}</Selo> {R.TIPOS_ACHADO[t]}
            </Link>
          ))}
        </div>
      </Secao>
      <Secao titulo="Os ledgers" destaque={`· ${inteiro(indice.length)}`}>
        <Tabela cab={["Ledger", "Tipo", "Revisão", "Equipamentos SAP", "Componentes", "Peças", "Achados"]}>
          {indice.map((i) => (
            <tr key={i.id} className="border-t border-borda">
              <td className={TD}><Link prefetch={false} className="font-medium underline-offset-2 hover:underline" href={`?visao=M%C3%A1quinas&m=${i.id}`}>{i.nome}</Link></td>
              <td className={TD}>{i.tipo === "modelo" ? <Selo>Modelo</Selo> : "Máquina"}</td>
              <td className={`${TD} num`}>{i.revisao || "—"}</td>
              <td className={`${TD} num`}>{i.equipamentos.join(", ") || <span className="text-texto-3">—</span>}</td>
              <td className={`${TD} num`}>{inteiro(i.contagens.componentes)}</td><td className={`${TD} num`}>{inteiro(i.contagens.pecas)}</td>
              <td className={`${TD} num`}>{inteiro(porLedger.get(i.id) ?? 0)}</td>
            </tr>
          ))}
        </Tabela>
      </Secao>
    </>
  );
}

// ----------------------------------------------------------------------------
async function Maquinas({ indice, params }: { indice: R.Indice[]; params: Params }) {
  const l = indice.find((i) => i.id === um(params, "m"));
  if (!l) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {indice.map((i) => (
          <Link key={i.id} prefetch={false} href={hrefCom(params, { m: i.id })} className="block rounded-cartao border border-borda bg-superficie p-4 hover:border-borda-forte">
            <div className="font-display text-[15px] font-medium">{i.nome}</div>
            <div className="mt-1 text-[12.5px] text-texto-3">{[i.capa.fabricante, i.capa.modelo].filter(Boolean).join(" · ") || "—"}</div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
              {i.tipo === "modelo" && <Selo>Modelo</Selo>}
              <Selo cor={i.equipamentos.length ? "verde" : "laranja"}>{i.equipamentos.length ? `${i.equipamentos.length} equip. SAP` : "sem equipamento"}</Selo>
              <Selo cor="azul">{inteiro(i.contagens.componentes)} componentes</Selo>
            </div>
          </Link>
        ))}
      </div>
    );
  }
  const [c, b, nomes] = await Promise.all([D.lerConteudo(l.id), D.baseCodigos(), D.equipamentosSap()]);
  const ano = /^\d{4}$/.test(um(params, "ano")) ? Number(um(params, "ano")) : partes(hoje()).ano;
  const { afs, temAf } = await D.quebrasDos(new Set(l.equipamentos));
  const cal = R.calendarioQuebras(c.componentes, afs, ano);
  const classe = um(params, "classe"), tm = um(params, "tm"), imp = um(params, "imp");
  const rcm = c.componentes.map((x) => ({ x, h: R.indiceH(x), classe: R.classeDe(x) }))
    .filter((r) => (!classe || r.classe === classe) && (!tm || r.x.tipoManut === tm)
      && (!imp || (imp === "seg" ? r.x.seguranca : imp === "qual" ? r.x.qualidade : r.x.parada)))
    .sort((a, b2) => (b2.h ?? -1) - (a.h ?? -1));
  const tiposManut = [...new Set(c.componentes.map((x) => x.tipoManut).filter(Boolean))].sort();
  const anos = [...new Set([partes(hoje()).ano, ...afs.map((q) => (q.data != null ? partes(q.data).ano : 0)).filter(Boolean)])].sort((a, b2) => b2 - a);
  return (
    <div className="space-y-8">
      <Link prefetch={false} href={hrefCom(params, { m: null })} className="text-[13px] text-texto-3 hover:text-texto">← Todas as máquinas</Link>
      <Secao titulo={l.nome} destaque={l.tipo === "modelo" ? "· modelo" : undefined} sub={l.capa.funcao}>
        <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
          {[["Máquina", l.capa.maquina], ["Fabricante", l.capa.fabricante], ["Modelo", l.capa.modelo], ["Área", l.capa.area], ["Revisão", l.revisao], ["Arquivo", l.arquivo]].map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-texto-3">{k}</dt><dd className="break-words font-medium">{v || "—"}</dd></div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-2 text-[13px]">
          <span className="text-texto-3">Equipamentos SAP:</span>
          {l.equipamentos.length ? l.equipamentos.map((e) => <Selo key={e} cor="verde">{e}{nomes.get(e) ? ` · ${nomes.get(e)}` : ""}</Selo>) : <Selo cor="laranja">nenhum (ver Correspondência)</Selo>}
        </div>
      </Secao>

      <Secao titulo="Árvore" sub="Conjunto › subconjunto › componentes.">
        <div className="space-y-2">
          {R.arvore(c.componentes).map((g) => (
            <details key={g.conjunto} className="rounded-xl border border-borda bg-superficie px-4 py-2">
              <summary className="cursor-pointer py-1 font-medium">{g.conjunto} <span className="text-texto-3">· {g.subs.reduce((s, x) => s + x.comps.length, 0)}</span></summary>
              <ul className="mt-2 space-y-1.5 pl-3 text-[13px]">
                {g.subs.map((s) => <li key={s.subconjunto}><b>{s.subconjunto}</b>: <span className="text-texto-2">{s.comps.map((x) => x.componente).join(" · ")}</span></li>)}
              </ul>
            </details>
          ))}
        </div>
      </Secao>

      <Secao titulo="Calendário de quebras" destaque={`· ${ano}`}
        sub="As AFs da aba Planos de AF dos equipamentos SAP ligados, associadas ao componente pelo texto (componente, subconjunto, conjunto e descrição da falha; o mais específico primeiro). Toque na linha para ver as AFs.">
        <Controles controles={[{ tipo: "escolha", chave: "ano", rotulo: "Ano", valor: String(ano), opcoes: anos.map((a) => ({ valor: String(a), rotulo: String(a) })) }]} />
        {!l.equipamentos.length ? <Vazio>Sem equipamento SAP ligado: o calendário sai das AFs dos equipamentos do ledger.</Vazio>
          : !temAf ? <Vazio>O Gerenciador de AF ainda não foi enviado (Fontes de dados).</Vazio>
          : !cal.length ? <Vazio>Nenhuma AF desses equipamentos em {ano}.</Vazio> : <Calendario linhas={cal} />}
      </Secao>

      <Secao titulo="RCM por índice H" destaque={`· ${inteiro(rcm.length)}`} sub="Do maior índice H ao menor (H da planilha; vazio, calculado).">
        <Controles limpar={[]} controles={[
          { tipo: "escolha", chave: "classe", rotulo: "Classe", valor: classe, opcoes: [{ valor: "", rotulo: "Todas" }, ...["A", "B", "C"].map((x) => ({ valor: x, rotulo: x }))] },
          { tipo: "escolha", chave: "tm", rotulo: "Manutenção", valor: tm, opcoes: [{ valor: "", rotulo: "Todas" }, ...tiposManut.map((x) => ({ valor: x, rotulo: x }))] },
          { tipo: "escolha", chave: "imp", rotulo: "Impacto", valor: imp, opcoes: [{ valor: "", rotulo: "Qualquer" }, { valor: "seg", rotulo: "Segurança" }, { valor: "qual", rotulo: "Qualidade" }, { valor: "parada", rotulo: "Para a máquina" }] },
        ]} />
        <Tabela cab={["H", "Classe", "Componente", "Conjunto › subconjunto", "Código", "Modo de falha", "Seg.", "Qual.", "Para", "P", "T", "V", "Manutenção"]}>
          {rcm.slice(0, MAX_LINHAS).map(({ x, h, classe: cl }, i) => (
            <tr key={i} className="border-t border-borda">
              <td className={`${TD} num font-semibold`}>{h ?? "—"}</td><td className={TD}>{cl ? <Selo cor={cl === "A" ? "vermelho" : cl === "B" ? "laranja" : "cinza"}>{cl}</Selo> : "—"}</td>
              <td className={`${TD} min-w-[12rem]`}>{x.componente}</td><td className={`${TD} min-w-[10rem] text-texto-2`}>{x.conjunto} › {x.subconjunto}</td>
              <td className={`${TD} num`}>{x.codigo || "—"}</td><td className={`${TD} min-w-[10rem] text-texto-2`}>{x.modo}</td>
              <td className={TD}>{sn(x.seguranca)}</td><td className={TD}>{sn(x.qualidade)}</td><td className={TD}>{sn(x.parada)}</td>
              <td className={`${TD} num`}>{x.p ?? ""}</td><td className={`${TD} num`}>{x.t ?? ""}</td><td className={`${TD} num`}>{x.v ?? ""}</td><td className={TD}>{x.tipoManut}</td>
            </tr>
          ))}
        </Tabela>
        {rcm.length > MAX_LINHAS && <p className="text-[12.5px] text-texto-3">Mostrando {MAX_LINHAS} de {inteiro(rcm.length)}; use os filtros.</p>}
      </Secao>

      <Secao titulo="Plano Mestre MP" destaque={`· ${inteiro(c.plano.length)}`}>
        {!c.plano.length ? <Vazio>O Plano Mestre deste ledger está vazio.</Vazio> : (
          <Tabela cab={["Componente", "Atividade", "Tipo", "Periodicidade", "Tempo (min)", "Mec.", "Ele.", "Plano SAP"]}>
            {c.plano.slice(0, MAX_LINHAS).map((a, i) => (
              <tr key={i} className="border-t border-borda">
                <td className={`${TD} min-w-[10rem]`}>{a.componente}</td><td className={`${TD} min-w-[14rem]`}>{a.atividade}</td><td className={TD}>{a.cilr || a.tipo}</td>
                <td className={TD}>{a.periodicidade}</td><td className={`${TD} num`}>{a.tempoMin ?? ""}</td><td className={`${TD} num`}>{a.mec ?? ""}</td>
                <td className={`${TD} num`}>{a.ele ?? ""}</td><td className={`${TD} num`}>{a.planoSap || "—"}</td>
              </tr>
            ))}
          </Tabela>
        )}
      </Secao>

      <Secao titulo="Peças de reposição" destaque={`· ${inteiro(c.pecas.length)}`} sub="Código resolvido no Sysmat (código SAP, código Sysmat ou descrição curta exata) e saldo na MB52."
        acoes={<a href={`/api/machine_ledger?planilha=pecas&id=${l.id}`} className={BOTAO_LINK}><Download className="size-4" /> Excel</a>}>
        {!c.pecas.length ? <Vazio>A aba GT_SPARE_PARTS deste ledger está vazia.</Vazio> : (
          <Tabela cab={["Código", "Descrição", "Conjunto", "Saldo MB52", "Estratégico", "Reserva", "Est. seg. Almox", "Est. seg. UBM"]}>
            {c.pecas.slice(0, MAX_LINHAS).map((p, i) => {
              const r = R.resolverCodigo(p.codigo, p.descricao, b);
              const saldo = r.codigo ? b.saldo?.get(r.codigo)?.estoque ?? 0 : null;
              return (
                <tr key={i} className="border-t border-borda">
                  <td className={`${TD} num`}>{r.codigo || <span className="text-texto-3">{p.codigo || "sem código"}</span>}
                    {r.situacao !== "ok" && r.situacao !== "sem_codigo" && <div><Selo cor="vermelho">{r.situacao === "inativo" ? r.status.toLowerCase() : "não existe"}</Selo></div>}
                    {r.origem === "descricao" && <div><Selo cor="azul">pela descrição</Selo></div>}</td>
                  <td className={`${TD} min-w-[14rem]`}>{p.descricao}</td><td className={TD}>{p.conjunto}</td>
                  <td className={`${TD} num`}>{saldo == null ? "—" : saldo <= 0 && (p.estrategico || p.reserva) ? <Selo cor="vermelho">{saldo}</Selo> : saldo}</td>
                  <td className={TD}>{p.estrategico ? "Sim" : ""}</td><td className={TD}>{p.reserva ? "Sim" : ""}</td>
                  <td className={`${TD} num`}>{p.estSegAlmox ?? ""}</td><td className={`${TD} num`}>{p.estSegUbm ?? ""}</td>
                </tr>
              );
            })}
          </Tabela>
        )}
      </Secao>
    </div>
  );
}

function Calendario({ linhas }: { linhas: R.LinhaCalendario[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-borda bg-superficie">
      <table className="w-full text-[13px]">
        <thead><tr><th className={TH}>Componente</th><th className={TH}>H</th>{MESES.map((m) => <th key={m} className={`${TH} text-center`}>{m}</th>)}<th className={TH}>Total</th></tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave} className="border-t border-borda">
              <td className={`${TD} min-w-[14rem]`}>
                <details>
                  <summary className={`cursor-pointer ${l.nivel === "nenhum" ? "text-texto-3 italic" : "font-medium"}`}>{l.rotulo}</summary>
                  <ul className="mt-2 space-y-1 text-[12.5px]">
                    {l.quebras.map((q) => (
                      <li key={`${q.fonte}${q.numero}`}>
                        <Link prefetch={false} href={`/af_planos?af=${encodeURIComponent(q.numero)}#af`} className="num font-medium underline">{q.numero}</Link>
                        {" "}· {dataBr(q.data)}{q.criticidade && <> · <Selo cor={q.criticidade === "A" ? "vermelho" : "cinza"}>{q.criticidade}</Selo></>} · {q.texto || "—"}
                      </li>
                    ))}
                  </ul>
                </details>
              </td>
              <td className={`${TD} num`}>{l.h ?? ""}</td>
              {l.meses.map((n, m) => (
                <td key={m} className={`${TD} text-center`} title={n ? l.semanas[m].map((s, i) => (s ? `S${i + 1}: ${s}` : "")).filter(Boolean).join(" · ") : undefined}>
                  {n ? <span className="num inline-grid min-w-6 place-items-center rounded-md px-1 font-semibold" style={{ background: "var(--selo-serio-fundo)", color: "var(--selo-serio-texto)" }}>{n}</span>
                    : <span className="text-texto-3">·</span>}
                </td>
              ))}
              <td className={`${TD} num font-semibold`}>{l.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------
async function Pente({ params, grava }: { params: Params; grava: boolean }) {
  const { achados, conferidos } = await D.penteFinoAtual();
  const tipo = um(params, "tipo") in R.TIPOS_ACHADO ? (um(params, "tipo") as R.TipoAchado) : "";
  const q = um(params, "q").trim().toUpperCase();
  const lista = achados.filter((a) => (!tipo || a.tipo === tipo) && (!q || a.ativos.some((x) => x.includes(q)) || a.ledgerNome.toUpperCase().includes(q) || a.codigo.includes(q)));
  const res = R.resumoAchados(achados);
  return (
    <Secao titulo="Pente fino do MRO" destaque={`· ${inteiro(lista.length)}`}
      sub={`Peças do ledger × peças vinculadas ao ativo (as mesmas da Gestão de MRO), códigos no Sysmat e saldo na MB52. ${conferidos ? `${inteiro(conferidos)} conferido(s) fora da lista.` : ""}`}
      acoes={<a href="/api/machine_ledger?planilha=achados" className={BOTAO_LINK}><Download className="size-4" /> Excel</a>}>
      <Controles limpar={[]} controles={[
        { tipo: "escolha", chave: "tipo", rotulo: "Tipo", valor: tipo, opcoes: [{ valor: "", rotulo: `Todos (${inteiro(achados.length)})` },
          ...(Object.keys(R.TIPOS_ACHADO) as R.TipoAchado[]).map((t) => ({ valor: t, rotulo: `${R.TIPOS_ACHADO[t]} (${inteiro(res.porTipo[t])})` }))] },
        { tipo: "busca", chave: "q", valor: um(params, "q"), placeholder: "Ativo, ledger ou código" },
      ]} />
      {!lista.length ? <Vazio>Nenhum achado{tipo ? " desse tipo" : ""}.</Vazio> : (
        <ul className="space-y-2" aria-label="Achados">
          {lista.slice(0, MAX_LINHAS).map((a) => (
            <li key={a.chave} data-achado={a.tipo} className="rounded-xl border border-borda bg-superficie p-3">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Selo cor={COR_TIPO[a.tipo]}>{R.TIPOS_ACHADO[a.tipo]}</Selo>
                {a.forte && <Selo cor="vermelho">sinal forte</Selo>}
                <span className="num font-semibold">{a.ativos.join(", ") || "sem equipamento"}</span>
                <span className="text-texto-3">· {a.ledgerNome}</span>
              </div>
              <div className="mt-1.5 text-[13.5px]">{a.codigo && <b className="num">{a.codigo} </b>}{a.descricao}</div>
              <div className="mt-0.5 text-[12.5px] text-texto-3">{a.detalhe}{a.para && ` Para: ${a.para}.`}</div>
              {grava && <div className="mt-2"><AcoesAchado chave={a.chave} acao={a.acao} ativo={a.ativos[0] ?? ""} codigo={a.codigo} /></div>}
            </li>
          ))}
        </ul>
      )}
      {lista.length > MAX_LINHAS && <p className="text-[12.5px] text-texto-3">Mostrando {MAX_LINHAS} de {inteiro(lista.length)}; filtre ou baixe o Excel.</p>}
    </Secao>
  );
}

// ----------------------------------------------------------------------------
async function Cruzamentos({ indice, params }: { indice: R.Indice[]; params: Params }) {
  const comEq = indice.filter((i) => i.equipamentos.length);
  const l = comEq.find((i) => i.id === um(params, "m")) ?? comEq[0];
  const [todos, b] = await Promise.all([D.lerTodos(indice), D.baseCodigos()]);
  const ubm = todos.flatMap(({ indice: i, conteudo }) => R.sugestoesUbm(conteudo.pecas).map((p) => ({ i, p, r: R.resolverCodigo(p.codigo, p.descricao, b) })));
  const seletor = comEq.length ? (
    <Controles controles={[{ tipo: "escolha", chave: "m", rotulo: "Máquina", valor: l?.id ?? "", opcoes: comEq.map((i) => ({ valor: i.id, rotulo: i.nome })) }]} />
  ) : null;
  let corpo: React.ReactNode = <Vazio>Nenhum ledger com equipamento SAP ligado (ver Correspondência).</Vazio>;
  if (l) {
    const c = todos.find((t) => t.indice.id === l.id)!.conteudo;
    const eqs = new Set(l.equipamentos);
    const [consumo, ip19, quebras] = await Promise.all([D.consumoPorEquipamento(), D.ip19PorEquipamento(), D.quebrasDos(eqs)]);
    const codigos = new Set(R.pecasResolvidas(c, b).filter((p) => p.r.situacao === "ok").map((p) => p.r.codigo));
    const cons = consumo ? R.consumoXLedger(l.equipamentos.flatMap((e) => consumo.por.get(e) ?? []), codigos) : null;
    const planos = ip19 ? R.planoXIp19(c.plano, l.equipamentos.flatMap((e) => ip19.get(e) ?? [])) : null;
    const sinais = R.sinaisQuebra(c.componentes, c.plano, [...quebras.afs, ...quebras.iw28]);
    corpo = (
      <div className="space-y-8">
        <Secao titulo="IW13 × ledger" sub="Materiais consumidos nas ordens do ativo que não estão no ledger: candidatas a entrar.">
          {!cons ? <Vazio>A IW13 ainda não foi enviada.</Vazio> : (
            <>
              <p className="text-[13px] text-texto-2">{inteiro(cons.previstasConsumidas)} peça(s) do ledger tiveram consumo; {inteiro(cons.naoPrevistas.length)} consumida(s) fora do ledger.</p>
              {cons.naoPrevistas.length > 0 && (
                <Tabela cab={["Material", "Descrição", "Ordens", "Quantidade"]}>
                  {cons.naoPrevistas.slice(0, 100).map((x) => (
                    <tr key={x.material} className="border-t border-borda"><td className={`${TD} num`}>{x.material}</td><td className={TD}>{x.descricao}</td>
                      <td className={`${TD} num`}>{x.ordens}</td><td className={`${TD} num`}>{x.quantidade}</td></tr>
                  ))}
                </Tabela>
              )}
            </>
          )}
        </Secao>
        <Secao titulo="IP19 × Plano Mestre" sub="Por código de plano quando o ledger traz; sem código, a comparação fica pela contagem.">
          {!planos ? <Vazio>A IP19 ainda não foi enviada.</Vazio> : (
            <div className="space-y-2 text-[13px]">
              <p>{inteiro(c.plano.length)} atividade(s) no Plano Mestre · {inteiro(planos.semCodigo)} sem código de plano · {inteiro(planos.semPlanoSap.length)} com código que não está na IP19 do ativo.</p>
              {planos.semPlanoSap.length > 0 && <ul className="list-disc pl-5">{planos.semPlanoSap.slice(0, 50).map((a, i) => <li key={i}><b className="num">{a.planoSap}</b> · {a.atividade}</li>)}</ul>}
              <p>{inteiro(planos.foraDoLedger.length)} plano(s) da IP19 do ativo fora do ledger:</p>
              {planos.foraDoLedger.length > 0 && <ul className="list-disc pl-5">{planos.foraDoLedger.slice(0, 50).map((p) => <li key={p.plano}><b className="num">{p.plano}</b> · {p.texto}</li>)}</ul>}
            </div>
          )}
        </Secao>
        <Secao titulo="Quebras × componentes de maior H" sub={`${inteiro(quebras.afs.length)} AF(s) e ${inteiro(quebras.iw28.length)} nota(s) de quebra da IW28 do ativo, associadas pelo texto: quebra recorrente com H baixo (RCM subestimado) e H alto sem atividade no Plano Mestre.`}>
          {!sinais.length ? <Vazio>Nenhum sinal.</Vazio> : (
            <Tabela cab={["Sinal", "Componente", "Conjunto", "H", "Classe", "Quebras"]}>
              {sinais.slice(0, 100).map((s, i) => (
                <tr key={i} className="border-t border-borda">
                  <td className={TD}>{s.sinal === "rcm_subestimado" ? <Selo cor="vermelho">RCM subestimado</Selo> : <Selo cor="laranja">H alto sem plano</Selo>}</td>
                  <td className={`${TD} min-w-[12rem]`}>{s.rotulo}</td><td className={TD}>{s.conjunto}</td><td className={`${TD} num`}>{s.h ?? ""}</td>
                  <td className={TD}>{s.classe}</td><td className={`${TD} num`}>{s.quebras}</td>
                </tr>
              ))}
            </Tabela>
          )}
        </Secao>
      </div>
    );
  }
  return (
    <div className="space-y-8">
      {seletor}
      {corpo}
      <Secao titulo="Sugestões para a UBM" destaque={`· ${inteiro(ubm.length)}`} sub="Peças com estoque de segurança UBM > 0 no ledger: candidatas ao kit do armário."
        acoes={<Link prefetch={false} href="/ubm?visao=Arm%C3%A1rios" className={BOTAO_LINK}>Abrir a UBM <ArrowRight className="size-4" /></Link>}>
        {!ubm.length ? <Vazio>Nenhuma peça com estoque de segurança UBM nos ledgers.</Vazio> : (
          <Tabela cab={["Ledger", "Código", "Descrição", "Est. seg. UBM"]}>
            {ubm.slice(0, 200).map(({ i, p, r }, k) => (
              <tr key={k} className="border-t border-borda"><td className={TD}>{i.nome}</td><td className={`${TD} num`}>{r.codigo || p.codigo || "—"}</td>
                <td className={TD}>{p.descricao}</td><td className={`${TD} num`}>{p.estSegUbm}</td></tr>
            ))}
          </Tabela>
        )}
      </Secao>
    </div>
  );
}

// ----------------------------------------------------------------------------
async function Correspondencias({ indice, grava }: { indice: R.Indice[]; grava: boolean }) {
  const nomes = await D.equipamentosSap();
  const usados = new Set(indice.flatMap((i) => [...i.equipamentos, ...i.sugestoes.map((s) => s.sap)]));
  const mapa = Object.fromEntries([...usados].map((e) => [e, nomes.get(e) ?? ""]));
  return (
    <Secao titulo="Correspondência ledger × equipamento SAP" sub="Cada ledger aponta os equipamentos do IH08 da máquina. A carga inicial ligou só os de confiança alta; os outros ficam como sugestão.">
      <div className="space-y-3">
        {indice.map((i) => (
          <div key={i.id} className="rounded-cartao border border-borda bg-superficie p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-display text-[15px] font-medium">{i.nome}</span>
              {i.tipo === "modelo" && <Selo>Modelo</Selo>}
              <Selo cor={i.origem === "confirmada" ? "verde" : "cinza"}>{i.origem === "confirmada" ? `confirmada${i.confirmadoPor ? ` por ${i.confirmadoPor}` : ""}` : "automática"}</Selo>
            </div>
            {grava ? <Correspondencia id={i.id} nome={i.nome} equipamentos={i.equipamentos} sugestoes={i.sugestoes} nomes={mapa} /> : (
              <div className="text-[13px]">{i.equipamentos.join(", ") || "Nenhum equipamento SAP ligado."}
                {i.sugestoes.length > 0 && <span className="text-texto-3"> · sugestões: {i.sugestoes.map((s) => s.sap).join(", ")}</span>}</div>
            )}
          </div>
        ))}
      </div>
    </Secao>
  );
}

// ----------------------------------------------------------------------------
const sn = (v: boolean | null) => (v == null ? "" : v ? "S" : "N");

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-cartao border border-dashed border-borda px-5 py-6 text-center text-[13.5px] text-texto-3">{children}</p>;
}

function Tabela({ cab, children }: { cab: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-borda bg-superficie">
      <table className="w-full text-[13px]">
        <thead><tr>{cab.map((c) => <th key={c} className={TH}>{c}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
