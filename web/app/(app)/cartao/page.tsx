import clsx from "clsx";
import { CreditCard, Download, FileText, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Barras, Grafico } from "@/components/graficos";
import { Aviso, Secao } from "@/components/PaginaWcm";
import { Cabecalho, Kpi, Pagina, Selo } from "@/components/ui";
import { ehAdmin } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { usuarios } from "@/lib/auth/usuarios";
import { hojeBr, lerCartao, papelDe } from "@/lib/cartao/dados";
import * as R from "@/lib/cartao/regras";
import { brl, inteiro } from "@/lib/formato";

import { Controles } from "../planos/_comum/Controles";
import { hrefCom, um, type Params } from "../planos/_comum/params";
import { AcoesGasto, AtivarBloco, FecharMes, FormGasto, NovoBloco } from "./Formularios";

export const metadata: Metadata = { title: "Cartão de crédito" };
export const dynamic = "force-dynamic";

const SELO: Record<R.StatusGasto, "azul" | "verde" | "vermelho"> = { [R.LANCADO]: "azul", [R.CONFERIDO]: "verde", [R.RECUSADO]: "vermelho" };
const dataBr = (d: string) => d.split("-").reverse().join("/");

export default async function Cartao(props: { searchParams: Promise<Params> }) {
  const u = await exigir("cartao");
  const params = await props.searchParams;
  const papel = papelDe(u);
  const admin = ehAdmin(u);
  const hoje = hojeBr();
  const mesAtual = R.mesDe(hoje);
  const { blocos, fechados } = await lerCartao();
  const vis = R.blocosVisiveis(papel, blocos);
  const meses = R.mesesComGasto(vis, mesAtual);
  const mes = meses.includes(um(params, "mes")) ? um(params, "mes") : mesAtual;
  const fechado = fechados.has(mes);
  // o portador (sem conferência) vai direto ao próprio bloco
  const aberto = vis.find((b) => b.id === um(params, "b")) ?? (!papel.confere && vis.length === 1 ? vis[0] : null);

  const cab = <Cabecalho titulo="Cartão de crédito," destaque="os gastos de cada portador com o cupom fiscal."
    sobre="Custos e suprimentos" subtitulo="Cada portador lança os próprios gastos e anexa o cupom (PDF ou foto); Líder e Analista conferem e fecham o mês." />;

  if (!vis.length && !papel.confere) {
    return <Pagina>{cab}<Aviso tom="azul">Você ainda não tem um bloco de cartão. Peça a um Líder ou Analista para criar o seu.</Aviso></Pagina>;
  }

  const doMes = vis.map((b) => ({ b, gs: R.doMes(b.gastos, mes) }));
  const geral = R.resumo(doMes.flatMap((x) => x.gs));
  const cadUsuarios = papel.confere ? await usuarios() : {};
  // o próprio usuário entra na lista (mesmo na demonstração, sem cadastro de usuários)
  if (papel.confere && !cadUsuarios[u.login]) cadUsuarios[u.login] = { login: u.login, nome: u.nome || u.login };
  const usuariosOpcoes = papel.confere ? Object.fromEntries(Object.entries(cadUsuarios)
    .filter(([login, v]) => v.ativo !== false && !blocos.some((b) => b.login.toLowerCase() === login.toLowerCase()))
    .map(([login, v]) => [login, `${String(v.nome || login)} (${login})`])
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))) : {};
  const rotulo = R.rotuloMes(mes);

  const controles = (
    <div className="flex flex-wrap items-center gap-2">
      <Controles limpar={["editar"]} controles={[{ tipo: "escolha", chave: "mes", rotulo: "Mês", valor: mes,
        opcoes: meses.map((m) => ({ valor: m, rotulo: `${R.rotuloMes(m)}${fechados.has(m) ? " · fechado" : ""}` })) }]} />
      <a href={`/api/cartao?planilha=${mes}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-borda bg-superficie px-4 text-[13.5px] hover:bg-superficie-2">
        <Download className="size-4" /> Planilha do mês
      </a>
      <FecharMes mes={mes} fechado={fechado} podeFechar={papel.confere} podeReabrir={admin} rotulo={rotulo} />
      {fechado && <Selo cor="cinza" className="inline-flex items-center gap-1"><Lock className="size-3" /> {rotulo} fechado</Selo>}
    </div>
  );

  return (
    <Pagina>
      {cab}
      {controles}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo={`Gastos de ${rotulo}`} valor={brl(geral.valido)} detalhe={`${inteiro(geral.gastos)} lançamento(s) · sem os recusados`} />
        <Kpi rotulo="A conferir" valor={inteiro(geral.lancados)} detalhe="lançados, ainda sem conferência" tom="azul" />
        <Kpi rotulo="Sem cupom" valor={inteiro(geral.semCupom)} detalhe="gastos sem o cupom fiscal anexado" tom="vermelho" />
        <Kpi rotulo="Recusados" valor={inteiro(geral.recusados)} detalhe={`conferidos: ${inteiro(geral.conferidos)}`} tom="vermelho" />
      </div>

      {papel.confere && (
        <Secao titulo="Portadores" destaque={`· ${inteiro(vis.length)} bloco(s)`} acoes={<NovoBloco usuarios={usuariosOpcoes} />}
          sub="Um bloco por pessoa que usa o cartão. O portador precisa ter a aba Cartão de crédito liberada em Usuários (Líder e Analista já têm).">
          {!vis.length ? <p className="text-[13.5px] text-texto-3">Nenhum bloco ainda. Crie o primeiro em “Novo bloco”.</p> : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {doMes.map(({ b, gs }) => {
                const r = R.resumo(gs);
                return (
                  <li key={b.id}>
                    <Link prefetch={false} scroll={false} href={hrefCom(params, { b: b.id, editar: null })}
                      className={clsx("block h-full rounded-cartao border bg-superficie p-4 transition hover:border-borda-forte",
                        aberto?.id === b.id ? "border-[var(--acao)]" : "border-borda", !b.ativo && "opacity-60")}>
                      <div className="flex items-center gap-2 font-medium"><CreditCard className="size-4 text-texto-3" />{b.nome}{!b.ativo && <Selo cor="cinza">desativado</Selo>}</div>
                      <div className="num mt-2 font-display text-[22px] font-medium">{brl(r.valido)}</div>
                      <div className="mt-1 text-[12px] text-texto-3">{r.gastos} gasto(s) · {r.lancados} a conferir{r.semCupom ? ` · ${r.semCupom} sem cupom` : ""}</div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Secao>
      )}

      {aberto && <BlocoAberto b={aberto} mes={mes} fechados={fechados} papel={papel} hoje={hoje} />}

      {papel.confere && geral.gastos > 0 && (
        <Grafico titulo={`Gastos por categoria · ${rotulo}`} subtitulo="Sem os recusados"
          tabela={{ colunas: ["Categoria", "Valor"], linhas: R.porCategoria(doMes.flatMap((x) => x.gs)).map(([k, v]) => [k, brl(v)]) }}>
          <Barras itens={R.porCategoria(doMes.flatMap((x) => x.gs)).map(([k, v]) => ({ rotulo: k, valor: v }))} formato="R$" larguraRotulo={180} />
        </Grafico>
      )}
    </Pagina>
  );
}

function BlocoAberto({ b, mes, fechados, papel, hoje }: { b: R.Bloco; mes: string; fechados: Set<string>; papel: R.Papel; hoje: string }) {
  const gs = R.doMes(b.gastos, mes);
  const r = R.resumo(gs);
  const podeLancar = !R.bloqueioDeEdicao(papel, b, null, fechados, R.mesDe(hoje));
  const motivoLancar = R.bloqueioDeEdicao(papel, b, null, fechados, R.mesDe(hoje));
  return (
    <Secao titulo={b.nome} destaque={`· ${R.rotuloMes(mes)} · ${brl(r.valido)}`}
      sub={`${r.gastos} gasto(s) no mês · ${r.conferidos} conferido(s) · ${r.lancados} a conferir · ${r.recusados} recusado(s)${r.semCupom ? ` · ${r.semCupom} sem cupom` : ""}`}
      acoes={papel.confere ? <AtivarBloco bloco={b.id} ativo={b.ativo} /> : undefined}>
      {podeLancar ? <FormGasto bloco={b.id} categorias={[...R.CATEGORIAS]} hoje={hoje} />
        : R.ehPortador(papel, b) && <Aviso tom="azul">{motivoLancar}</Aviso>}
      {!gs.length ? <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">Nenhum gasto em {R.rotuloMes(mes)}.</p> : (
        <ul className="space-y-2">
          {gs.map((g) => {
            const edita = !R.bloqueioDeEdicao(papel, b, g, fechados);
            const confere = papel.confere && !R.bloqueioDeConferencia(papel, g, fechados, b);
            return (
              <li key={g.id} className="rounded-cartao border border-borda bg-superficie p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num font-display text-[18px] font-medium">{brl(g.valor)}</span>
                      <Selo cor={SELO[g.status]}>{g.status}</Selo>
                      {!g.cupom && g.status !== R.RECUSADO && <Selo cor="laranja">sem cupom</Selo>}
                    </div>
                    <div className="mt-1 text-[13.5px]"><b className="font-medium">{g.estabelecimento}</b> · {g.descricao}</div>
                    <div className="mt-1 text-[12px] text-texto-3">
                      {dataBr(g.data)} · {g.categoria}{g.documento ? ` · cupom/NF ${g.documento}` : ""}{g.ordem ? ` · ordem ${g.ordem}` : ""}{g.centroCusto ? ` · CC ${g.centroCusto}` : ""}
                      {` · lançado por ${g.por}`}{g.conferidoPor ? ` · ${g.status.toLowerCase()} por ${g.conferidoPor}` : ""}
                    </div>
                    {g.motivo && <div className="mt-1 text-[12.5px] text-[var(--selo-critico-texto)]">Motivo: {g.motivo}</div>}
                  </div>
                  {g.cupom && (
                    <a href={`/api/cartao?${new URLSearchParams({ b: b.id, g: g.id })}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borda px-3 text-[12.5px] hover:bg-superficie-2">
                      <FileText className="size-3.5" /> Cupom<span className="sr-only"> (abre em nova aba)</span>
                    </a>
                  )}
                </div>
                {(edita || confere) && (
                  <div className="mt-3 border-t border-borda pt-3">
                    <AcoesGasto bloco={b.id} gasto={{ id: g.id, data: g.data, valor: g.valor, estabelecimento: g.estabelecimento, descricao: g.descricao,
                      categoria: g.categoria, documento: g.documento, ordem: g.ordem, centroCusto: g.centroCusto }}
                      categorias={[...R.CATEGORIAS]} hoje={hoje} edita={edita} confere={confere} status={g.status} temCupom={!!g.cupom} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Secao>
  );
}
