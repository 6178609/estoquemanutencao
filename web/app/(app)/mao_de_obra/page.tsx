import type { Metadata } from "next";

import { Barras, Grafico, Legenda, Tabela, type Cor } from "@/components/graficos";
import { COR_FAROL, GradeKpis } from "@/components/Indicador";
import { AbasVisao, Aviso, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { barra, contexto, dados, resultados, serieMensal } from "@/lib/wcm/contexto";
import * as hh from "@/lib/wcm/hh";
import * as ind from "@/lib/wcm/indicadores";
import { dataBr, partes, type Dia } from "@/lib/wcm/util";

import { ColunasRef } from "../confiabilidade/_comum/ColunasRef";
import { Nota, Numeros } from "../confiabilidade/_comum/Numeros";
import { maiores, somarPor } from "../confiabilidade/_comum/agregar";
import { TabelaDados, type Coluna } from "../confiabilidade/_comum/TabelaDados";
import { cargaFutura, FAIXAS_IDADE, idadeBacklog, NATUREZAS_HH, porCentroNatureza, porPessoa, porSemana, type Exec } from "./calculo";
import { Pessoas } from "./Pessoas";

export const metadata: Metadata = { title: "Mão de obra e backlog" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VISOES = ["Equipe e pessoas", "Distribuição das horas", "Backlog e carga futura"];
const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const ddmm = (d: Dia) => { const p = partes(d); return `${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}`; };
const COR_NAT: Cor[] = ["serie-1", "serie-2", "serie-3"];

type Ctx = Awaited<ReturnType<typeof contexto>>;

export default async function MaoDeObra(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigir("mao_de_obra");
  const params = await props.searchParams;
  const c = await contexto(params);
  const titulo = <Cabecalho titulo="Mão de obra," destaque="horas, equipe e backlog." sobre="Manutenção Profissional"
    subtitulo="Horas apontadas (IW47) por pessoa, centro e tipo de manutenção, utilização da equipe (Gestão de HH) e carga pendente em semanas." />;
  if (!c.b.ordens.dados) return <PaginaWcm barra={barra(c)}>{titulo}<SemDados base="IW38 (ordens)" /></PaginaWcm>;

  const [[atual, anterior], serie, d, campoEq] = await Promise.all([resultados(c), serieMensal(c), dados(c), campoDoEquipamento(c)]);
  const metas = c.cad.metas;
  const { ini, fim } = c.f;
  const visao = VISOES.includes(String(params.visao)) ? String(params.visao) : VISOES[0];
  const jan = ind.janelaApontamentos(d, ini, fim);
  const cob = atual.cobertura_hh;

  // fora da equipe da Gestão de HH
  const daEquipe = new Set((c.b.equipe.dados ?? []).map((p) => p.np));
  const fora = c.b.equipe.dados?.length ? (d.confTodos ?? []).filter((x) => x.data != null && x.data >= ini && x.data <= fim && !daEquipe.has(x.np)) : [];

  const kpis = ["hh", "utilizacao", "pct_hh_plano", "hh_emergencial", "backlog_sem", "idade_backlog"].map((id) => ind.POR_ID[id]);

  // horas executadas no período (com a atividade da IW47 quando há)
  const exAll = ind.hhExecutadas(d);
  const temConf = !!d.conf?.length;
  const ex: Exec[] = exAll.map((e, i) => ({ ...e, atividade: temConf ? d.conf![i]?.atividade ?? "" : "" }))
    .filter((e) => e.fimReal != null && e.fimReal >= ini && e.fimReal <= fim);

  return (
    <PaginaWcm barra={barra(c)}>
      {titulo}
      {!c.b.confirmacoes.dados && <Aviso tom="azul">Sem a IW47 (apontamentos) os indicadores de HH usam o trabalho das operações concluídas do IW38OP.</Aviso>}
      {cob != null && cob < 90 && (
        <Aviso>Só <b>{Math.round(cob)}%</b> das horas apontadas são de ordens que estão no IW38 carregado — as demais (provavelmente corretivas YM11/YM12,
          que não vieram no export) aparecem como “{ind.FORA_DO_IW38}” e ficam fora dos % de plano e de emergencial. Exporte o IW38 com todos os tipos de ordem.</Aviso>
      )}
      <Secao titulo="Indicadores" destaque="de mão de obra"
        sub={`Recorte: ${c.recorte} · jornada ${n1.format(d.horasSemana)} h/semana por técnico (Metas e parâmetros)${jan ? ` · apontamentos de ${dataBr(jan[0])} a ${dataBr(jan[1])}` : ""}.`}>
        <GradeKpis kpis={kpis} atual={atual} anterior={anterior} metas={metas} serie={serie} link={false} colunas={3} />
        {fora.length > 0 && (
          <Nota>Só entram as pessoas da equipe da <b className="font-medium text-texto-2">Gestão de HH</b>: {n0.format(fora.reduce((s, x) => s + x.horas, 0))} h
            de {n0.format(new Set(fora.map((x) => x.np)).size)} pessoa(s) fora dela ficaram de fora — a lista está em Qualidade dos dados (cadastre a pessoa na Gestão de HH para contar).</Nota>
        )}
        {!c.b.equipe.dados && <Nota>Sem a equipe cadastrada na Gestão de HH, as horas de todos os apontamentos da IW47 entram.</Nota>}
      </Secao>
      <Secao titulo="Detalhe" destaque="por visão">
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        {visao === "Equipe e pessoas" ? <Equipe c={c} d={d} ex={ex} jan={jan} />
          : visao === "Distribuição das horas" ? <Distribuicao d={d} ex={ex} />
            : <Backlog d={d} atual={atual} metas={metas} campoEq={campoEq} />}
      </Secao>
    </PaginaWcm>
  );
}

function Equipe({ c, d, ex, jan }: { c: Ctx; d: ind.Dados; ex: Exec[]; jan: [Dia, Dia] | null }) {
  const equipe = d.equipe;
  const tec = ind.tecnicos(d);
  const tecSet = new Set(tec.map((p) => p.np));
  const disp = ind.hhDisponiveis(d, c.f.ini, Math.min(c.f.fim, d.hoje));
  const apont = ex.filter((e) => tecSet.has(e.np)).reduce((s, e) => s + e.horas, 0);
  const semanas = jan ? (jan[1] - jan[0] + 1) / 7 : 0;
  const dispP = jan ? new Map(hh.disponibilidade(ind.pessoasHh(d), d.disponibilidade, jan[0], jan[1]).map((p) => [p.np, p.horasDisponiveis])) : null;
  const linhas = porPessoa(ex, ind.temEmergencial(d), (np) => (dispP ? dispP.get(np) ?? d.horasSemana * semanas : null));
  const cad = new Map((equipe ?? []).map((p) => [p.np, p]));
  const tabela = linhas.map((l) => {
    const p = cad.get(l.np);
    return [l.np, p?.nome || "(sem cadastro na Gestão de HH)", p?.cargo ?? "", p?.especialidade ?? "", p?.area ?? "", p?.turma ?? "", l.centro, l.horas,
      l.utilizacao, l.hhDia, l.dias, l.ordens, l.pctPlano, l.pctEmerg, l.pctFora];
  });
  const comAp = new Set(ex.map((e) => e.np));
  const semAp = equipe ? tec.filter((p) => !comAp.has(p.np)) : [];
  const contagem = (campo: "especialidade" | "area" | "turma") => maiores(somarPor(equipe ?? [], (p) => p[campo], () => 1, "—"));
  return (
    <div className="space-y-4">
      {!equipe?.length ? (
        <Aviso tom="azul">Coloque a planilha <b>Gestão de HH</b> em Fontes de dados para ver a equipe (nome, cargo, área, turma).</Aviso>
      ) : (
        <>
          <Numeros itens={[
            { rotulo: "Pessoas na equipe", valor: n0.format(equipe.length) },
            { rotulo: "Técnicos de execução", valor: n0.format(tec.length), detalhe: "sem apoio e planejamento" },
            { rotulo: "HH disponíveis no período", valor: `${n0.format(disp ?? 0)} h`, detalhe: "jornada, % e ausências (Gerenciador de HH)" },
            { rotulo: "HH apontadas pelos técnicos", valor: `${n0.format(apont)} h`, detalhe: disp ? `${n1.format((apont / disp) * 100)}% do disponível` : undefined },
          ]} />
          <div className="grid gap-4 lg:grid-cols-3">
            {([["especialidade", "Equipe por especialidade"], ["area", "Equipe por área"], ["turma", "Equipe por turma"]] as const).map(([campo, t]) => {
              const xs = contagem(campo);
              return (
                <Grafico key={campo} titulo={t} subtitulo="Pessoas da Gestão de HH" tabela={{ colunas: [t.split(" ").pop()!, "Pessoas"], linhas: xs.map(([k, v]) => [k, v]) }}>
                  <Barras itens={xs.slice(0, 12).map(([rotulo, valor]) => ({ rotulo, valor, cor: "serie-1" as Cor }))} formato="inteiro" larguraRotulo={150} />
                </Grafico>
              );
            })}
          </div>
        </>
      )}
      <div className="min-w-0 rounded-cartao border border-borda bg-superficie p-5">
        <div className="font-display text-[15px] font-medium">Horas por pessoa</div>
        <div className="mb-4 mt-0.5 text-[12.5px] text-texto-3">Apontamentos do período · utilização = HH apontadas ÷ horas disponíveis da pessoa (Gerenciador de HH; sem cadastro, jornada padrão).</div>
        {tabela.length ? <Pessoas linhas={tabela} /> : <p className="text-[13px] text-texto-3">Sem apontamentos por pessoa (IW47) no recorte.</p>}
      </div>
      {semAp.length > 0 && (
        <details className="rounded-cartao border border-borda bg-superficie p-5">
          <summary className="cursor-pointer font-display text-[15px] font-medium">{semAp.length} técnico(s) da equipe sem apontamento no período</summary>
          <div className="mt-4">
            <Tabela colunas={["Nº pessoal", "Nome", "Cargo", "Área", "Turma", "Centro de trabalho"]}
              linhas={semAp.map((p) => [p.np, p.nome, p.cargo, p.area, p.turma, p.centroTrabalho])} />
          </div>
        </details>
      )}
    </div>
  );
}

function Distribuicao({ d, ex }: { d: ind.Dados; ex: Exec[] }) {
  if (!ex.length) return <p className="text-[14px] text-texto-3">Sem horas apontadas no recorte.</p>;
  const sem = porSemana(ex);
  const rot = sem.semanas.map(ddmm);
  const pes = ind.pessoasHh(d).filter((p) => p.contaNaCapacidade);
  const semanaCheia = ind.tecnicos(d).length ? pes.reduce((s, p) => s + (p.jornada * p.disponivel) / 100, 0) : 0;
  const ct = porCentroNatureza(ex);
  const total = ex.reduce((s, e) => s + e.horas, 0);
  const cl = maiores(somarPor(ex, (e) => e.classe, (e) => e.horas, "Sem classe"));
  const temAtiv = ex.some((e) => e.atividade);
  const at = maiores(somarPor(ex, (e) => e.atividade, (e) => e.horas, "—"), 10);
  const ref = new Map(d.ordens.map((o) => [o.ordem, o]));
  const topOrd = maiores(somarPor(ex, (e) => e.ordem, (e) => e.horas), 10);
  return (
    <div className="space-y-4">
      <Grafico titulo="HH apontadas por semana" subtitulo="Por classe do tipo de ordem · tracejado = HH disponíveis dos técnicos numa semana cheia (sem ausências)"
        legenda={<Legenda series={sem.series} />}
        tabela={{ colunas: ["Semana", ...sem.classes.map((x) => x.classe), "Total"], linhas: sem.semanas.map((s, i) => [dataBr(s), ...sem.classes.map((x) => n1.format(x.valores[i])),
          n1.format(sem.classes.reduce((a, x) => a + x.valores[i], 0))]) }}>
        <ColunasRef rotulos={rot} series={sem.series} formato="h" altura={280} titulosDica={sem.semanas.map((s) => `Semana de ${dataBr(s)}`)}
          referencia={semanaCheia ? { valor: semanaCheia, rotulo: "disponível" } : null} />
        <div className="mt-3"><Nota>Planejada = preventiva, preditiva/inspeção, lubrificação e autônoma; Outras = melhoria, sem classe e ordens fora do IW38. A classe de cada tipo de ordem é configurada em Metas e parâmetros.</Nota></div>
      </Grafico>
      <div className="grid gap-4 lg:grid-cols-2">
        <Grafico titulo="HH por centro de trabalho" subtitulo="14 maiores · por natureza da ordem"
          legenda={<Legenda series={NATUREZAS_HH.map((n, i) => ({ nome: n, cor: COR_NAT[i] }))} />}
          tabela={{ colunas: ["Centro", ...NATUREZAS_HH, "Total"], linhas: ct.map((x) => [x.centro, ...x.partes.map((v) => n1.format(v)), n1.format(x.total)]) }}>
          <Barras formato="h" larguraRotulo={170} itens={ct.map((x) => ({ rotulo: x.centro, valor: x.total,
            partes: x.partes.map((v, i) => ({ nome: NATUREZAS_HH[i], valor: v, cor: COR_NAT[i] })) }))} />
        </Grafico>
        <Grafico titulo="HH por classe de manutenção" subtitulo={`${n0.format(total)} h no período`}
          tabela={{ colunas: ["Classe", "HH", "%"], linhas: cl.map(([k, v]) => [k, n1.format(v), `${n1.format((v / total) * 100)}%`]) }}>
          <Barras formato="h" larguraRotulo={190} itens={cl.map(([rotulo, valor]) => ({ rotulo, valor, cor: "serie-1" as Cor, detalhe: `${n0.format((valor / total) * 100)}% das horas` }))} />
        </Grafico>
        {temAtiv && (
          <Grafico titulo="HH por tipo de atividade" subtitulo="10 maiores (MECA, ELETRI…)" tabela={{ colunas: ["Atividade", "HH"], linhas: at.map(([k, v]) => [k, n1.format(v)]) }}>
            <Barras formato="h" larguraRotulo={150} itens={at.map(([rotulo, valor]) => ({ rotulo, valor, cor: "serie-1" as Cor }))} />
          </Grafico>
        )}
        <Grafico titulo="Ordens com mais horas apontadas" subtitulo="10 maiores no período">
          <Tabela colunas={["Ordem", "Tipo", "Texto", "HH"]} linhas={topOrd.map(([o, h]) => [o, ref.get(o)?.tipo ?? "", ref.get(o)?.texto ?? "", n1.format(h)])} />
        </Grafico>
      </div>
    </div>
  );
}

const COL_BK: Coluna[] = [
  { rotulo: "Ordem", formato: "codigo" }, { rotulo: "Tipo" }, { rotulo: "Natureza" }, { rotulo: "Texto", largo: true },
  { rotulo: "Campo de ordenação" }, { rotulo: "Equipamento", formato: "codigo" }, { rotulo: "Centro de trabalho" }, { rotulo: "Início (data-base)", formato: "data" },
  { rotulo: "Idade (dias)", formato: "inteiro" }, { rotulo: "HH pendentes", formato: "num1" }, { rotulo: "Situação" },
];
const COL_SC: Coluna[] = [
  { rotulo: "Centro" }, { rotulo: "HH pendentes", formato: "inteiro" }, { rotulo: "Capacidade/semana", formato: "inteiro" },
  { rotulo: "Semanas", formato: "sem" }, { rotulo: "Ordens", formato: "inteiro" },
];

function Backlog({ d, atual, metas, campoEq }: { d: ind.Dados; atual: ind.Resultado; metas: Record<string, Record<string, unknown>>;
  campoEq: (codigo: string | null | undefined) => string }) {
  const bk = ind.backlog(d);
  const [cap, origem] = ind.capacidadeSemanal(d, d.centros.length ? d.centros : null);
  const kB = ind.POR_ID.backlog_sem;
  const alvo = ind.meta(kB, metas);
  const temHh = bk.some((b) => b.hhPendentes != null);
  const hhTot = bk.reduce((s, b) => s + (b.hhPendentes ?? 0), 0);
  const numeros = (
    <Numeros itens={[
      { rotulo: "Ordens em aberto (até hoje)", valor: n0.format(bk.length) },
      { rotulo: "HH pendentes", valor: temHh ? `${n0.format(hhTot)} h` : "—", detalhe: "operações abertas (IW38OP)" },
      { rotulo: "Capacidade semanal", valor: cap ? `${n0.format(cap)} h` : "—", detalhe: origem },
      { rotulo: "Backlog em semanas", valor: ind.formatar(kB, atual.backlog_sem), detalhe: `meta ≤ ${ind.formatar(kB, alvo)}`, dica: kB.formula },
    ]} />
  );
  if (!bk.length) return <div className="space-y-4">{numeros}<p className="text-[14px] text-texto-3">Sem ordens em aberto no recorte.</p></div>;

  const grupos = new Map<string, ind.ItemBacklog[]>();
  for (const b of bk) if (b.centroTrabalho) (grupos.get(b.centroTrabalho) ?? grupos.set(b.centroTrabalho, []).get(b.centroTrabalho)!).push(b);
  const sc = [...grupos].map(([centro, xs]) => {
    const [capC] = ind.capacidadeSemanal(d, [centro]);
    const h = xs.reduce((s, b) => s + (b.hhPendentes ?? 0), 0);
    return { centro, h, cap: capC, semanas: capC ? h / capC : null, ordens: xs.length };
  }).sort((a, b) => b.h - a.h);
  const comSem = sc.filter((x) => x.semanas != null).sort((a, b) => b.semanas! - a.semanas!).slice(0, 14);
  const idade = idadeBacklog(bk);
  const carga = d.oper ? cargaFutura(d.oper, d.hoje) : null;
  const lista = [...bk].sort((a, b) => b.idade - a.idade).slice(0, 3000);
  return (
    <div className="space-y-4">
      {numeros}
      <div className="grid gap-4 lg:grid-cols-2">
        <Grafico titulo="Semanas de backlog por centro" subtitulo="Cor = farol contra a meta · linha verde = meta"
          dica="HH pendentes do centro ÷ capacidade semanal do centro (configurada ou média apontada nas últimas 12 semanas)."
          tabela={{ colunas: ["Centro", "HH pendentes", "Capacidade/semana", "Semanas", "Ordens"], linhas: sc.map((x) => [x.centro, n0.format(x.h), x.cap ? n0.format(x.cap) : "—", x.semanas == null ? "—" : n1.format(x.semanas), x.ordens]) }}>
          {comSem.length ? <Barras formato="sem" larguraRotulo={170} meta={alvo} itens={comSem.map((x) => {
            const f = ind.farol(kB, x.semanas, alvo);
            return { rotulo: x.centro, valor: x.semanas!, cor: COR_FAROL[f] === "neutro" ? "serie-1" : COR_FAROL[f], detalhe: `${ind.NOME_FAROL[f]} · ${n0.format(x.h)} h pendentes` };
          })} /> : <p className="text-[13px] text-texto-3">Sem capacidade conhecida por centro (configure em Metas e parâmetros).</p>}
        </Grafico>
        <Grafico titulo="Idade do backlog" subtitulo="Ordens em aberto pela data-base de início"
          legenda={<Legenda series={[{ nome: "Plano de manutenção", cor: "serie-1" }, { nome: "Backlog (sem plano)", cor: "serie-2" }]} />}
          tabela={{ colunas: ["Faixa", "Com plano", "Sem plano"], linhas: FAIXAS_IDADE.map((f, i) => [f, idade[i][0], idade[i][1]]) }}>
          <Barras formato="inteiro" larguraRotulo={120} itens={FAIXAS_IDADE.map((f, i) => ({ rotulo: f, valor: idade[i][0] + idade[i][1],
            partes: [{ nome: "Plano de manutenção", valor: idade[i][0], cor: "serie-1" as Cor }, { nome: "Backlog (sem plano)", valor: idade[i][1], cor: "serie-2" as Cor }] }))} />
        </Grafico>
      </div>
      {carga && (
        <Grafico titulo="Carga programada das próximas 12 semanas" subtitulo="Trabalho das operações abertas pela data de início · tracejado = capacidade semanal"
          tabela={{ colunas: ["Semana", "HH"], linhas: carga.map((x) => [dataBr(x.semana), n1.format(x.horas)]) }}>
          {carga.some((x) => x.horas)
            ? <ColunasRef rotulos={carga.map((x) => ddmm(x.semana))} series={[{ nome: "HH programadas", cor: "serie-1", valores: carga.map((x) => x.horas) }]}
              formato="h" altura={240} referencia={cap ? { valor: cap, rotulo: "capacidade" } : null} titulosDica={carga.map((x) => `Semana de ${dataBr(x.semana)}`)} />
            : <p className="text-[13px] text-texto-3">Sem operações abertas programadas para as próximas 12 semanas.</p>}
        </Grafico>
      )}
      <div className="min-w-0 rounded-cartao border border-borda bg-superficie p-5">
        <div className="font-display text-[15px] font-medium">Ordens em aberto</div>
        <div className="mb-4 mt-0.5 text-[12.5px] text-texto-3">Mais antigas primeiro{bk.length > lista.length ? ` · ${n0.format(lista.length)} de ${n0.format(bk.length)}` : ""}</div>
        <TabelaDados colunas={COL_BK} baixar="backlog" busca="Buscar ordem, texto, equipamento, centro…" limite={500}
          linhas={lista.map((b) => [b.ordem, b.tipo, b.natureza, b.texto, campoEq(b.equipChave), b.equipChave, b.centroTrabalho, b.data, b.idade, b.hhPendentes, b.situacao])} />
      </div>
      {sc.length > 0 && (
        <details className="rounded-cartao border border-borda bg-superficie p-5">
          <summary className="cursor-pointer font-display text-[15px] font-medium">Tabela de semanas de backlog por centro</summary>
          <div className="mt-4"><TabelaDados colunas={COL_SC} linhas={sc.map((x) => [x.centro, x.h, x.cap, x.semanas, x.ordens])} /></div>
        </details>
      )}
    </div>
  );
}
