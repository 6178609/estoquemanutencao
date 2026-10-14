import type { Metadata } from "next";

import { Grafico, Linhas } from "@/components/graficos";
import { Aviso, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho, Kpi } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { inteiro } from "@/lib/formato";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { barra, contexto, dados } from "@/lib/wcm/contexto";
import * as hh from "@/lib/wcm/hh";
import * as ind from "@/lib/wcm/indicadores";
import * as sem from "@/lib/wcm/semanal";
import { dataBr } from "@/lib/wcm/util";

import { Controles } from "../planos/_comum/Controles";
import { diaDe, iso, ligado, lista, um, type Params } from "../planos/_comum/params";
import { TabelaLonga } from "../planos/_comum/TabelaLonga";
import { criticidadeRisco, operacoesDoRecorte } from "./calculo";

export const metadata: Metadata = { title: "Programação semanal" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const n1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const FAIXA_COR: Record<(typeof sem.FAIXAS_CARGA)[number], string> = {
  Folga: "var(--st-bom)", Cheia: "var(--st-atencao)", Sobrecarga: "var(--st-critico)", "Sem capacidade": "var(--texto-4)",
};

export default async function Semanal(props: { searchParams: Promise<Params> }) {
  await exigir("semanal");
  const params = await props.searchParams;
  const c = await contexto(params);
  const campoEq = await campoDoEquipamento(c);
  const b = barra(c);
  const cab = <Cabecalho titulo="Programação semanal," destaque="carga × capacidade e o que entra na semana."
    sobre="Programação · IW38OP" subtitulo="Carga × capacidade por centro de trabalho, o que está programado na semana, o que pode completar a folga e a aderência à programação das semanas anteriores." />;
  const moldura = (filhos: React.ReactNode) => (
    <PaginaWcm barra={{ ...b, recorte: "Área, centro e tipo valem aqui; a semana é a da página" }} periodo={false}>{filhos}</PaginaWcm>
  );
  if (!c.b.operacoes.dados) return moldura(<>{cab}<SemDados base="IW38OP (operações das ordens)" /></>);

  const hoje = c.b.hoje;
  const opcoes = sem.semanasParaEscolher(hoje);
  const pedida = diaDe(params, "sem");
  const seg = pedida != null && opcoes.includes(sem.segunda(pedida)) ? sem.segunda(pedida) : sem.semanaPadrao(hoje);

  const ops = operacoesDoRecorte(c);
  const d = await dados(c);
  const prog = sem.programadas(ops, seg);
  const centros = [...new Set(prog.map((p) => p.centroTrabalho).filter(Boolean))].sort();
  const executadas = ind.hhExecutadas(d);
  const disp = hh.porCentro(ind.pessoasHh(d), d.disponibilidade, seg, seg + 6);
  const confCap = Object.fromEntries(Object.entries(d.capacidade).filter(([k]) => k));
  const tec = ind.tecnicos(d);
  const cap = sem.capacidade(centros, tec, d.horasSemana, confCap, executadas, hoje, disp);
  const carga = sem.cargaPorCentro(prog, cap);
  let cand = sem.candidatos(ops, seg);
  const r = sem.resumoSemana(prog, carga, cand);

  // para completar a folga: prioridade pela saúde dos ativos; folga dos centros (sem nada na semana = capacidade inteira)
  let cabe: boolean[] = [];
  if (cand.length) {
    const { crit, risco } = await criticidadeRisco(c);
    cand = sem.candidatos(ops, seg, crit, risco);
    const comCarga = new Set(carga.map((x) => x.centroTrabalho));
    const livres = sem.capacidade([...new Set(cand.map((x) => x.centroTrabalho).filter((x) => x && !comCarga.has(x)))].sort(),
      tec, d.horasSemana, confCap, executadas, hoje, disp);
    cabe = sem.encaixar(cand, sem.folgaPorCentro(carga, livres));
  }

  // lista com os filtros da seção
  const busca = um(params, "sq"), selCtr = lista(params, "sctr"), soNao = ligado(params, "snp");
  const listaProg = sem.filtrarProgramacao(prog, { busca, centros: selCtr, soNaoProntas: soNao });

  const dadosAte = c.b.operacoes.atualizado ? new Date(c.b.operacoes.atualizado) : null;
  const ad = sem.aderencia(ops, seg, 12, dadosAte, hoje);
  const rotulo = sem.rotuloSemana(seg, hoje);

  const top = carga.slice(0, 15);
  const maxBarra = Math.max(1, ...top.map((t) => Math.max(t.hhProgramadas, t.capacidade ?? 0)));

  return moldura(
    <>
      {cab}
      <div className="space-y-2">
        <Controles controles={[{ tipo: "escolha", chave: "sem", rotulo: "Semana", valor: iso(seg),
          opcoes: opcoes.map((s) => ({ valor: iso(s), rotulo: sem.rotuloSemana(s, hoje) })) }]} />
        <p className="text-[12.5px] text-texto-3">De quinta-feira em diante a página já abre na próxima semana, a que está sendo programada. Atividade = operação do IW38OP pela data programada · capacidade: Metas e parâmetros › Equipe e capacidade; sem configuração, a disponibilidade da equipe na semana pelo Gerenciador de HH (jornada, % disponível e ausências).</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="HH programadas" valor={`${inteiro(r.hhProgramadas)} h`} detalhe={`${inteiro(r.operacoes)} operações · ${inteiro(r.ordens)} ordens`} />
        <Kpi rotulo="Capacidade" valor={r.capacidade ? `${inteiro(r.capacidade)} h` : "—"} detalhe={`${r.centrosComCapacidade} de ${r.centros} centros`}
          dica="Soma da capacidade semanal dos centros com programação na semana." />
        <Kpi rotulo="Carga" valor={r.cargaPct != null ? `${Math.round(r.cargaPct)}%` : "—"} detalhe={r.cargaPct != null ? "da capacidade" : "sem capacidade"}
          dica="HH programadas ÷ capacidade dos centros com capacidade. Acima de 100% = mais trabalho que gente." />
        <Kpi rotulo="Liberadas" valor={r.liberadasPct != null ? `${Math.round(r.liberadasPct)}%` : "—"} detalhe="prontas p/ executar"
          dica="Operações da semana cuja ordem já está Liberada no SAP (Aberta ainda precisa ser liberada)." />
        <Kpi rotulo="Atrasadas" valor={`${inteiro(r.hhAtrasadas)} h`} detalhe={`${inteiro(r.atrasadas)} operações antes da semana`}
          dica="Operações programadas antes desta semana e ainda em aberto (candidatas a completar a folga)." />
      </div>

      {!prog.length ? (
        <Aviso tom="azul">Nenhuma operação programada em {rotulo.split(" · ").slice(1).join(" · ")} no recorte.</Aviso>
      ) : (
        <>
          <div className="grid gap-4">
            <Grafico titulo="Carga × capacidade por centro de trabalho" subtitulo="Barra = HH programadas, traço = capacidade · 15 centros com mais HH"
              dica="Vermelho: carga acima de 100% da capacidade; amarelo: de 85% a 100%; cinza: centro sem capacidade cadastrada (configure em Metas e parâmetros)."
              legenda={<div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-texto-2">
                {sem.FAIXAS_CARGA.map((f) => <span key={f} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: FAIXA_COR[f] }} />{f}</span>)}
                <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[3px] rounded-full" style={{ background: "var(--texto)" }} />Capacidade</span></div>}
              tabela={{ colunas: ["Centro", "HH programadas", "Capacidade", "Carga %", "Origem"], linhas: top.map((t) => [t.centroTrabalho || "(sem centro)", Math.round(t.hhProgramadas),
                t.capacidade != null ? Math.round(t.capacidade) : "—", t.cargaPct != null ? `${Math.round(t.cargaPct)}%` : "—", t.origem ?? ""]) }}>
              <ul className="space-y-2">
                {top.map((t) => {
                  const f = sem.faixaCarga(t.cargaPct);
                  return (
                    <li key={t.centroTrabalho} className="grid grid-cols-[minmax(80px,140px)_1fr] items-center gap-3 text-[12px]" title={`${t.centroTrabalho}: ${n1(t.hhProgramadas)} h programadas · capacidade ${t.capacidade != null ? n1(t.capacidade) + " h" : "—"} (${t.origem})`}>
                      <span className="truncate text-right text-texto-2">{t.centroTrabalho || "(sem centro)"}</span>
                      <div className="relative h-5">
                        <div className="absolute inset-y-0.5 left-0 rounded-r-[4px]" style={{ width: `${(t.hhProgramadas / maxBarra) * 72}%`, background: FAIXA_COR[f] }} />
                        {t.capacidade != null && <div className="absolute -inset-y-0.5 w-[3px] rounded-full" style={{ background: "var(--texto)", left: `calc(${(t.capacidade / maxBarra) * 72}% - 1px)` }} />}
                        <span className="num absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-1.5 font-medium" style={{ left: `${(Math.max(t.hhProgramadas, t.capacidade ?? 0) / maxBarra) * 72}%` }}>
                          {inteiro(t.hhProgramadas)} h{t.cargaPct != null && <span className="text-texto-3"> · {Math.round(t.cargaPct)}%</span>}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Grafico>
          </div>

          <Secao titulo="Carga por centro de trabalho" sub="Todos os centros com programação na semana. Folga = capacidade − HH programadas.">
            <TabelaLonga altura={380} csv={`carga_semana_${iso(seg).replaceAll("-", "")}`}
              colunas={[{ titulo: "Centro de trabalho", largura: 150, fixa: true }, { titulo: "HH programadas", largura: 120, num: true }, { titulo: "Operações", largura: 96, num: true },
                { titulo: "Ordens", largura: 80, num: true }, { titulo: "Prontas %", largura: 92, num: true, dica: "Operações com a ordem liberada" },
                { titulo: "Capacidade", largura: 100, num: true }, { titulo: "Carga %", largura: 100, num: true }, { titulo: "Folga (HH)", largura: 96, num: true },
                { titulo: "Origem da capacidade", largura: 300, flex: true }]}
              linhas={carga.map((t) => {
                const f = sem.faixaCarga(t.cargaPct);
                return [t.centroTrabalho || "(sem centro)", Math.round(t.hhProgramadas), t.operacoes, t.ordens, `${Math.round(t.prontasPct)}%`,
                  t.capacidade != null ? Math.round(t.capacidade) : "—",
                  t.cargaPct != null ? { t: `${Math.round(t.cargaPct)}%`, fundo: `color-mix(in srgb, ${FAIXA_COR[f]} 22%, transparent)`, cor: "var(--texto)", dica: f } : "—",
                  t.folga != null ? Math.round(t.folga) : "—", t.origem ?? ""];
              })} />
          </Secao>

          <Secao titulo="Programação da semana" destaque={`· ${rotulo.split(" · ")[1]}`} sub="Operações não canceladas com data programada na semana. Liberada = a ordem já está Liberada no SAP.">
            <Controles controles={[
              { tipo: "busca", chave: "sq", valor: busca, placeholder: "Ordem, equipamento, texto…" },
              { tipo: "multi", chave: "sctr", rotulo: "Centro de trabalho", valor: selCtr, opcoes: centros.map((x) => ({ valor: x, n: prog.filter((p) => p.centroTrabalho === x).length })) },
              { tipo: "alternar", chave: "snp", rotulo: "Só não liberadas", valor: soNao, dica: "Ordens ainda Abertas no SAP: precisam ser liberadas antes da semana." },
            ]} />
            <TabelaLonga altura={440} csv={`programacao_semana_${iso(seg).replaceAll("-", "")}`} vazio="Nada na programação com esse filtro."
              colunas={[{ titulo: "Dia", largura: 56 }, { titulo: "Data", largura: 96 }, { titulo: "Ordem", largura: 100 }, { titulo: "Op.", largura: 60 },
                { titulo: "Texto da operação", largura: 240 }, { titulo: "Texto da ordem", largura: 240 }, { titulo: "Objeto técnico", largura: 200 },
                { titulo: "Centro de trabalho", largura: 130 }, { titulo: "HH", largura: 64, num: true }, { titulo: "Pessoas", largura: 76, num: true },
                { titulo: "Liberada", largura: 84, centro: true }, { titulo: "Situação", largura: 170 }, { titulo: "Natureza", largura: 150 }, { titulo: "Executado por", largura: 220 }]}
              linhas={listaProg.map((p) => [p.dia, dataBr(p.inicio), p.ordem, p.op, p.textoOperacao, p.textoOrdem ?? "", p.objeto, p.centroTrabalho,
                n1(p.horas), Number.isNaN(p.pessoas) ? "" : p.pessoas,
                p.pronta ? { t: "✓ sim", fundo: "color-mix(in srgb, var(--st-bom) 20%, transparent)", cor: "var(--texto)" } : { t: "não", cor: "var(--texto-3)" },
                p.situacao, p.natureza ?? "", p.executadoPor])} />
          </Secao>
        </>
      )}

      <Secao titulo="Para completar a folga" destaque="· atrasadas antes da semana"
        sub={cand.length ? `${inteiro(cand.length)} operações (${inteiro(r.hhAtrasadas)} HH) atrasadas e em aberto, na ordem de prioridade: ordem liberada primeiro, depois o equipamento de maior risco (Saúde dos ativos) e a mais antiga. ${inteiro(cabe.filter(Boolean).length)} cabem na folga de capacidade dos seus centros.` : undefined}>
        {!cand.length ? <Aviso tom="azul">Nenhuma operação atrasada antes desta semana no recorte.</Aviso> : (
          <TabelaLonga altura={400} csv={`candidatos_semana_${iso(seg).replaceAll("-", "")}`}
            rodape={cand.length > 500 ? `Mostrando as 500 primeiras de ${inteiro(cand.length)} (o CSV traz as 500)` : undefined}
            colunas={[{ titulo: "Cabe na folga", largura: 110, centro: true }, { titulo: "Ordem", largura: 100 }, { titulo: "Op.", largura: 60 },
              { titulo: "Texto da operação", largura: 240 }, { titulo: "Campo de ordenação", largura: 150 }, { titulo: "Objeto técnico", largura: 200 }, { titulo: "Centro de trabalho", largura: 130 },
              { titulo: "HH", largura: 64, num: true }, { titulo: "Liberada", largura: 84, centro: true }, { titulo: "Criticidade", largura: 96 },
              { titulo: "Risco", largura: 70, num: true, dica: "Risco do equipamento (Saúde dos ativos)" }, { titulo: "Programada para", largura: 120 },
              { titulo: "Dias de atraso", largura: 110, num: true }, { titulo: "Natureza", largura: 150 }]}
            linhas={cand.slice(0, 500).map((x, i) => [
              cabe[i] ? { t: "✓ cabe", fundo: "color-mix(in srgb, var(--st-bom) 20%, transparent)", cor: "var(--texto)" } : "",
              x.ordem, x.op, x.textoOperacao, campoEq(x.equipamento || x.objeto) || "—", x.objeto, x.centroTrabalho, n1(x.horas), x.pronta ? "✓" : "", x.criticidade,
              x.riscoEquipamento ? Math.round(x.riscoEquipamento) : "", dataBr(x.inicio), x.diasAtraso, x.natureza ?? ""])} />
        )}
      </Secao>

      <Secao titulo="Aderência à programação" destaque="· semanas anteriores"
        sub={`Operações programadas na semana e concluídas até o domingo dela ÷ programadas. A meta de ${sem.META_ADERENCIA}% é a referência de classe mundial (SMRP). Reprogramar a data no SAP muda a semana da operação — use a tendência. Só entram semanas completas no export do IW38OP.`}>
        {!ad.length ? <p className="text-[13.5px] text-texto-3">Sem operações programadas nas 12 semanas anteriores.</p> : (
          <>
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <Grafico titulo="Cumprido dentro da própria semana" subtitulo="Operações e HH · linha verde = meta"
                legenda={<div className="flex flex-wrap gap-x-4 text-[12px] text-texto-2">
                  <span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-3.5 rounded-full" style={{ background: "var(--serie-1)" }} />Aderência (operações)</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-[2px] w-3.5 rounded-full" style={{ background: "var(--serie-2)" }} />Aderência (HH)</span></div>}
                tabela={{ colunas: ["Semana (segunda)", "Aderência %", "Aderência HH %"], linhas: ad.map((a) => [dataBr(a.semana), `${n1(a.aderenciaPct)}%`, a.aderenciaHhPct == null ? "—" : `${n1(a.aderenciaHhPct)}%`]) }}>
                <Linhas rotulos={ad.map((a) => dataBr(a.semana).slice(0, 5))} formato="%" meta={sem.META_ADERENCIA} altura={240}
                  series={[{ nome: "Aderência (operações)", valores: ad.map((a) => Math.round(a.aderenciaPct * 10) / 10), cor: "serie-1" },
                    { nome: "Aderência (HH)", valores: ad.map((a) => (a.aderenciaHhPct == null ? null : Math.round(a.aderenciaHhPct * 10) / 10)), cor: "serie-2" }]} />
              </Grafico>
              <div className="grid gap-3">
                <Kpi rotulo={`Última semana completa (${dataBr(ad[ad.length - 1].semana).slice(0, 5)})`} valor={`${Math.round(ad[ad.length - 1].aderenciaPct)}%`}
                  detalhe={`${inteiro(ad[ad.length - 1].naSemana)} de ${inteiro(ad[ad.length - 1].programadas)} operações na semana`} />
                <Kpi rotulo="Média das 12 semanas" valor={`${Math.round(ad.reduce((s, a) => s + a.aderenciaPct, 0) / ad.length)}%`} detalhe={`meta ≥ ${sem.META_ADERENCIA}%`} />
              </div>
            </div>
            <TabelaLonga altura={360} csv="aderencia_programacao"
              colunas={[{ titulo: "Semana (segunda)", largura: 130 }, { titulo: "Programadas", largura: 110, num: true }, { titulo: "Na semana", largura: 100, num: true },
                { titulo: "Depois", largura: 80, num: true, dica: "Concluídas depois do domingo da semana" }, { titulo: "Pendentes", largura: 96, num: true },
                { titulo: "Aderência %", largura: 110, num: true }, { titulo: "HH programadas", largura: 120, num: true }, { titulo: "HH na semana", largura: 120, num: true },
                { titulo: "Aderência HH %", largura: 120, num: true }]}
              linhas={[...ad].reverse().map((a) => [dataBr(a.semana), a.programadas, a.naSemana, a.depois, a.pendentes, `${n1(a.aderenciaPct)}%`,
                Math.round(a.hhProgramadas), Math.round(a.hhNaSemana), a.aderenciaHhPct == null ? "—" : `${n1(a.aderenciaHhPct)}%`])} />
          </>
        )}
      </Secao>
    </>,
  );
}
