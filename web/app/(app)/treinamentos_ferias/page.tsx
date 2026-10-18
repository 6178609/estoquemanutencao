import clsx from "clsx";
import type { Metadata } from "next";

import { AbasVisao, PaginaWcm, Secao } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { ehAdmin, podeEditar } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { emailConfigurado } from "@/lib/avisos/email";
import { destinatarios, ultimoEnvio, type Destinatario, type RegistroEnvio } from "@/lib/avisos/treinamentos";
import { itensAviso } from "@/lib/wcm/avisoTreinamentos";
import { barra, contexto } from "@/lib/wcm/contexto";
import { descrever } from "@/lib/wcm/filtros";
import * as hh from "@/lib/wcm/hh";
import * as ind from "@/lib/wcm/indicadores";
import * as tr from "@/lib/wcm/treinamentos";
import { dataBr, partes } from "@/lib/wcm/util";

import { Nota, Numeros } from "../confiabilidade/_comum/Numeros";
import { TabelaDados, type Coluna } from "../confiabilidade/_comum/TabelaDados";
import { param } from "../execucao/_ui/memo";
import { Ausencias } from "../gestao_hh/GestaoHh";
import { EnviarAgora } from "./AvisoSemanal";

export const metadata: Metadata = { title: "Treinamentos e férias" };
export const dynamic = "force-dynamic";

const VISOES = ["Visão geral", "Férias", "Treinamentos"];
const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const COR_SITUACAO: Record<tr.SituacaoReciclagem, string> = {
  "Vencido": "var(--st-critico)", "Vence em breve": "var(--st-serio)", "Em dia": "var(--st-bom)", "Sem validade": "var(--superficie-3)",
  "Agendado": "var(--serie-1)",
};

const COLS_FERIAS: Coluna[] = [
  { rotulo: "Nome", largo: true }, { rotulo: "Nº pessoal", formato: "codigo" }, { rotulo: "Centro de trabalho" },
  { rotulo: "Gozados", formato: "inteiro", dica: "Dias corridos de férias no ano civil até hoje." },
  { rotulo: "Programados", formato: "inteiro", dica: "Dias corridos de férias cadastrados daqui até o fim do ano." },
  { rotulo: `Faltam (de ${tr.DIAS_FERIAS})`, formato: "inteiro", dica: "Acompanhamento no ano civil — não é o saldo legal do período aquisitivo." },
  { rotulo: "Próximas férias", formato: "data" },
];
const COLS_RECICLAGEM: Coluna[] = [
  { rotulo: "Situação" }, { rotulo: "Treinamento", largo: true }, { rotulo: "Nome", largo: true }, { rotulo: "Centro de trabalho" },
  { rotulo: "Último em", formato: "data" }, { rotulo: "Validade", formato: "data" }, { rotulo: "Dias para vencer", formato: "inteiro" },
  { rotulo: "Próxima turma", formato: "data", dica: "Treinamento do mesmo nome já lançado para frente (não muda a validade até acontecer)." },
];
const COLS_COBERTURA: Coluna[] = [
  { rotulo: "Semana de", formato: "data" }, { rotulo: "Centro de trabalho" }, { rotulo: "Técnicos", formato: "inteiro" },
  { rotulo: "Pico de ausentes no mesmo dia", formato: "inteiro" }, { rotulo: "% do centro", formato: "%" },
];

export default async function TreinamentosFerias(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const u = await exigir("treinamentos_ferias");
  const params = await props.searchParams;
  const c = await contexto(params);
  const cab = <Cabecalho titulo="Treinamentos e férias," destaque="o planejamento da equipe." sobre="Gestão de HH"
    subtitulo="Férias e treinamentos de cada pessoa da equipe, lançados aqui ou na Gestão de HH (o mesmo cadastro): tiram horas da capacidade, aparecem na programação semanal e controlam as reciclagens." />;
  const edita = podeEditar(u);
  const cad = c.cad.hh;
  const hoje = c.b.hoje;
  const horasSemana = ind.horasSemanaDe(c.cad.metas);
  const equipe = c.b.equipe.dados ?? [];
  const pes = hh.pessoas(equipe, cad, horasSemana);
  const porNp = new Map(pes.map((p) => [p.np, p]));
  const nome = (np: string) => porNp.get(np)?.nome ?? np;
  const centro = (np: string) => porNp.get(np)?.centroTrabalho ?? "";
  const todas = hh.ausencias(cad).filter((a) => porNp.has(a.np));
  const ferias = todas.filter((a) => a.tipo === tr.FERIAS), treinos = todas.filter((a) => a.tipo === tr.TREINAMENTO);
  const linhaAus = (a: hh.Ausencia) => ({ np: a.np, id: a.id, tipo: a.tipo, de: a.de, ate: a.ate, obs: a.obs, titulo: a.titulo, horas: a.horas,
    entidade: a.entidade, validade: a.validade });
  const pessoasForm = pes.map((p) => ({ np: p.np, nome: p.nome, centro: p.centroTrabalho }));
  const { ini, fim } = c.f;
  const visao = VISOES.includes(param(params, "visao")) ? param(params, "visao") : VISOES[0];
  const rec = tr.reciclagens(treinos, hoje);
  const sugestoes = [...new Set(treinos.map((a) => a.titulo.trim()).filter(Boolean))].sort();

  if (!pes.length) {
    return (
      <PaginaWcm barra={barra(c)} dimensoes={false}>
        {cab}
        <p className="rounded-cartao border border-borda bg-superficie-2 px-5 py-4 text-[14px] text-texto-2">
          Nenhuma pessoa na equipe. Cadastre a equipe na aba <b>Gerenciador de HH</b> (visão Equipe).
        </p>
      </PaginaWcm>
    );
  }

  // aviso semanal por e-mail aos líderes (só na visão Treinamentos)
  const aviso = visao === "Treinamentos" ? await Promise.all([destinatarios(), ultimoEnvio()]).catch(() => null) : null;
  const noAviso = itensAviso(rec, new Map(pes.map((p) => [p.np, { nome: p.nome }]))).length;

  return (
    <PaginaWcm barra={barra(c)} dimensoes={false}>
      {cab}
      <Secao titulo="Planejamento" destaque={descrever(ini, fim)} sub="O período da barra do topo vale para as horas perdidas e a cobertura; férias no ano e reciclagens usam a data de hoje.">
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        {visao === "Visão geral" && <Geral />}
        {visao === "Férias" && <Ferias />}
        {visao === "Treinamentos" && <Treinamentos />}
      </Secao>
      {aviso && <AvisoSemanal para={aviso[0]} ultimo={aviso[1]} itens={noAviso} admin={ehAdmin(u) && !u.demo} />}
    </PaginaWcm>
  );

  function Geral() {
    const em30 = (lista: hh.Ausencia[]) => lista.filter((a) => a.de > hoje && a.de <= hoje + 30);
    const porTipo = tr.horasPorTipo(todas, pes, ini, fim);
    const cob = tr.cobertura([...ferias, ...treinos], pes, ini, fim);
    const alertas = cob.filter((x) => x.alerta);
    const vencidos = rec.filter((r) => r.situacao === "Vencido").length, emBreve = rec.filter((r) => r.situacao === "Vence em breve").length;
    const proximas = [...em30(ferias), ...em30(treinos)].sort((a, b) => a.de - b.de);
    return (
      <div className="space-y-5">
        <Numeros colunas={4} itens={[
          { rotulo: "Em férias hoje", valor: n0.format(new Set(tr.foraEm(ferias, hoje).map((a) => a.np)).size), detalhe: `${n0.format(new Set(em30(ferias).map((a) => a.np)).size)} saem nos próximos 30 dias` },
          { rotulo: "Em treinamento hoje", valor: n0.format(new Set(tr.foraEm(treinos, hoje).map((a) => a.np)).size), detalhe: `${n0.format(em30(treinos).length)} treinamento(s) nos próximos 30 dias` },
          { rotulo: "HH perdidas no período", valor: `${n0.format((porTipo[tr.FERIAS] ?? 0) + (porTipo[tr.TREINAMENTO] ?? 0))} h`,
            detalhe: `férias ${n0.format(porTipo[tr.FERIAS] ?? 0)} h · treinamento ${n0.format(porTipo[tr.TREINAMENTO] ?? 0)} h`,
            dica: "Dias corridos × jornada ÷ 7; treinamento com carga horária tira só essas horas (EAD/fora do horário não tira)." },
          { rotulo: "Reciclagens", valor: `${n0.format(vencidos)} vencida(s)`, detalhe: `${n0.format(emBreve)} vencem em até ${tr.JANELA_VENCIMENTO} dias` },
        ]} />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0 rounded-cartao border border-borda bg-superficie p-5">
            <div className="font-display text-[15px] font-medium">Próximos 30 dias</div>
            <div className="mb-3 mt-0.5 text-[12.5px] text-texto-3">Férias e treinamentos que começam até {dataBr(hoje + 30)}.</div>
            {proximas.length ? (
              <ul className="divide-y divide-borda text-[13px]">
                {proximas.slice(0, 15).map((a) => (
                  <li key={`${a.np}-${a.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                    <span className="num w-24 tabular-nums text-texto-2">{dataBr(a.de)}{a.ate > a.de ? ` a ${dataBr(a.ate).slice(0, 5)}` : ""}</span>
                    <span className="font-medium">{nome(a.np)}</span>
                    <span className="text-texto-3">{a.tipo}{a.titulo ? ` · ${a.titulo}` : ""} · {centro(a.np)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[13px] text-texto-3">Nada programado.</p>}
          </div>
          <div className="min-w-0 rounded-cartao border border-borda bg-superficie p-5">
            <div className="font-display text-[15px] font-medium">Cobertura por centro</div>
            <div className="mb-3 mt-0.5 text-[12.5px] text-texto-3">
              Semanas do período em que mais de {tr.LIMITE_COBERTURA}% dos técnicos de um centro ficam fora no mesmo dia (férias + treinamento).
            </div>
            {alertas.length
              ? <TabelaDados colunas={COLS_COBERTURA} baixar="cobertura_ferias_treinamentos" limite={200}
                linhas={alertas.map((x) => [x.semana, x.centro, x.tecnicos, x.pico, x.pct])} />
              : <p className="text-[13px] text-texto-3">Nenhum centro passa de {tr.LIMITE_COBERTURA}% de ausentes no mesmo dia no período.</p>}
          </div>
        </div>
      </div>
    );
  }

  function Ferias() {
    const ano = tr.feriasNoAno(ferias, pes.map((p) => p.np), hoje);
    const anoAtual = partes(hoje).ano;
    // mapa pessoa × mês (dias de férias em cada mês do ano)
    const mes0 = (m: number) => Math.round(Date.UTC(anoAtual, m, 1) / 86_400_000);
    const mapa = pes.map((p) => ({ np: p.np, meses: MESES.map((_, m) => ferias.filter((a) => a.np === p.np)
      .reduce((s, a) => s + Math.max(0, Math.min(a.ate, mes0(m + 1) - 1) - Math.max(a.de, mes0(m)) + 1), 0)) }))
      .filter((x) => x.meses.some(Boolean)).sort((a, b) => centro(a.np).localeCompare(centro(b.np)) || nome(a.np).localeCompare(nome(b.np)));
    return (
      <div className="space-y-5">
        <div className="min-w-0 rounded-cartao border border-borda bg-superficie p-5">
          <div className="font-display text-[15px] font-medium">Férias no ano de {anoAtual}</div>
          <div className="mb-4 mt-0.5 text-[12.5px] text-texto-3">Dias corridos por pessoa: gozados até hoje e programados até dezembro, contra {tr.DIAS_FERIAS} dias.</div>
          <TabelaDados colunas={COLS_FERIAS} baixar={`ferias_${anoAtual}`} limite={500} busca="Buscar nome, matrícula, centro…" ordemInicial={{ coluna: 5, desc: true }}
            linhas={ano.map((f) => [nome(f.np), f.np, centro(f.np), f.gozados, f.programados, f.restante, f.proxima])} />
        </div>
        {mapa.length > 0 && (
          <div className="min-w-0 rounded-cartao border border-borda bg-superficie p-5">
            <div className="font-display text-[15px] font-medium">Mapa de férias</div>
            <div className="mb-4 mt-0.5 text-[12.5px] text-texto-3">Dias de férias de cada pessoa em cada mês de {anoAtual} · mais escuro = mais dias.</div>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-[2px] text-[11.5px]">
                <thead><tr><th className="sticky left-0 z-10 min-w-[180px] bg-superficie pr-2 text-left font-medium text-texto-3">Pessoa</th>
                  {MESES.map((m) => <th key={m} className="min-w-[38px] font-normal text-texto-3">{m}</th>)}</tr></thead>
                <tbody>
                  {mapa.map((x) => (
                    <tr key={x.np}>
                      <td className="sticky left-0 z-10 max-w-[220px] truncate bg-superficie pr-2 text-[12px] text-texto-2" title={nome(x.np)}>{nome(x.np)} · <span className="font-mono text-[11px] text-texto-3">{centro(x.np)}</span></td>
                      {x.meses.map((d, m) => (
                        <td key={m} title={d ? `${nome(x.np)} · ${MESES[m]}: ${d} dia(s)` : undefined} className="num h-6 rounded-[4px] text-center tabular-nums"
                          style={{ background: d ? `color-mix(in oklab, var(--serie-1) ${Math.min(25 + d * 3, 100)}%, transparent)` : "var(--superficie-2)", color: d > 15 ? "white" : undefined }}>
                          {d || ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <Ausencias pessoas={pessoasForm} npsVis={null} ausencias={ferias.map(linhaAus)} hoje={hoje} edita={edita} tipos={[tr.FERIAS]}
          tipoInicial={tr.FERIAS} tituloForm="Lançar férias" nomeCsv="ferias_equipe" />
      </div>
    );
  }

  function Treinamentos() {
    const m = tr.matrizTreinamentos(rec);
    const npsMatriz = [...new Set(rec.map((r) => r.np))].sort((a, b) => centro(a).localeCompare(centro(b)) || nome(a).localeCompare(nome(b)));
    const titulos = m.titulos.slice(0, 20);
    const prioridade = rec.filter((r) => r.situacao === "Vencido" || r.situacao === "Vence em breve");
    return (
      <div className="space-y-5">
        <div className="min-w-0 rounded-cartao border border-borda bg-superficie p-5">
          <div className="font-display text-[15px] font-medium">Reciclagens</div>
          <div className="mb-4 mt-0.5 text-[12.5px] text-texto-3">
            O último treinamento já realizado de cada pessoa com o mesmo nome define a validade (uma turma agendada aparece em Próxima turma). {n0.format(prioridade.length)} vencido(s) ou vencendo em até {tr.JANELA_VENCIMENTO} dias.
          </div>
          <TabelaDados colunas={COLS_RECICLAGEM} baixar="reciclagens" limite={500} busca="Buscar treinamento, nome, centro…"
            linhas={rec.map((r) => [r.situacao, r.titulo, nome(r.np), centro(r.np), r.realizado, r.validade, r.dias, r.agendado])} vazio="Nenhum treinamento com nome cadastrado." />
        </div>
        {titulos.length > 0 && (
          <div className="min-w-0 rounded-cartao border border-borda bg-superficie p-5">
            <div className="font-display text-[15px] font-medium">Matriz pessoa × treinamento</div>
            <div className="mb-3 mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-texto-2">
              {(Object.keys(COR_SITUACAO) as tr.SituacaoReciclagem[]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: COR_SITUACAO[s] }} />{s}</span>
              ))}
              <span className="text-texto-3">· em branco = nunca fez</span>
            </div>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-[2px] text-[11.5px]">
                <thead><tr><th className="sticky left-0 z-10 min-w-[180px] bg-superficie pr-2 text-left align-bottom font-medium text-texto-3">Pessoa</th>
                  {titulos.map((t) => <th key={t.chave} className="max-w-[90px] px-1 align-bottom font-normal text-texto-3"><span className="line-clamp-3" title={t.titulo}>{t.titulo}</span></th>)}</tr></thead>
                <tbody>
                  {npsMatriz.map((np) => (
                    <tr key={np}>
                      <td className="sticky left-0 z-10 max-w-[220px] truncate bg-superficie pr-2 text-[12px] text-texto-2" title={nome(np)}>{nome(np)} · <span className="font-mono text-[11px] text-texto-3">{centro(np)}</span></td>
                      {titulos.map((t) => {
                        const r = m.celula.get(`${np}|${t.chave}`);
                        return <td key={t.chave} title={r ? `${t.titulo} · ${r.situacao}${r.validade != null ? ` (validade ${dataBr(r.validade)})` : ""}${r.agendado != null ? ` · agendado ${dataBr(r.agendado)}` : ""}` : `${t.titulo} · nunca fez`}
                          className={clsx("h-6 min-w-[44px] rounded-[4px]", !r && "border border-dashed border-borda")} style={{ background: r ? COR_SITUACAO[r.situacao] : undefined }} />;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {m.titulos.length > titulos.length && <Nota>Mostrando os {titulos.length} treinamentos mais feitos de {m.titulos.length}; a lista de reciclagens tem todos.</Nota>}
          </div>
        )}
        <Ausencias pessoas={pessoasForm} npsVis={null} ausencias={treinos.map(linhaAus)} hoje={hoje} edita={edita} tipos={[tr.TREINAMENTO]}
          tipoInicial={tr.TREINAMENTO} tituloForm="Lançar treinamento" sugestoes={sugestoes} nomeCsv="treinamentos_equipe" />
        <Nota>Carga horária: vazio = a pessoa fica fora os dias inteiros; com horas, só essas horas saem da capacidade (um curso de 16 h em 2 dias tira 8 h por dia); 0 = EAD ou fora do horário (não tira HH). Média de {n1.format(treinos.length ? treinos.filter((a) => a.horas != null).reduce((s, a) => s + (a.horas ?? 0), 0) / Math.max(treinos.filter((a) => a.horas != null).length, 1) : 0)} h por treinamento com carga horária.</Nota>
      </div>
    );
  }
}

/** Quadro do aviso semanal por e-mail: quem recebe, quando foi o último e o que vai no desta semana. */
function AvisoSemanal({ para, ultimo, itens, admin }: { para: Destinatario[]; ultimo: RegistroEnvio | null; itens: number; admin: boolean }) {
  const configurado = emailConfigurado();
  const quando = ultimo ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(ultimo.em)) : null;
  return (
    <Secao titulo="Aviso semanal" destaque="aos líderes, por e-mail"
      sub="Toda segunda, às 8h, os líderes com e-mail no cadastro de usuários recebem a lista de treinamentos vencidos ou vencendo em até 60 dias sem turma lançada, para solicitarem a reciclagem.">
      <div className="grid gap-4 rounded-cartao border border-borda bg-superficie p-5 md:grid-cols-3">
        <div>
          <div className="text-[12px] text-texto-3">Recebem ({para.length})</div>
          <div className="mt-1 text-[14px] text-texto">{para.length ? para.map((d) => d.nome).join(", ") : "Nenhum líder com e-mail ainda."}</div>
          {admin && <div className="mt-1 text-[12.5px] text-texto-3">Cadastre o e-mail em Usuários › Editar usuário (função Líder).</div>}
        </div>
        <div>
          <div className="text-[12px] text-texto-3">No aviso desta semana</div>
          <div className="num mt-1 font-display text-[22px] font-medium">{n0.format(itens)} <span className="text-[13px] font-normal text-texto-3">treinamento(s)</span></div>
        </div>
        <div className="space-y-2">
          <div className="text-[12px] text-texto-3">Último envio</div>
          <div className="text-[14px] text-texto">{quando ? `${quando} · ${ultimo!.destinatarios} líder(es) · ${ultimo!.itens} item(ns)${ultimo!.falhas?.length ? ` · falhou: ${ultimo!.falhas.join(", ")}` : ""}` : "Ainda não enviado."}</div>
          {!configurado && (
            <p className="rounded-lg bg-[var(--selo-atencao-fundo)] px-3 py-2 text-[12.5px] text-[var(--selo-atencao-texto)]">
              Envio de e-mail ainda não configurado: o administrador cadastra o servidor de e-mail (SMTP) nas variáveis da Vercel.
            </p>
          )}
          {admin && configurado && <EnviarAgora />}
        </div>
      </div>
    </Secao>
  );
}
