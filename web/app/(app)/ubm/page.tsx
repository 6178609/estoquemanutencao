import { Download, Lock, QrCode } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AbasVisao, Aviso, Secao } from "@/components/PaginaWcm";
import { Cabecalho, Kpi, Pagina, Selo } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { inteiro } from "@/lib/formato";
import * as D from "@/lib/ubm/dados";
import * as R from "@/lib/ubm/regras";

import { Controles } from "../planos/_comum/Controles";
import { um, type Params } from "../planos/_comum/params";
import { BotaoAcao, EditorArmario, Lancamento } from "./Acoes";
import { Fluxograma } from "./Fluxograma";

export const metadata: Metadata = { title: "UBM (armário kanban)" };
export const dynamic = "force-dynamic";

const VISOES = ["Visão geral", "Retiradas", "Solicitações", "Análise", "Armários", "Como funciona"];
const FUSO = "America/Sao_Paulo";
const MAX_LISTA = 200;
const hojeBr = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
const somarDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const quando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(d);
};
const dataBr = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const fotoUrl = (m: R.Movimento) => `/api/ubm?${new URLSearchParams({ foto: m.id, v: m.foto?.arquivo ?? "" })}`;
const TH = "px-3 py-2 text-left text-[12px] font-medium text-texto-3";
const TD = "px-3 py-2 align-top";
const BOTAO_LINK = "inline-flex h-11 items-center gap-2 rounded-xl border border-borda bg-superficie px-4 text-[13.5px] hover:bg-superficie-2";

/**
 * UBM — armário kanban em campo com itens estratégicos do Almox (spec docs/superpowers/specs/2026-11-22-ubm-design.md).
 * Retirada e solicitação pelo QR (formulários do celular em ./retirada e ./solicitacao); aqui o planejamento vê o saldo,
 * a lista de reposição, as retiradas (com foto), as solicitações, a análise e o cadastro dos armários. Regras em
 * lib/ubm/regras.ts; gravação em lib/ubm/dados.ts pela rota /api/ubm.
 */
export default async function Ubm(props: { searchParams: Promise<Params> }) {
  const u = await exigir("ubm");
  const params = await props.searchParams;
  const visao = VISOES.includes(um(params, "visao")) ? um(params, "visao") : VISOES[0];
  const gere = D.podeGerir(u);
  const hoje = hojeBr();
  const [armarios, movs] = await Promise.all([D.lerArmarios(), D.lerMovimentos()]);
  const armario = armarios.some((a) => a.id === um(params, "u")) ? um(params, "u") : "";
  const de = /^\d{4}-\d{2}-\d{2}$/.test(um(params, "ude")) ? um(params, "ude") : somarDias(hoje, -89);
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(um(params, "uate")) ? um(params, "uate") : hoje;
  const filtro = { armario, de, ate };
  const doArmario = armarios.filter((a) => !armario || a.id === armario);
  const saldo = R.saldoDoKit(doArmario, movs);
  const repor = saldo.filter((l) => l.repor);
  const abertas = R.filtrar(movs, { armario }).filter((m) => m.tipo === "solicitacao" && !m.fechadaEm);
  const naoLancadas = R.naoLancadas(R.filtrar(movs, { armario }));
  const ordens = visao === "Análise" || visao === "Retiradas" ? await D.ordensIw38() : null;
  const codigos = new Set(movs.map((m) => m.codigo).filter(Boolean));
  const catalogo = visao === "Armários" || visao === "Como funciona" ? new Map<string, string>() : await D.descricoesCatalogo(codigos);
  const kitDesc = new Map(armarios.flatMap((a) => a.itens.map((i) => [`${a.id}|${i.codigo}`, i.descricao] as const)));
  const descr = (armarioId: string, codigo: string) => catalogo.get(codigo) || kitDesc.get(`${armarioId}|${codigo}`) || "";
  const qs = new URLSearchParams({ u: armario, de, ate }).toString();

  const controles = (
    <Controles className="min-w-0 flex-1" controles={[
      { tipo: "escolha", chave: "u", rotulo: "Armário", valor: armario,
        opcoes: [{ valor: "", rotulo: "Todos" }, ...armarios.map((a) => ({ valor: a.id, rotulo: `${a.id} · ${a.nome}` }))] },
      ...(visao === "Retiradas" || visao === "Análise" || visao === "Solicitações" ? [{ tipo: "periodo" as const, de: "ude", ate: "uate", valorDe: de, valorAte: ate,
        atalhos: [{ rotulo: "Últimos 30 dias", de: somarDias(hoje, -29), ate: hoje }, { rotulo: "Últimos 90 dias", de: somarDias(hoje, -89), ate: hoje },
          { rotulo: "Últimos 12 meses", de: somarDias(hoje, -364), ate: hoje }] }] : []),
    ]} />
  );

  return (
    <Pagina>
      <Cabecalho titulo="UBM," destaque="o armário kanban em campo." sobre="Custos e suprimentos"
        subtitulo="Itens estratégicos do Almox perto da máquina para reduzir o MTTR. O manutentor registra a retirada pelo QR do armário (com a foto); o planejamento vê o saldo, o que repor e a análise das saídas."
        acoes={<Link href="/ubm/qr" className={BOTAO_LINK}><QrCode className="size-4" /> Etiquetas QR</Link>} />
      <div className="space-y-6">
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        {!gere && (
          <p className="inline-flex items-center gap-1.5 text-[12.5px] text-texto-3">
            <Lock className="size-3.5" aria-hidden />Você registra retiradas e solicitações pelo QR; armários, reposição e contagem ficam com os editores do PCM.
          </p>
        )}
        {visao !== "Como funciona" && <div className="flex flex-wrap items-center gap-2">{controles}</div>}

        {visao === "Visão geral" && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi rotulo="Armários ativos" valor={inteiro(doArmario.filter((a) => a.ativo).length)} detalhe={`${inteiro(saldo.length)} itens nos kits`} tom="azul" />
              <Kpi rotulo="Itens para repor" valor={inteiro(repor.length)} detalhe="abaixo do mínimo" tom={repor.length ? "laranja" : "verde"} />
              <Kpi rotulo="Solicitações abertas" valor={inteiro(abertas.length)} detalhe="acabou, faltando ou reposição" tom={abertas.length ? "laranja" : "verde"} />
              <Kpi rotulo="Não lançadas na ordem" valor={inteiro(naoLancadas.length)} detalhe="retiradas sem o SAP Mobile" tom={naoLancadas.length ? "vermelho" : "verde"} />
            </div>

            <div id="reposicao" className="scroll-mt-20">
              <Secao titulo="Lista de reposição" destaque={`· ${inteiro(repor.length)}`} sub="Saldo abaixo do mínimo: separar a quantidade padrão − saldo."
                acoes={<a href={`/api/ubm?planilha=reposicao&${qs}`} className={BOTAO_LINK}><Download className="size-4" /> Excel</a>}>
                {!repor.length ? <Vazio>Nada para repor{armario ? ` no ${armario}` : ""}.</Vazio> : (
                  <Tabela cab={["Armário", "Código", "Descrição", "UM", "Saldo", "Mínimo", "Padrão", "Separar"]}>
                    {repor.map((l) => (
                      <tr key={`${l.armario}|${l.codigo}`} className="border-t border-borda">
                        <td className={TD}>{l.armario}</td><td className={`${TD} num`}>{l.codigo}</td><td className={TD}>{descr(l.armario, l.codigo) || l.descricao}</td>
                        <td className={TD}>{l.um}</td><td className={`${TD} num`}>{R.fmtQtd(l.saldo)}</td><td className={`${TD} num`}>{R.fmtQtd(l.minimo)}</td>
                        <td className={`${TD} num`}>{R.fmtQtd(l.maximo)}</td><td className={`${TD} num font-semibold`}>{R.fmtQtd(l.separar)}</td>
                      </tr>
                    ))}
                  </Tabela>
                )}
              </Secao>
            </div>

            <div id="nao-lancadas" className="scroll-mt-20">
              <Secao titulo="Retiradas não lançadas na ordem" destaque={`· ${inteiro(naoLancadas.length)}`}
                sub="O material usado do armário precisa entrar na ordem pelo SAP Mobile. Quem retirou (ou um editor do PCM) marca quando lançar.">
                {!naoLancadas.length ? <Vazio>Todas as retiradas já estão lançadas na ordem.</Vazio> : (
                  <ul className="grid gap-2 lg:grid-cols-2">
                    {naoLancadas.slice(0, MAX_LISTA).map((m) => (
                      <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 rounded-cartao border border-borda bg-superficie p-3">
                        <div className="min-w-0 text-[13px]">
                          <div className="font-medium"><span className="num">{m.codigo}</span> · {R.fmtQtd(m.quantidade)} · ordem <span className="num">{m.ordem}</span></div>
                          <div className="text-[12.5px] text-texto-3">{m.armario} · {m.porNome} · {quando(m.em)}</div>
                        </div>
                        {R.podeMarcarLancada({ login: u.login, gerir: gere }, m) && <BotaoAcao acao="lancada" id={m.id} rotulo="Marcar como lançada" />}
                      </li>
                    ))}
                  </ul>
                )}
              </Secao>
            </div>

            <Secao titulo="Saldo dos armários" sub="Contagem fixa o saldo; reposição soma; retirada subtrai.">
              {!doArmario.length ? <Vazio>Nenhum armário cadastrado. {gere ? "Cadastre em “Armários”." : ""}</Vazio> : doArmario.filter((a) => a.ativo).map((a) => {
                const linhas = saldo.filter((l) => l.armario === a.id);
                const tela = linhas.map((l) => ({ codigo: l.codigo, descricao: descr(a.id, l.codigo) || l.descricao, um: l.um, saldo: l.saldo, separar: l.separar }));
                return (
                  <div key={a.id} className="space-y-2 rounded-cartao border border-borda bg-superficie p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-display text-[16px] font-medium">{a.id} · {a.nome}{a.local && <span className="text-[13px] font-normal text-texto-3"> · {a.local}</span>}</div>
                      {gere && !!linhas.length && <div className="flex flex-wrap gap-2"><Lancamento armario={a.id} itens={tela} tipo="reposicao" /><Lancamento armario={a.id} itens={tela} tipo="contagem" /></div>}
                    </div>
                    {!linhas.length ? <p className="text-[13px] text-texto-3">Kit vazio.</p> : (
                      <Tabela cab={["Código", "Descrição", "UM", "Saldo", "Mínimo", "Padrão", "Situação"]}>
                        {linhas.map((l) => (
                          <tr key={l.codigo} className="border-t border-borda">
                            <td className={`${TD} num`}>{l.codigo}</td><td className={TD}>{descr(a.id, l.codigo) || l.descricao}</td><td className={TD}>{l.um}</td>
                            <td className={`${TD} num font-medium`}>{R.fmtQtd(l.saldo)}</td><td className={`${TD} num`}>{R.fmtQtd(l.minimo)}</td><td className={`${TD} num`}>{R.fmtQtd(l.maximo)}</td>
                            <td className={TD}>{l.repor ? <Selo cor="laranja">Repor {R.fmtQtd(l.separar)}</Selo> : <Selo cor="verde">OK</Selo>}</td>
                          </tr>
                        ))}
                      </Tabela>
                    )}
                  </div>
                );
              })}
            </Secao>
          </>
        )}

        {visao === "Retiradas" && (() => {
          const rs = R.filtrar(movs, filtro).filter((m) => m.tipo === "retirada");
          return (
            <Secao titulo="Retiradas" destaque={`· ${inteiro(rs.length)}`} sub={`De ${dataBr(de)} a ${dataBr(ate)}, da mais nova para a mais antiga.`}
              acoes={<a href={`/api/ubm?planilha=retiradas&${qs}`} className={BOTAO_LINK}><Download className="size-4" /> Excel</a>}>
              {!rs.length ? <Vazio>Nenhuma retirada no período.</Vazio> : (
                <ul className="grid gap-3 lg:grid-cols-2">
                  {rs.slice(0, MAX_LISTA).map((m) => {
                    const o = ordens?.get(R.chaveOrdem(m.ordem));
                    return (
                      <li key={m.id} className="flex min-w-0 gap-3 rounded-cartao border border-borda bg-superficie p-3">
                        {m.foto ? (
                          <a href={fotoUrl(m)} target="_blank" rel="noopener noreferrer" className="block shrink-0 self-start overflow-hidden rounded-xl border border-borda bg-superficie-2">
                            {/* eslint-disable-next-line @next/next/no-img-element -- foto da rota autenticada, sem otimização */}
                            <img src={fotoUrl(m)} alt={`Foto da retirada de ${m.codigo}`} loading="lazy" className="size-20 object-cover" />
                            <span className="sr-only"> (abre em nova aba)</span>
                          </a>
                        ) : <div className="size-20 shrink-0 rounded-xl border border-dashed border-borda" aria-hidden />}
                        <div className="min-w-0 flex-1 text-[13px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="num font-medium">{m.codigo}</span><span>· {R.fmtQtd(m.quantidade)}</span>
                            {m.lancadoNaOrdem ? <Selo cor="verde">Lançada na ordem</Selo> : <Selo cor="vermelho">Não lançada</Selo>}
                          </div>
                          {descr(m.armario, m.codigo) && <div className="break-words text-texto-2">{descr(m.armario, m.codigo)}</div>}
                          <div className="break-words text-[12.5px] text-texto-3">
                            Ordem <span className="num text-texto-2">{m.ordem}</span>{o ? ` · ${o.texto}${o.equipamento ? ` · ${o.equipamento}` : ""}` : ordens ? " · não encontrada na IW38" : ""}
                          </div>
                          <div className="break-words text-[12.5px] text-texto-2">{m.uso}</div>
                          <div className="text-[12px] text-texto-3">{m.armario} · {m.turno} · {m.porNome} · {quando(m.em)}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {rs.length > MAX_LISTA && <p className="text-[12.5px] text-texto-3">Mostrando as {MAX_LISTA} mais novas; o Excel traz todas.</p>}
            </Secao>
          );
        })()}

        {visao === "Solicitações" && (() => {
          const ss = R.filtrar(movs, filtro).filter((m) => m.tipo === "solicitacao");
          const lista = [...abertas.filter((m) => !ss.includes(m)), ...ss].sort((a, b) => Number(!!a.fechadaEm) - Number(!!b.fechadaEm) || b.em.localeCompare(a.em));
          return (
            <Secao titulo="Solicitações" destaque={`· ${inteiro(abertas.length)} abertas`} sub="As abertas (de qualquer data) primeiro; depois as do período.">
              {!lista.length ? <Vazio>Nenhuma solicitação.</Vazio> : (
                <ul className="grid gap-2 lg:grid-cols-2">
                  {lista.slice(0, MAX_LISTA).map((m) => (
                    <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 rounded-cartao border border-borda bg-superficie p-3 text-[13px]">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {m.fechadaEm ? <Selo cor="verde">Atendida</Selo> : <Selo cor="laranja">Aberta</Selo>}
                          <span className="font-medium">{m.tipoSolicitacao ? R.TIPOS_SOLICITACAO[m.tipoSolicitacao] : "Solicitação"}</span>
                        </div>
                        <div className="mt-1">{m.codigo ? <><span className="num font-medium">{m.codigo}</span>{descr(m.armario, m.codigo) && ` · ${descr(m.armario, m.codigo)}`}</> : "Sem código"} · {R.fmtQtd(m.quantidade)}</div>
                        {m.observacao && <div className="break-words text-texto-2">{m.observacao}</div>}
                        <div className="text-[12px] text-texto-3">{m.armario} · {m.porNome} · {quando(m.em)}{m.fechadaEm && ` · atendida por ${m.fechadaPor} em ${quando(m.fechadaEm)}`}</div>
                        {m.foto && <a href={fotoUrl(m)} target="_blank" rel="noopener noreferrer" className="text-[12.5px] font-medium text-acao underline-offset-2 hover:underline">Ver a foto<span className="sr-only"> (abre em nova aba)</span></a>}
                      </div>
                      {gere && !m.fechadaEm && <BotaoAcao acao="fechar" id={m.id} rotulo="Marcar como atendida" />}
                    </li>
                  ))}
                </ul>
              )}
            </Secao>
          );
        })()}

        {visao === "Análise" && <Analise armarios={armarios} movs={movs} filtro={filtro} ordens={ordens} hoje={hoje} descr={descr} />}

        {visao === "Armários" && (
          <Secao titulo="Armários kanban" destaque={`· ${inteiro(armarios.length)}`} sub="Identificação, local e o kit (código, UM, quantidade padrão e mínimo)."
            acoes={<div className="flex flex-wrap gap-2"><Link href="/ubm/qr" className={BOTAO_LINK}><QrCode className="size-4" /> Imprimir todos os QR</Link>{gere && <EditorArmario />}</div>}>
            {!armarios.length ? <Vazio>Nenhum armário cadastrado.</Vazio> : (
              <ul className="grid gap-3">
                {armarios.map((a) => (
                  <li key={a.id} className="space-y-2 rounded-cartao border border-borda bg-superficie p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 font-display text-[16px] font-medium">{a.id} · {a.nome}{!a.ativo && <Selo>Desativado</Selo>}</div>
                        <div className="text-[12.5px] text-texto-3">{a.local || "Sem local"} · {inteiro(a.itens.length)} itens no kit</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {a.ativo && <Link href={`/ubm/qr?u=${encodeURIComponent(a.id)}`} className="inline-flex h-9 items-center gap-1 rounded-lg border border-borda px-2.5 text-[12.5px] hover:bg-superficie-2"><QrCode className="size-3.5" /> Imprimir QR</Link>}
                        {gere && <EditorArmario armario={a} />}
                      </div>
                    </div>
                    {!!a.itens.length && (
                      <details className="text-[13px]">
                        <summary className="cursor-pointer text-texto-2">Ver o kit</summary>
                        <div className="mt-2"><Tabela cab={["Código", "Descrição", "UM", "Padrão", "Mínimo"]}>
                          {a.itens.map((i) => (
                            <tr key={i.codigo} className="border-t border-borda"><td className={`${TD} num`}>{i.codigo}</td><td className={TD}>{i.descricao}</td>
                              <td className={TD}>{i.um}</td><td className={`${TD} num`}>{R.fmtQtd(i.maximo)}</td><td className={`${TD} num`}>{R.fmtQtd(i.minimo)}</td></tr>
                          ))}
                        </Tabela></div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        )}

        {visao === "Como funciona" && (
          <Secao titulo="Como funciona" sub="Do defeito à reposição do armário kanban. Toque num passo com o ícone para abrir a tela dele.">
            <Fluxograma />
          </Secao>
        )}
      </div>
    </Pagina>
  );
}

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

function Barras({ titulo, grupos, max = 12 }: { titulo: string; grupos: R.Grupo[]; max?: number }) {
  const topo = Math.max(1, ...grupos.map((g) => g.retiradas));
  return (
    <div className="min-w-0 rounded-cartao border border-borda bg-superficie p-4">
      <h3 className="mb-3 font-display text-[15px] font-medium">{titulo}</h3>
      {!grupos.length ? <p className="text-[13px] text-texto-3">Sem retiradas no filtro.</p> : (
        <ul className="space-y-2">
          {grupos.slice(0, max).map((g) => (
            <li key={g.chave || g.rotulo} className="text-[12.5px]">
              <div className="flex justify-between gap-2"><span className="min-w-0 truncate" title={g.rotulo}>{g.rotulo}</span>
                <span className="num shrink-0 text-texto-3">{inteiro(g.retiradas)} {g.retiradas === 1 ? "retirada" : "retiradas"} · {R.fmtQtd(g.quantidade)}</span></div>
              <div className="mt-1 h-2 rounded-full bg-superficie-2"><div className="h-2 rounded-full" style={{ width: `${(g.retiradas / topo) * 100}%`, background: "var(--serie-1)" }} /></div>
            </li>
          ))}
        </ul>
      )}
      {grupos.length > max && <p className="mt-2 text-[12px] text-texto-3">E mais {grupos.length - max}.</p>}
    </div>
  );
}

function Analise({ armarios, movs, filtro, ordens, hoje, descr }: { armarios: R.Armario[]; movs: R.Movimento[]; filtro: R.Filtro;
  ordens: Map<string, R.OrdemIw38> | null; hoje: string; descr: (a: string, c: string) => string }) {
  const a = R.analisar(armarios, movs, filtro, ordens, hoje);
  const descricaoDe = (c: string) => armarios.map((x) => descr(x.id, c)).find(Boolean) || "";
  const comDescricao = (g: R.Grupo) => ({ ...g, rotulo: descricaoDe(g.chave) ? `${g.chave} · ${descricaoDe(g.chave)}` : g.chave });
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Retiradas" valor={inteiro(a.retiradas)} detalhe={`${R.fmtQtd(a.quantidade)} unidades no período`} tom="azul" />
        <Kpi rotulo="Lançadas na ordem" valor={a.pctLancadas == null ? "—" : `${R.fmtQtd(a.pctLancadas)}%`} detalhe={`${inteiro(a.lancadas)} de ${inteiro(a.retiradas)} pelo SAP Mobile`}
          tom={a.pctLancadas == null || a.pctLancadas >= 95 ? "verde" : "laranja"} />
        <Kpi rotulo="Sem ordem na IW38" valor={a.semOrdemNaIw38 ? inteiro(a.semOrdemNaIw38.length) : "—"} detalhe={a.semOrdemNaIw38 ? "ordem digitada não achada" : "IW38 não carregada"} tom="laranja" />
        <Kpi rotulo="Itens parados" valor={inteiro(a.parados.length)} detalhe={`do kit, sem saída em ${R.DIAS_PARADO} dias`} tom="laranja" />
      </div>
      {!ordens && <Aviso>A IW38 não está carregada: a análise por equipamento e a conferência das ordens ficam de fora até a base chegar (as retiradas são associadas na leitura, sem regravar nada).</Aviso>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Barras titulo="Por material" grupos={a.porMaterial.map(comDescricao)} />
        <Barras titulo="Por equipamento" grupos={a.porEquipamento} />
        <Barras titulo="Por turno" grupos={a.porTurno} />
        <Barras titulo="Por armário" grupos={a.porArmario} />
        <Barras titulo="Por semana (início na segunda)" grupos={a.porSemana.map((g) => ({ ...g, rotulo: dataBr(g.chave) }))} max={20} />
        <Barras titulo="Por ordem" grupos={a.porOrdem} />
      </div>
      <Secao titulo="Retirados fora do kit" destaque={`· ${inteiro(a.foraDoKit.length)}`} sub="Códigos retirados que não estão no kit do armário: candidatos a entrar.">
        {!a.foraDoKit.length ? <Vazio>Nenhuma retirada fora do kit.</Vazio> : (
          <Tabela cab={["Armário", "Código", "Descrição", "Retiradas", "Quantidade"]}>
            {a.foraDoKit.map((g) => (
              <tr key={g.chave} className="border-t border-borda"><td className={TD}>{g.armario}</td><td className={`${TD} num`}>{g.codigo}</td>
                <td className={TD}>{descr(g.armario, g.codigo)}</td><td className={`${TD} num`}>{inteiro(g.retiradas)}</td><td className={`${TD} num`}>{R.fmtQtd(g.quantidade)}</td></tr>
            ))}
          </Tabela>
        )}
      </Secao>
      <Secao titulo="Itens do kit parados" destaque={`· ${inteiro(a.parados.length)}`} sub={`Sem retirada nos últimos ${R.DIAS_PARADO} dias: avaliar se continuam no armário.`}>
        {!a.parados.length ? <Vazio>Todos os itens do kit tiveram saída nos últimos {R.DIAS_PARADO} dias.</Vazio> : (
          <Tabela cab={["Armário", "Código", "Descrição", "UM", "Padrão", "Última retirada"]}>
            {a.parados.map((i) => (
              <tr key={`${i.armario}|${i.codigo}`} className="border-t border-borda"><td className={TD}>{i.armario}</td><td className={`${TD} num`}>{i.codigo}</td>
                <td className={TD}>{descr(i.armario, i.codigo) || i.descricao}</td><td className={TD}>{i.um}</td><td className={`${TD} num`}>{R.fmtQtd(i.maximo)}</td>
                <td className={TD}>{i.ultima ? dataBr(i.ultima) : "Nunca"}</td></tr>
            ))}
          </Tabela>
        )}
      </Secao>
      {a.semOrdemNaIw38 && (
        <Secao titulo="Retiradas com ordem fora da IW38" destaque={`· ${inteiro(a.semOrdemNaIw38.length)}`} sub="Gravadas assim mesmo; conferir o número com quem retirou ou esperar a IW38 atualizar.">
          {!a.semOrdemNaIw38.length ? <Vazio>Todas as ordens das retiradas estão na IW38.</Vazio> : (
            <Tabela cab={["Data", "Armário", "Ordem", "Código", "Quantidade", "Retirado por"]}>
              {a.semOrdemNaIw38.slice(0, MAX_LISTA).map((m) => (
                <tr key={m.id} className="border-t border-borda"><td className={TD}>{quando(m.em)}</td><td className={TD}>{m.armario}</td><td className={`${TD} num`}>{m.ordem}</td>
                  <td className={`${TD} num`}>{m.codigo}</td><td className={`${TD} num`}>{R.fmtQtd(m.quantidade)}</td><td className={TD}>{m.porNome}</td></tr>
              ))}
            </Tabela>
          )}
        </Secao>
      )}
      <Secao titulo="Solicitações abertas" destaque={`· ${inteiro(a.solicitacoesAbertas.length)}`}>
        {!a.solicitacoesAbertas.length ? <Vazio>Nenhuma solicitação aberta.</Vazio> : (
          <Tabela cab={["Data", "Armário", "Tipo", "Código", "Quantidade", "Observação"]}>
            {a.solicitacoesAbertas.map((m) => (
              <tr key={m.id} className="border-t border-borda"><td className={TD}>{quando(m.em)}</td><td className={TD}>{m.armario}</td>
                <td className={TD}>{m.tipoSolicitacao ? R.TIPOS_SOLICITACAO[m.tipoSolicitacao] : ""}</td><td className={`${TD} num`}>{m.codigo}</td>
                <td className={`${TD} num`}>{R.fmtQtd(m.quantidade)}</td><td className={TD}>{m.observacao}</td></tr>
            ))}
          </Tabela>
        )}
      </Secao>
    </div>
  );
}
