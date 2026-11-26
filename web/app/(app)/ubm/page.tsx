import { ArrowRight, Download, Lock, QrCode } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AbasVisao, Aviso, Secao } from "@/components/PaginaWcm";
import { Cabecalho, Kpi, Pagina, Selo } from "@/components/ui";
import { podeVerValores } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { precosOuNada } from "@/lib/dados/custo";
import { precoDe, valorDe, type Precos } from "@/lib/dados/custoMaterial";
import { brl, inteiro } from "@/lib/formato";
import * as D from "@/lib/ubm/dados";
import * as R from "@/lib/ubm/regras";
import * as V from "@/lib/ubm/validacao";

import { Controles } from "../planos/_comum/Controles";
import { um, type Params } from "../planos/_comum/params";
import { BotaoAcao, EditorArmario, Lancamento } from "./Acoes";
import { ArmarioVisual } from "./ArmarioVisual";
import { Fluxograma } from "./Fluxograma";
import { BaixarQr } from "./qr/Imprimir";
import { ItemValidacao } from "./Validacao";

export const metadata: Metadata = { title: "UBM (armário kanban)" };
export const dynamic = "force-dynamic";

const VALIDACAO = "Validação do líder";
const VISOES = ["Visão geral", VALIDACAO, "Retiradas", "Solicitações", "Análise", "Armários", "Como funciona"];
const FUSO = "America/Sao_Paulo";
const MAX_LISTA = 200;
/** Retiradas por página (cada uma com a miniatura da foto). */
const POR_PAGINA = 50;
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
 * Retirada: o líder confirma, pela IW13 das ordens de quebra, se o material veio da UBM ou do Almox (sub-aba "Validação
 * do líder", regras em lib/ubm/validacao.ts); solicitação pelo QR (formulário do celular em ./solicitacao). Aqui o
 * planejamento vê o saldo, a lista de reposição, as retiradas confirmadas, as solicitações, a análise e o cadastro dos
 * armários. Regras em lib/ubm/regras.ts; gravação em lib/ubm/dados.ts pela rota /api/ubm.
 */
export default async function Ubm(props: { searchParams: Promise<Params> }) {
  const u = await exigir("ubm");
  const params = await props.searchParams;
  const visao = VISOES.includes(um(params, "visao")) ? um(params, "visao") : VISOES[0];
  const gere = D.podeGerir(u);
  const valida = D.podeValidar(u);
  const hoje = hojeBr();
  const [armarios, movs] = await Promise.all([D.lerArmarios(), D.lerMovimentos()]);
  const armario = armarios.some((a) => a.id === um(params, "u")) ? um(params, "u") : "";
  const diasPadrao = visao === VALIDACAO ? V.DIAS_PADRAO : 90;
  const de = /^\d{4}-\d{2}-\d{2}$/.test(um(params, "ude")) ? um(params, "ude") : somarDias(hoje, -(diasPadrao - 1));
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(um(params, "uate")) ? um(params, "uate") : hoje;
  const filtro = { armario, de, ate };
  const doArmario = armarios.filter((a) => !armario || a.id === armario);
  const saldo = R.saldoDoKit(doArmario, movs);
  const repor = saldo.filter((l) => l.repor);
  const abertas = R.filtrar(movs, { armario }).filter((m) => m.tipo === "solicitacao" && !m.fechadaEm);
  const ordens = visao === "Análise" || visao === "Retiradas" ? await D.ordensIw38() : null;
  // validação do líder: IW13 × ordens de quebra só na sub-aba dela; a Análise lê só as decisões; a Visão geral mostra o
  // total guardado da última abertura da validação no período padrão (sem recalcular), ou só o link
  const [iw13, quebras] = visao === VALIDACAO ? await Promise.all([D.linhasIw13(), D.ordensDeQuebra()]) : [null, null];
  const validacoes = visao === VALIDACAO || visao === "Análise" ? await D.lerValidacoes() : [];
  const pend = visao === VALIDACAO ? V.pendencias(iw13?.dados ?? [], quebras ?? new Map(), armarios, movs, validacoes, filtro) : [];
  if (visao === VALIDACAO && iw13?.dados && de === somarDias(hoje, -(V.DIAS_PADRAO - 1)) && ate === hoje) D.guardarAValidar(armario, V.totalPendente(pend));
  const aValidar = visao === "Visão geral" ? D.aValidarGuardado(armario) : null;
  const codigos = new Set(movs.map((m) => m.codigo).filter(Boolean));
  const catalogo = visao === "Armários" || visao === "Como funciona" ? new Map<string, string>() : await D.descricoesCatalogo(codigos);
  const kitDesc = new Map(armarios.flatMap((a) => a.itens.map((i) => [`${a.id}|${i.codigo}`, i.descricao] as const)));
  const descr = (armarioId: string, codigo: string) => catalogo.get(codigo) || kitDesc.get(`${armarioId}|${codigo}`) || "";
  const qs = new URLSearchParams({ u: armario, de, ate }).toString();
  // preço médio do SAP (base custo_material): só para quem vê valores e nas sub-abas que mostram valor
  const precos = podeVerValores(u) && (visao === "Visão geral" || visao === "Análise" || visao === "Armários") ? await precosOuNada() : null;
  const valorRepor = precos ? R.valorDaReposicao(repor, precos) : null;

  const controles = (
    <Controles className="min-w-0 flex-1" controles={[
      { tipo: "escolha", chave: "u", rotulo: "Armário", valor: armario,
        opcoes: [{ valor: "", rotulo: "Todos" }, ...armarios.map((a) => ({ valor: a.id, rotulo: `${a.id} · ${a.nome}` }))] },
      ...(visao === "Retiradas" || visao === "Análise" || visao === "Solicitações" || visao === VALIDACAO ? [{ tipo: "periodo" as const, de: "ude", ate: "uate", valorDe: de, valorAte: ate,
        atalhos: [{ rotulo: "Últimos 30 dias", de: somarDias(hoje, -29), ate: hoje }, { rotulo: "Últimos 90 dias", de: somarDias(hoje, -89), ate: hoje },
          { rotulo: "Últimos 12 meses", de: somarDias(hoje, -364), ate: hoje }] }] : []),
    ]} />
  );

  return (
    <Pagina>
      <Cabecalho titulo="UBM," destaque="o armário kanban em campo." sobre="Custos e suprimentos"
        subtitulo="Itens estratégicos do Almox perto da máquina para reduzir o MTTR. O líder confirma pela IW13 se o material das ordens de quebra veio da UBM ou do Almox; o planejamento vê o saldo, o que repor e a análise das saídas."
        acoes={<Link href="/ubm/qr" className={BOTAO_LINK}><QrCode className="size-4" /> Etiquetas QR</Link>} />
      <div className="space-y-6">
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        {!gere && (
          <p className="inline-flex items-center gap-1.5 text-[12.5px] text-texto-3">
            <Lock className="size-3.5" aria-hidden />{valida ? "Você valida as retiradas (IW13) e registra solicitações pelo QR" : "Você registra solicitações pelo QR (a validação das retiradas é do líder)"}; armários, reposição, contagem e desfazer validações ficam com os editores do PCM.
          </p>
        )}
        {visao !== "Como funciona" && <div className="flex flex-wrap items-center gap-2">{controles}</div>}

        {visao === "Visão geral" && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi rotulo="Armários ativos" valor={inteiro(doArmario.filter((a) => a.ativo).length)} detalhe={`${inteiro(saldo.length)} itens nos kits`} tom="azul" />
              <Kpi rotulo="Itens para repor" valor={inteiro(repor.length)} detalhe="abaixo do mínimo" tom={repor.length ? "laranja" : "verde"} />
              <Kpi rotulo="Solicitações abertas" valor={inteiro(abertas.length)} detalhe="acabou, faltando ou reposição" tom={abertas.length ? "laranja" : "verde"} />
              <Link href={`?${new URLSearchParams({ visao: VALIDACAO, ...(armario ? { u: armario } : {}) })}`} className="block rounded-cartao focus-visible:outline-2"
                aria-label={aValidar == null ? "A validar: ver a validação do líder" : `A validar: ${inteiro(aValidar)} materiais de ordens de quebra (abrir a validação do líder)`}>
                <Kpi rotulo="A validar" valor={aValidar == null ? "—" : inteiro(aValidar)}
                  detalhe={aValidar == null ? "Ver validação (IW13 das ordens de quebra)" : "materiais de ordens de quebra (30 dias) · abrir"} tom={aValidar ? "laranja" : aValidar == null ? "azul" : "verde"} />
              </Link>
            </div>

            {doArmario.some((a) => a.ativo) && (
              <Secao titulo={doArmario.filter((a) => a.ativo).length === 1 ? "O armário" : "Os armários"}
                sub="Uma gaveta por família do kit; o laranja marca item abaixo do mínimo. Os QR da porta abrem os formulários.">
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {doArmario.filter((a) => a.ativo).map((a) => (
                    <ArmarioVisual key={a.id} armario={a} linhas={saldo.filter((l) => l.armario === a.id)
                      .map((l) => ({ ...l, descricao: descr(a.id, l.codigo) || l.descricao }))} />
                  ))}
                </div>
              </Secao>
            )}

            <div id="reposicao" className="scroll-mt-20">
              <Secao titulo="Lista de reposição" destaque={`· ${inteiro(repor.length)}`}
                sub={`Saldo abaixo do mínimo: separar a quantidade padrão − saldo.${valorRepor ? ` Valor a separar: ${brl(valorRepor.total)} (preço médio do SAP${valorRepor.semPreco ? `; ${inteiro(valorRepor.semPreco)} item(ns) sem preço` : ""}).` : ""}`}
                acoes={<a href={`/api/ubm?planilha=reposicao&${qs}`} className={BOTAO_LINK}><Download className="size-4" /> Excel</a>}>
                {!repor.length ? <Vazio>Nada para repor{armario ? ` no ${armario}` : ""}.</Vazio> : (
                  <Tabela cab={["Armário", "Código", "Descrição", "UM", "Saldo", "Mínimo", "Padrão", "Separar", ...(precos ? ["Preço médio", "Valor"] : [])]}>
                    {repor.map((l) => (
                      <tr key={`${l.armario}|${l.codigo}`} className="border-t border-borda">
                        <td className={TD}>{l.armario}</td><td className={`${TD} num`}>{l.codigo}</td><td className={TD}>{descr(l.armario, l.codigo) || l.descricao}</td>
                        <td className={TD}>{l.um}</td><td className={`${TD} num`}>{R.fmtQtd(l.saldo)}</td><td className={`${TD} num`}>{R.fmtQtd(l.minimo)}</td>
                        <td className={`${TD} num`}>{R.fmtQtd(l.maximo)}</td><td className={`${TD} num font-semibold`}>{R.fmtQtd(l.separar)}</td>
                        {precos && <ColunasValor precos={precos} codigo={l.codigo} quantidade={l.separar} um={l.um} />}
                      </tr>
                    ))}
                  </Tabela>
                )}
              </Secao>
            </div>

            <Secao titulo="Saldo dos armários" sub="Contagem fixa o saldo; reposição soma; retirada subtrai.">
              {!doArmario.length ? <Vazio>Nenhum armário cadastrado. {gere ? "Cadastre em “Armários”." : ""}</Vazio> : doArmario.filter((a) => a.ativo).map((a) => {
                const linhas = saldo.filter((l) => l.armario === a.id);
                const tela = linhas.map((l) => ({ codigo: l.codigo, descricao: descr(a.id, l.codigo) || l.descricao, um: l.um, saldo: l.saldo, separar: l.separar }));
                const kit = precos ? R.valorDoKit(a.itens, precos) : null;
                return (
                  <div key={a.id} className="space-y-2 rounded-cartao border border-borda bg-superficie p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-display text-[16px] font-medium">{a.id} · {a.nome}{a.local && <span className="text-[13px] font-normal text-texto-3"> · {a.local}</span>}</div>
                        {kit && <ValorKit v={kit} />}
                      </div>
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
          const paginas = Math.max(1, Math.ceil(rs.length / POR_PAGINA));
          const pag = Math.min(paginas, Math.max(1, Number.parseInt(um(params, "pag"), 10) || 1));
          const linkPag = (n: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))), pag: String(n) })}`;
          return (
            <Secao titulo="Retiradas" destaque={`· ${inteiro(rs.length)}`} sub={`Confirmadas pelo líder na validação da IW13 (e as antigas do QR), de ${dataBr(de)} a ${dataBr(ate)}, da mais nova para a mais antiga.`}
              acoes={<a href={`/api/ubm?planilha=retiradas&${qs}`} className={BOTAO_LINK}><Download className="size-4" /> Excel</a>}>
              {!rs.length ? <Vazio>Nenhuma retirada no período.</Vazio> : (
                <ul className="grid gap-3 lg:grid-cols-2">
                  {rs.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA).map((m) => {
                    const o = ordens?.get(R.chaveOrdem(m.ordem));
                    return (
                      <li key={m.id} className="flex min-w-0 gap-3 rounded-cartao border border-borda bg-superficie p-3">
                        {m.foto ? (
                          <a href={fotoUrl(m)} target="_blank" rel="noopener noreferrer" className="block shrink-0 self-start overflow-hidden rounded-xl border border-borda bg-superficie-2">
                            {/* eslint-disable-next-line @next/next/no-img-element -- foto da rota autenticada, sem otimização */}
                            <img src={fotoUrl(m)} alt={`Foto da retirada de ${m.codigo}`} loading="lazy" className="size-20 object-cover" />
                            <span className="sr-only"> (abre em nova aba)</span>
                          </a>
                        ) : null}
                        <div className="min-w-0 flex-1 text-[13px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="num font-medium">{m.codigo}</span><span>· {R.fmtQtd(m.quantidade)}</span>
                            {m.origem === "validacao" ? <Selo cor="verde">Validação do líder (IW13)</Selo> : <Selo>QR de retirada (antigo)</Selo>}
                          </div>
                          {descr(m.armario, m.codigo) && <div className="break-words text-texto-2">{descr(m.armario, m.codigo)}</div>}
                          <div className="break-words text-[12.5px] text-texto-3">
                            Ordem <span className="num text-texto-2">{m.ordem}</span>{o ? ` · ${o.texto}${o.equipamento ? ` · ${o.equipamento}` : ""}` : ordens ? " · não encontrada na IW38" : ""}
                          </div>
                          {m.origem !== "validacao" && m.uso && <div className="break-words text-[12.5px] text-texto-2">{m.uso}</div>}
                          <div className="text-[12px] text-texto-3">{m.armario}{m.turno ? ` · ${m.turno}` : ""} · {m.origem === "validacao" ? "confirmada por" : "retirada por"} {m.porNome} · {quando(m.em)}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {paginas > 1 && (
                <nav aria-label="Páginas das retiradas" className="flex flex-wrap items-center gap-2 text-[13px]">
                  {pag > 1 && <Link prefetch={false} href={linkPag(pag - 1)} className={BOTAO_LINK}>Anteriores</Link>}
                  <span className="text-texto-3">Página {pag} de {paginas} · {POR_PAGINA} por página (o Excel traz todas)</span>
                  {pag < paginas && <Link prefetch={false} href={linkPag(pag + 1)} className={BOTAO_LINK}>Próximas</Link>}
                </nav>
              )}
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

        {visao === VALIDACAO && (
          <ValidacaoLider iw13={iw13} quebras={quebras} pend={pend} armarios={armarios} validacoes={validacoes} filtro={filtro}
            decisao={um(params, "dec")} gere={gere} valida={valida} descr={descr} qs={qs} />
        )}

        {visao === "Análise" && <Analise armarios={armarios} movs={movs} filtro={filtro} ordens={ordens} hoje={hoje} descr={descr} validacoes={validacoes} precos={precos} />}

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
                        {precos && !!a.itens.length && <ValorKit v={R.valorDoKit(a.itens, precos)} />}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {a.ativo && <Link href={`/ubm/qr?u=${encodeURIComponent(a.id)}`} className="inline-flex h-9 items-center gap-1 rounded-lg border border-borda px-2.5 text-[12.5px] hover:bg-superficie-2"><QrCode className="size-3.5" /> Imprimir QR</Link>}
                        {gere && <EditorArmario armario={a} />}
                      </div>
                    </div>
                    {a.ativo && (
                      <div className="space-y-1.5 rounded-xl border border-borda bg-superficie-2 p-2.5 text-center">
                        <div className="text-[12px] font-semibold uppercase tracking-wide text-texto-3">QR de solicitação</div>
                        <BaixarQr armario={a.id} qual="solicitacao" />
                      </div>
                    )}
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

/** Preço médio e quantidade × preço (sem preço, ou com outra UM que a do SAP: "—"). */
function ColunasValor({ precos, codigo, quantidade, um: umQtd }: { precos: Precos; codigo: string; quantidade: number; um: string }) {
  const p = precoDe(precos, codigo), v = valorDe(precos, codigo, quantidade, umQtd);
  return <><td className={`${TD} num`}>{p == null ? <span className="text-texto-3">sem preço</span> : brl(p)}</td>
    <td className={`${TD} num`}>{v == null ? <span className="text-texto-3" title={p == null ? undefined : "UM do kit diferente da UM do SAP"}>—</span> : brl(v)}</td></>;
}

/** "Valor do kit: R$ … (quantidade padrão × preço médio)". */
function ValorKit({ v }: { v: { total: number; semPreco: number } }) {
  return (
    <div className="text-[12.5px] text-texto-3" data-valor-kit>
      Valor do kit: <span className="num font-semibold text-texto-2">{brl(v.total)}</span> (padrão × preço médio{v.semPreco ? `; ${inteiro(v.semPreco)} item(ns) sem preço` : ""})
    </div>
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

function Analise({ armarios, movs, filtro, ordens, hoje, descr, validacoes, precos }: { armarios: R.Armario[]; movs: R.Movimento[]; filtro: R.Filtro;
  ordens: Map<string, R.OrdemIw38> | null; hoje: string; descr: (a: string, c: string) => string; validacoes: V.Validacao[]; precos: Precos | null }) {
  const a = R.analisar(armarios, movs, filtro, ordens, hoje);
  const v = V.analisarValidacoes(validacoes, armarios, movs, filtro);
  const descricaoDe = (c: string) => armarios.map((x) => descr(x.id, c)).find(Boolean) || "";
  const comDescricao = (g: R.Grupo) => ({ ...g, rotulo: descricaoDe(g.chave) ? `${g.chave} · ${descricaoDe(g.chave)}` : g.chave });
  const valorRet = precos ? R.valorDasRetiradas(armarios, movs, filtro, precos) : null;
  return (
    <div className="space-y-6">
      <div className={`grid grid-cols-2 gap-3 ${valorRet ? "lg:grid-cols-3 xl:grid-cols-6" : "lg:grid-cols-5"}`}>
        {valorRet && <Kpi rotulo="Valor das retiradas" valor={brl(valorRet.total)}
          detalhe={`quantidade × preço médio do SAP${valorRet.semPreco ? ` · ${inteiro(valorRet.semPreco)} sem preço` : ""}`} tom="azul" />}
        <Kpi rotulo="Retiradas" valor={inteiro(a.retiradas)} detalhe={`${R.fmtQtd(a.quantidade)} unidades no período`} tom="azul" />
        <Kpi rotulo="Veio da UBM" valor={v.pctUbm == null ? "—" : `${R.fmtQtd(v.pctUbm)}%`} detalhe={`${inteiro(v.ubm)} UBM · ${inteiro(v.almox)} Almox nas validações`}
          tom={v.pctUbm == null || v.pctUbm >= 50 ? "verde" : "laranja"} />
        <Kpi rotulo="Tempo até a validação" valor={v.diasMedia == null ? "—" : `${R.fmtQtd(v.diasMedia)} d`}
          detalhe={v.diasMedia == null ? "sem validações no período" : `média · mediana ${R.fmtQtd(v.diasMediana ?? 0)} d · maior ${inteiro(v.diasMax ?? 0)} d`} tom="azul" />
        <Kpi rotulo="Sem ordem na IW38" valor={a.semOrdemNaIw38 ? inteiro(a.semOrdemNaIw38.length) : "—"} detalhe={a.semOrdemNaIw38 ? "ordem digitada não achada" : "IW38 não carregada"} tom="laranja" />
        <Kpi rotulo="Itens parados" valor={inteiro(a.parados.length)} detalhe={`do kit, sem saída em ${R.DIAS_PARADO} dias`} tom="laranja" />
      </div>
      {!ordens && <Aviso>A IW38 não está carregada: a análise por equipamento e a conferência das ordens ficam de fora até a base chegar (as retiradas são associadas na leitura, sem regravar nada).</Aviso>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Barras titulo="Por material" grupos={a.porMaterial.map(comDescricao)} />
        <Barras titulo="Por equipamento" grupos={a.porEquipamento} />
        <Barras titulo="Por líder (quem confirmou)" grupos={a.porLider} />
        <Barras titulo="Por armário" grupos={a.porArmario} />
        <Barras titulo="Por semana (início na segunda)" grupos={a.porSemana.map((g) => ({ ...g, rotulo: dataBr(g.chave) }))} max={20} />
        <Barras titulo="Por ordem" grupos={a.porOrdem} />
      </div>
      <Secao titulo="Itens do kit em ordens de quebra que vieram do Almox" destaque={`· ${inteiro(v.doAlmox.length)}`}
        sub="Validados como “veio do Almox”. O saldo é o da UBM no dia do lançamento na IW13: sem saldo pede revisar o mínimo; com saldo, a UBM não foi usada.">
        {!v.doAlmox.length ? <Vazio>Nenhum item do kit veio do Almox no período.</Vazio> : (
          <Tabela cab={["Lançado na IW13", "Ordem", "Código", "Descrição", "Tomado", "Saldo na UBM", "Situação", "Validado por"]}>
            {v.doAlmox.slice(0, MAX_LISTA).map((x) => (
              <tr key={x.chave} className="border-t border-borda"><td className={TD}>{dataBr(x.dataIw13)}</td><td className={`${TD} num`}>{x.ordem}</td>
                <td className={`${TD} num`}>{x.codigo}</td><td className={TD}>{armarios.map((ar) => descr(ar.id, x.codigo)).find(Boolean) || ""}</td>
                <td className={`${TD} num`}>{V.qtdUm(x.tomada, x.um)}</td><td className={`${TD} num`}>{R.fmtQtd(x.saldoNaData)}</td>
                <td className={TD}><Selo cor={x.motivo === "nao_usada" ? "amarelo" : "laranja"}>{V.MOTIVOS[x.motivo]}</Selo></td><td className={TD}>{x.porNome}</td></tr>
            ))}
          </Tabela>
        )}
      </Secao>
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
                <td className={TD}>{i.ultima ? dataBr(R.diaBr(i.ultima)) : "Nunca"}</td></tr>
            ))}
          </Tabela>
        )}
      </Secao>
      {a.semOrdemNaIw38 && (
        <Secao titulo="Retiradas com ordem fora da IW38" destaque={`· ${inteiro(a.semOrdemNaIw38.length)}`} sub="Gravadas assim mesmo; conferir o número com quem retirou ou esperar a IW38 atualizar.">
          {!a.semOrdemNaIw38.length ? <Vazio>Todas as ordens das retiradas estão na IW38.</Vazio> : (
            <Tabela cab={["Data", "Armário", "Ordem", "Código", "Quantidade", "Por"]}>
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

const MAX_ORDENS = 100;
/** Dias inteiros desde o instante (null sem data válida): idade do envio da IW13. */
function diasDesde(iso: string | null | undefined): number | null {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(t) ? null : Math.floor((new Date().getTime() - t) / 86_400_000);
}

/** Sub-aba "Validação do líder": pendências por ordem de quebra (IW13) e o histórico das decisões. */
function ValidacaoLider({ iw13, quebras, pend, armarios, validacoes, filtro, decisao, gere, valida, descr, qs }: {
  iw13: Awaited<ReturnType<typeof D.linhasIw13>> | null; quebras: Map<string, V.InfoOrdem> | null; pend: V.OrdemPendente[]; armarios: R.Armario[];
  validacoes: V.Validacao[]; filtro: R.Filtro; decisao: string; gere: boolean; valida: boolean; descr: (a: string, c: string) => string; qs: string }) {
  const total = V.totalPendente(pend);
  const hist = V.filtrarValidacoes(validacoes, { ...filtro, decisao });
  const diasIw13 = diasDesde(iw13?.atualizado);
  const descrItem = (codigo: string, iw13Desc: string) => armarios.map((a) => descr(a.id, codigo)).find(Boolean) || iw13Desc;
  const linkDec = (d: string) => `?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(qs)), visao: VALIDACAO, ...(d ? { dec: d } : {}) })}`;
  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-[13.5px] text-texto-2">
        O material usado nas <b>ordens de quebra</b> é lançado na ordem pelo SAP Mobile e aparece na IW13, que não diz se saiu do armário kanban ou do
        Almox. Confirme cada item: <b>Veio da UBM</b> baixa o saldo do armário; <b>Veio do Almox</b> só registra.
      </p>
      {!iw13?.dados ? (
        <Aviso>A IW13 (consumo de materiais das ordens) não está carregada: <Link prefetch={false} href="/dados" className="font-medium underline">Envie a IW13 em Fontes de dados</Link>.</Aviso>
      ) : diasIw13 != null && diasIw13 > V.DIAS_IW13_VELHA ? (
        <Aviso>A IW13 foi enviada em {quando(iw13.atualizado!)} (há {inteiro(diasIw13)} dias): o consumo mais novo ainda não aparece. <Link prefetch={false} href="/dados" className="font-medium underline">Envie a IW13 em Fontes de dados</Link>.</Aviso>
      ) : iw13.atualizado ? <p className="text-[12.5px] text-texto-3">IW13 enviada em {quando(iw13.atualizado)}.</p> : null}
      {!valida && <p className="inline-flex items-center gap-1.5 text-[12.5px] text-texto-3"><Lock className="size-3.5" aria-hidden />A validação é do líder: você vê a lista, sem os botões.</p>}
      {iw13?.dados && !quebras && <Aviso>A IW38 e a IW28 não estão carregadas: sem elas não dá para saber quais ordens são de quebra.</Aviso>}

      <Secao titulo="A validar" destaque={`· ${inteiro(total)}`} sub={`Ordens de quebra com material do kit lançado na IW13 de ${dataBr(filtro.de ?? "")} a ${dataBr(filtro.ate ?? "")}, a mais recente primeiro.`}
        acoes={<a href={`/api/ubm?planilha=validacao&${qs}${decisao ? `&dec=${decisao}` : ""}`} className={BOTAO_LINK}><Download className="size-4" /> Excel</a>}>
        {!pend.length ? <Vazio>Nada para validar no período{filtro.armario ? ` no ${filtro.armario}` : ""}.</Vazio> : (
          <ul className="grid gap-4 xl:grid-cols-2">
            {pend.slice(0, MAX_ORDENS).map((o) => (
              <li key={o.chaveOrdem} className="min-w-0 space-y-3 rounded-cartao border border-borda bg-superficie-2 p-3 sm:p-4" aria-label={`Ordem ${o.ordem}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-display text-[16px] font-medium">Ordem <span className="num">{o.ordem}</span></span>
                    <Selo cor="laranja">Quebra{o.info?.tipo ? ` · ${o.info.tipo}` : ""}</Selo>
                  </div>
                  {(o.info?.texto || o.info?.notaTexto) && <div className="break-words text-[13px] text-texto-2">{o.info?.texto || o.info?.notaTexto}</div>}
                  <div className="break-words text-[12.5px] text-texto-3">
                    {o.equipamento ? <>Equipamento <span className="num">{o.equipamento}</span>{o.info?.denominacao ? ` · ${o.info.denominacao}` : ""} · </> : null}
                    lançado na IW13 em {dataBr(o.data)}{o.info?.nota ? ` · nota ${o.info.nota}` : ""}
                  </div>
                </div>
                <ul className="grid gap-2">
                  {o.itens.map((i) => <ItemValidacao key={i.chave} item={{ ...i, descricao: descrItem(i.codigo, i.descricao) }} pode={valida} />)}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {pend.length > MAX_ORDENS && <p className="text-[12.5px] text-texto-3">Mostrando {MAX_ORDENS} de {inteiro(pend.length)} ordens; o Excel traz todas.</p>}
      </Secao>

      <Secao titulo="Histórico das validações" destaque={`· ${inteiro(hist.length)}`} sub="Quem validou, quando e a decisão (pela data da validação, no período escolhido)."
        acoes={
          <nav aria-label="Filtrar a decisão" className="flex flex-wrap gap-1.5">
            {[["", "Todas"], ["ubm", "Veio da UBM"], ["almox", "Veio do Almox"]].map(([d, r]) => (
              <Link key={d} prefetch={false} href={linkDec(d)} aria-current={decisao === d || (!d && decisao !== "ubm" && decisao !== "almox") ? "true" : undefined}
                className="inline-flex h-11 items-center rounded-full border border-borda px-4 text-[13px] hover:bg-superficie-2 aria-[current]:border-[var(--acao)] aria-[current]:bg-[var(--selo-bom-fundo)] aria-[current]:font-medium">{r}</Link>
            ))}
          </nav>
        }>
        {!hist.length ? <Vazio>Nenhuma validação no período.</Vazio> : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {hist.slice(0, MAX_LISTA).map((x) => (
              <li key={x.chave} className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-cartao border border-borda bg-superficie p-3 text-[13px]">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Selo cor={x.decisao === "ubm" ? "verde" : "azul"}>{V.DECISOES[x.decisao]}</Selo>
                    <span className="num font-medium">{x.codigo}</span><span>· {V.qtdUm(x.quantidade, x.um)}{x.decisao === "ubm" ? ` do ${x.armario}` : ""}</span>
                  </div>
                  <div className="break-words text-texto-2">Ordem <span className="num">{x.ordem}</span>{x.equipamento ? ` · equipamento ${x.equipamento}` : ""}{x.dataIw13 ? ` · IW13 de ${dataBr(x.dataIw13)}` : ""}</div>
                  <div className="text-[12px] text-texto-3">{x.porNome} · {quando(x.em)}</div>
                </div>
                {gere && <BotaoAcao acao="desfazer" id={x.chave} rotulo="Desfazer"
                  confirmar={x.decisao === "ubm" ? "Desfazer a validação? A retirada criada por ela sai e o saldo do armário volta." : "Desfazer a validação? A linha volta a ficar pendente."} />}
              </li>
            ))}
          </ul>
        )}
        {!!hist.length && <p className="inline-flex items-center gap-1 text-[12.5px] text-texto-3"><ArrowRight className="size-3.5" aria-hidden />As retiradas confirmadas ficam também em “Retiradas”.</p>}
      </Secao>
    </div>
  );
}
