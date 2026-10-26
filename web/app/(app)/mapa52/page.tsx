import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";

import { Colunas, Grafico, type Cor } from "@/components/graficos";
import { Aviso, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho, Kpi } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { dataHora, inteiro } from "@/lib/formato";
import { barra, contexto, dados } from "@/lib/wcm/contexto";
import * as hh from "@/lib/wcm/hh";
import * as ind from "@/lib/wcm/indicadores";
import * as m52 from "@/lib/wcm/mapa52";
import * as planos from "@/lib/wcm/planos";
import { dataBr, partes } from "@/lib/wcm/util";

import { Controles } from "../planos/_comum/Controles";
import { GavetaUrl } from "../planos/_comum/GavetaUrl";
import { contagem, hrefCom, lista, um, type Params } from "../planos/_comum/params";
import { TabelaLonga, type Celula } from "../planos/_comum/TabelaLonga";
import { RolarAte } from "./RolarAte";

export const metadata: Metadata = { title: "Mapa 52 semanas" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_LINHAS = 3000;
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const n1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const pctTxt = (p: number | null) => (p == null ? "—" : `${Math.round(p)}%`);
const corCss = (c: Cor) => (c === "neutro" ? "var(--texto-4)" : `var(--${c})`);
const tinta = (c: Cor, pct: number) => `color-mix(in srgb, ${corCss(c)} ${pct}%, transparent)`;

/** Cor de cada status no mapa (sempre junto da sigla e do nome na legenda). */
const COR_STATUS: Record<m52.Status52, Cor> = {
  [m52.GERADA]: "st-bom", [m52.A_GERAR]: "serie-1", [m52.PENDENTE]: "st-critico", [m52.EXECUTADA]: "neutro", [m52.SALTADA]: "neutro",
};
const EXPLICA: Record<m52.Status52, string> = {
  [m52.GERADA]: "A ordem já foi gerada pelo plano (solicitada/chamada).",
  [m52.A_GERAR]: "Chamada em espera: a ordem ainda não foi gerada.",
  [m52.PENDENTE]: "A ordem foi gerada, mas ainda está Aberta (não liberada) no IW38.",
  [m52.EXECUTADA]: "Concluída na IP19 ou ordem encerrada no IW38.",
  [m52.SALTADA]: "Chamada ignorada na IP19 ou ordem cancelada — não conta na carga.",
};
const estilo = (s: m52.Status52) => s === m52.SALTADA
  ? { fundo: "var(--superficie-3)", cor: "var(--texto-3)" }
  : { fundo: tinta(COR_STATUS[s], s === m52.EXECUTADA ? 45 : 55), cor: "var(--texto)" };
const COR_FAIXA: Record<m52.Faixa, Cor> = { Disponível: "serie-1", Meta: "st-bom", Limite: "st-atencao", Sobrecarga: "st-critico" };
const DICA_FAIXA = "Disponível ≤ 85% · Meta 85–90% · Limite 90–95% · Sobrecarga > 95% da capacidade";

export default async function Mapa52(props: { searchParams: Promise<Params> }) {
  await exigir("mapa52");
  const params = await props.searchParams;
  const c = await contexto(params);
  const b = barra(c);
  const cab = <Cabecalho titulo="Mapa 52 semanas," destaque="os planos de manutenção do ano inteiro."
    sobre="Planos · IP19" subtitulo="Cada chamada da IP19 na sua semana do ano, com o HH previsto contra a capacidade da equipe (Gerenciador de HH)." />;
  const moldura = (filhos: React.ReactNode) => (
    <PaginaWcm barra={{ ...b, recorte: "Centro de trabalho e tipo de ordem valem aqui; o ano é o da página" }} periodo={false}>{filhos}</PaginaWcm>
  );
  const temIp19 = !!c.b.cruas.ip19.dados?.length;
  if (!temIp19 || !c.chamadas) return moldura(<>{cab}<SemDados base="IP19 (planos de manutenção)" /></>);

  const hoje = c.b.hoje;
  const todas = planos.filtrarChamadas(c.chamadas.filter((x) => !x.doIw38), { inicio: hoje, fim: hoje, centrosGlobais: c.centros, tiposGlobais: c.f.tipos });
  const anos = m52.anos(todas);
  if (!anos.length) return moldura(<>{cab}<SemDados base="IP19 com data planejada" /></>);
  const anoHoje = partes(hoje).ano;
  const pedido = Number(um(params, "ano"));
  const ano = anos.includes(pedido) ? pedido : anos.includes(anoHoje) ? anoHoje : anos[anos.length - 1];
  const per = m52.periodicidades(todas);
  const doAno = todas.filter((x) => x.ano === ano);
  const ordenar = (um(params, "ord") in m52.ORDENS ? um(params, "ord") : "centro") as m52.Ordenar;
  const selDis = lista(params, "mdis"), selCtr = lista(params, "mctr"), selPer = lista(params, "mper"), selSt = lista(params, "mst");
  const busca = um(params, "q");
  const filtro = m52.filtrar(todas, { ano, disciplinas: selDis, centros: selCtr, periodicidades: selPer, status: selSt, busca }, per);
  const linhas = m52.mapa(filtro, per, hoje, ordenar);
  const semanas = m52.semanasDoAno(ano);
  const carga = m52.cargaSemanal(filtro, semanas);

  // capacidade de cada semana: Gerenciador de HH (jornada, % disponível e ausências) ou a configurada em Metas
  const d = await dados(c);
  const pessoas = ind.pessoasHh(d);
  const conf = Object.fromEntries(Object.entries(d.capacidade ?? {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
  const disp = semanas.map((s) => hh.porCentro(pessoas, d.disponibilidade, s.segunda, s.segunda + 6));
  // centros escolhidos aqui ou na barra global: só a capacidade de quem atende esses centros; sem escolha, a equipe toda
  const ctrCap = selCtr.length ? selCtr : c.centros ?? [];
  const capSemana = disp.map((x) => (ctrCap.length ? m52.capacidadeDosCentros(ctrCap, x, conf) : conf[""] ?? (m52.capacidadeTotal(x) || null)));
  const util = carga.map((x, i) => m52.utilizacao(x.hh, capSemana[i]));
  const capMedia = capSemana.filter((x): x is number => x != null);
  const capMed = capMedia.length ? capMedia.reduce((s, x) => s + x, 0) / capMedia.length : null;

  // disciplinas (4 mais pesadas + Outras, para as cores continuarem legíveis)
  const pesoDis = new Map<string, number>();
  for (const x of filtro) pesoDis.set(m52.disciplina(x), (pesoDis.get(m52.disciplina(x)) ?? 0) + x.horas);
  const topDis = [...pesoDis.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const SER_DIS = topDis.slice(0, 4), OUTRAS = topDis.length > 4 ? "Outras" : null;
  const nomeDis = (k: string) => (SER_DIS.includes(k) ? k : "Outras");
  const serieDis = [...SER_DIS, ...(OUTRAS ? [OUTRAS] : [])];
  const corDis = (i: number): Cor => (i < 4 ? (`serie-${i + 1}` as Cor) : "neutro");

  const vis = um(params, "vis") === "mensal" ? "mensal" : "semanal";
  const uni = um(params, "uni") === "ordens" ? "ordens" : "hh";
  const mensal = m52.hhMensal(carga, semanas);
  const ordensMes = Array.from({ length: 12 }, () => ({} as Record<string, number>));
  carga.forEach((x, i) => {
    const mm = partes(semanas[i].segunda + 3).mes - 1;
    for (const [k, v] of Object.entries(x.porDisciplina)) ordensMes[mm][k] = (ordensMes[mm][k] ?? 0) + v.ordens;
  });
  const capMes = Array.from({ length: 12 }, () => 0);
  capSemana.forEach((v, i) => { if (v != null) capMes[partes(semanas[i].segunda + 3).mes - 1] += v; });
  const valorProj = (dis: string) => vis === "semanal"
    ? carga.map((x) => Object.entries(x.porDisciplina).filter(([k]) => nomeDis(k) === dis).reduce((s, [, v]) => s + (uni === "hh" ? v.hh : v.ordens), 0))
    : (uni === "hh" ? mensal : ordensMes).map((m) => Object.entries(m).filter(([k]) => nomeDis(k) === dis).reduce((s, [, v]) => s + v, 0));

  const cobertura = { de: doAno.length ? Math.min(...doAno.map((x) => x.semana!)) : null, ate: doAno.length ? Math.max(...doAno.map((x) => x.semana!)) : null };
  const proj = new Map(serieDis.map((dn) => [dn, valorProj(dn)]));
  // utilização por centro no ano: capacidade só das semanas que a IP19 cobre (fora delas não há carga para comparar)
  const centrosAno = [...new Set(filtro.map((x) => x.centroTrabalho).filter(Boolean))];
  const porCentroAno = centrosAno.map((ct) => {
    const hhC = carga.reduce((s, x) => s + (x.porCentro[ct]?.hh ?? 0), 0);
    const ordC = carga.reduce((s, x) => s + (x.porCentro[ct]?.ordens ?? 0), 0);
    let cap = 0, tem = false, origem = "";
    disp.forEach((x, i) => { if (cobertura.de == null || i + 1 < cobertura.de || i + 1 > cobertura.ate!) return; const r = m52.capacidadeDoCentro(ct, x, conf); origem ||= r.horas != null ? r.origem : ""; if (r.horas != null) { cap += r.horas; tem = true; } });
    return { centro: ct, hh: hhC, ordens: ordC, cap: tem ? cap : null, origem: origem || "sem equipe cadastrada", util: m52.utilizacao(hhC, tem ? cap : null) };
  }).sort((a, b) => (b.util ?? -1) - (a.util ?? -1) || b.hh - a.hh);

  // indicadores do topo
  const hhAno = carga.reduce((s, x) => s + x.hh, 0);
  const ordAno = carga.reduce((s, x) => s + x.ordens, 0);
  const semanasComCarga = carga.map((x, i) => ({ x, u: util[i] })).filter((y) => y.x.hh > 0);
  const utilMedia = semanasComCarga.some((y) => y.u != null)
    ? semanasComCarga.filter((y) => y.u != null).reduce((s, y) => s + y.u!, 0) / semanasComCarga.filter((y) => y.u != null).length : null;
  const sobrecarga = util.filter((u) => m52.faixa(u) === "Sobrecarga").length;
  const pendentes = filtro.filter((x) => m52.status52(x) === m52.PENDENTE).length;
  const semIp19 = semanas.filter((_, i) => !doAno.some((x) => x.semana === i + 1)).length;

  const opcoes = (f: (x: planos.ChamadaClassificada) => string) => contagem(doAno.map(f));
  const controles = (
    <Controles limpar={["sem"]} controles={[
      { tipo: "escolha", chave: "ano", rotulo: "Ano", valor: String(ano), opcoes: anos.map((a) => ({ valor: String(a), rotulo: String(a) })) },
      { tipo: "multi", chave: "mdis", rotulo: "Disciplina", valor: selDis, opcoes: opcoes(m52.disciplina) },
      { tipo: "multi", chave: "mctr", rotulo: "Centro de trabalho", valor: selCtr, opcoes: opcoes((x) => x.centroTrabalho) },
      { tipo: "multi", chave: "mper", rotulo: "Periodicidade", valor: selPer, opcoes: opcoes((x) => per.get(x.chave)?.nome ?? "") },
      { tipo: "multi", chave: "mst", rotulo: "Status", valor: selSt,
        opcoes: m52.STATUS.map((s) => ({ valor: s, n: doAno.filter((x) => m52.status52(x) === s).length })) },
      { tipo: "busca", chave: "q", valor: busca, placeholder: "Plano, texto, local, equipamento…" },
      { tipo: "escolha", chave: "ord", rotulo: "Ordenar", valor: ordenar, opcoes: Object.entries(m52.ORDENS).map(([valor, rotulo]) => ({ valor, rotulo })) },
    ]} />
  );

  const legenda = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-texto-2">
      {m52.STATUS.map((s) => {
        const e = estilo(s);
        return (
          <span key={s} className="inline-flex items-center gap-1.5" title={EXPLICA[s]}>
            <span className="grid h-4 min-w-6 place-items-center rounded-[4px] px-1 text-[9.5px] font-semibold" style={{ background: e.fundo, color: e.cor }}>{m52.SIMBOLO[s]}M</span>{s}
          </span>
        );
      })}
      <span className="inline-flex items-center gap-1.5" title="Data planejada já passou e a chamada não foi executada"><b className="text-[var(--st-critico)]">!</b> atrasada</span>
      <span className="text-texto-3">Sigla = periodicidade (S semanal, Q quinzenal, M mensal, 2M bimestral, 6M semestral, A anual)</span>
    </div>
  );

  // faixa das semanas (cabeçalho do mapa): % da capacidade; tocar abre a semana
  const hrefSem = (n: number) => hrefCom(params, { sem: String(n) });
  // abre na semana atual (ano corrente) ou na primeira com chamada; 40 px por semana, 2 semanas de folga à esquerda
  const semHoje = ano === anoHoje ? planos.semanaIso(hoje).semana : cobertura.de ?? 1;
  const faixaSemanas = (
    <RolarAte x={(semHoje - 3) * 40} className="overflow-x-auto rounded-xl border border-borda bg-superficie">
      <div className="flex min-w-max">
        <div className="sticky left-0 z-[1] flex w-[150px] shrink-0 flex-col justify-end border-r border-borda bg-superficie-2 px-3 py-1.5 text-[11px] text-texto-3">
          <span>Semana</span><span className="font-medium text-texto-2">% da capacidade{capMed ? ` (${inteiro(capMed)} HH/sem)` : ""}</span>
        </div>
        {semanas.map((s, i) => {
          const f = m52.faixa(util[i]);
          const novoMes = i === 0 || semanas[i - 1].mes !== s.mes;
          return (
            <Link prefetch={false} key={s.n} href={hrefSem(s.n)} scroll={false}
              aria-label={`Semana ${s.rotulo}: ${carga[i].hh > 0 ? `${pctTxt(util[i])} da capacidade` : "sem chamadas"}`}
              title={`Semana ${s.rotulo} · ${dataBr(s.segunda)} a ${dataBr(s.segunda + 6)} · ${n1(carga[i].hh)} HH · ${carga[i].ordens} ordens · capacidade ${capSemana[i] != null ? n1(capSemana[i]!) + " HH" : "—"}`}
              className={clsx("flex w-10 shrink-0 flex-col items-center gap-0.5 px-0.5 py-1.5 text-center transition hover:bg-superficie-2", novoMes && "border-l border-borda")}>
              <span className="h-3.5 text-[10px] font-semibold uppercase text-texto-3">{novoMes ? s.mes : ""}</span>
              <span className="num text-[11px] text-texto-2">{s.rotulo}</span>
              <span className="num w-full rounded-[4px] py-0.5 text-[10.5px] font-medium"
                style={f && carga[i].hh > 0 ? { background: tinta(COR_FAIXA[f], f === "Disponível" ? 25 : 45), color: "var(--texto)" } : { color: "var(--texto-4)" }}>
                {carga[i].hh > 0 ? pctTxt(util[i]) : "·"}
              </span>
            </Link>
          );
        })}
      </div>
    </RolarAte>
  );

  const cortadas = linhas.length > MAX_LINHAS;
  const visiveis = linhas.slice(0, MAX_LINHAS);
  const semAberta = Number(um(params, "sem"));
  const sAberta = semanas.find((s) => s.n === semAberta) ?? null;

  return moldura(
    <>
      {cab}
      <div className="space-y-3">
        {controles}
        <p className="text-[12.5px] text-texto-3">
          IP19 de {dataHora(c.b.cruas.ip19.atualizado)} · {inteiro(filtro.length)} chamadas de {inteiro(linhas.length)} planos em {ano}
          {cobertura.de != null && ` · a IP19 cobre da semana ${cobertura.de} à ${cobertura.ate}`}. Só o que a IP19 trouxer: nada é projetado.
        </p>
        {semIp19 > 4 && (
          <Aviso tom="azul">A IP19 enviada cobre só parte de {ano}: {semIp19} semanas estão sem chamadas. Para ver o ano inteiro, exporte a IP19 do SAP com
            horizonte de 12 meses (ou mais) e envie em <Link prefetch={false} href="/dados" className="font-medium underline">Fontes de dados</Link>.</Aviso>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi rotulo="Planos" valor={inteiro(linhas.length)} detalhe={`em ${ano}`} />
        <Kpi rotulo="Ordens previstas" valor={inteiro(ordAno)} detalhe="chamadas no ano (sem as saltadas)" />
        <Kpi rotulo="HH previsto" valor={inteiro(hhAno)} detalhe="soma do trabalho das operações" />
        <Kpi rotulo="Utilização média" valor={pctTxt(utilMedia)} detalhe="das semanas com carga" dica="HH previsto ÷ capacidade, média das semanas com chamada." />
        <Kpi rotulo="Semanas em sobrecarga" valor={inteiro(sobrecarga)} detalhe="acima de 95% da capacidade" tom="vermelho" />
        <Kpi rotulo="Pendentes de liberação" valor={inteiro(pendentes)} detalhe="ordem gerada, ainda Aberta" tom="vermelho" />
      </div>

      <Secao titulo={`Mapa 52 semanas · ${ano}`} destaque={`· ${inteiro(linhas.length)} planos · ${inteiro(ordAno)} ordens · ${inteiro(hhAno)} HH`}
        sub="Uma linha por plano, uma coluna por semana ISO. O símbolo e a cor são o status da chamada; a sigla, a periodicidade. A faixa de semanas (% da capacidade) rola à parte do mapa. Toque numa semana da faixa para abrir a programação dela; toque num plano para ver as chamadas.">
        {legenda}
        {faixaSemanas}
        {cortadas && <Aviso>Muitos planos no filtro: o mapa mostra os {inteiro(MAX_LINHAS)} primeiros. Use os filtros para ver o resto.</Aviso>}
        <TabelaLonga altura={640} csv={`mapa_52_semanas_${ano}`} rotuloCsv="Exportar Excel" vazio="Nenhum plano com chamada nesse ano e filtro."
          colunas={[{ titulo: "Plano", largura: 86, fixa: true }, { titulo: "Texto", largura: 230 }, { titulo: "Centro", largura: 96 },
            { titulo: "HH/ch.", largura: 70, num: true, dica: "HH de uma chamada (média)" }, { titulo: "Per.", largura: 54, centro: true, dica: "Periodicidade" },
            ...semanas.map((s) => ({ titulo: s.rotulo, largura: 46, centro: true, dica: `${s.mes} · ${dataBr(s.segunda)} a ${dataBr(s.segunda + 6)}` })),
            { titulo: "Local", largura: 200 }, { titulo: "Equipamento", largura: 200 }, { titulo: "Disciplina", largura: 110 }, { titulo: "Chamadas", largura: 84, num: true },
            { titulo: "HH no ano", largura: 90, num: true }]}
          links={visiveis.map((l) => hrefCom(params, { plano: l.chave }))}
          linhas={visiveis.map((l): Celula[] => [l.chave, l.texto, l.centro, Math.round(l.hhChamada * 10) / 10, l.periodicidade.sigla,
            ...semanas.map((s): Celula => {
              const x = l.celulas[s.n];
              if (!x) return "";
              const e = estilo(x.status);
              return { t: `${m52.SIMBOLO[x.status]}${l.periodicidade.sigla}${x.n > 1 ? `×${x.n}` : ""}${x.atrasada ? "!" : ""}`, fundo: e.fundo, cor: e.cor,
                dica: `${x.status}${x.atrasada ? " · atrasada" : ""} · ${x.n} chamada(s) · ${n1(x.hh)} HH` };
            }), l.local, l.equipamento, l.disciplina, l.chamadas, Math.round(l.hh * 10) / 10])} />
      </Secao>

      <Grafico titulo="Carga semanal de HH × capacidade" subtitulo={`${ano} · ${semanas.length} semanas ISO · traço = capacidade da semana · ${DICA_FAIXA}`}
        legenda={<div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-texto-2">
          {m52.FAIXAS.map((f) => <span key={f} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: corCss(COR_FAIXA[f]) }} />{f}</span>)}
          <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed" style={{ borderColor: "var(--st-bom)" }} />Capacidade</span></div>}
        tabela={{ colunas: ["Semana", "Período", "HH", "Ordens", "Capacidade", "Utilização"], linhas: semanas.map((s, i) =>
          [s.rotulo, `${dataBr(s.segunda)} a ${dataBr(s.segunda + 6)}`, n1(carga[i].hh), carga[i].ordens, capSemana[i] != null ? n1(capSemana[i]!) : "—", pctTxt(util[i])]) }}>
        {/* uma série por faixa (só uma tem valor em cada semana): a cor da barra é a faixa de utilização */}
        <Colunas rotulos={semanas.map((s) => `S${s.rotulo}`)} empilhar formato="inteiro" altura={240} rotular="nenhum" nomeMetaPorRotulo="Capacidade"
          metaPorRotulo={capSemana}
          series={[...m52.FAIXAS.map((f) => ({ nome: f, cor: COR_FAIXA[f], valores: carga.map((x, i) => (m52.faixa(util[i]) === f ? Math.round(x.hh * 10) / 10 : 0)) })),
            { nome: "Sem capacidade", cor: "neutro" as Cor, valores: carga.map((x, i) => (util[i] == null ? Math.round(x.hh * 10) / 10 : 0)) }]} />
      </Grafico>

      <div className="grid gap-4 lg:grid-cols-2">
        <Grafico titulo="Projeção de planos" subtitulo={`${ano} · ${vis} · ${uni === "hh" ? "homem-hora" : "ordens"} por disciplina${uni === "hh" ? " · traço = capacidade" : ""}`}
          acoes={<div className="flex gap-1.5">
            <Alternar params={params} chave="vis" atual={vis} opcoes={[["mensal", "Mensal"], ["semanal", "Semanal"]]} />
            <Alternar params={params} chave="uni" atual={uni} opcoes={[["hh", "HH"], ["ordens", "Ordens"]]} />
          </div>}
          legenda={<LegendaDis nomes={serieDis} cor={corDis} />}
          tabela={{ colunas: [vis === "semanal" ? "Semana" : "Mês", ...serieDis], linhas: (vis === "semanal" ? semanas.map((s) => `S${s.rotulo}`) : MESES)
            .map((r, i) => [r, ...serieDis.map((dn) => n1(proj.get(dn)![i]))]) }}>
          <Colunas rotulos={vis === "semanal" ? semanas.map((s) => `S${s.rotulo}`) : MESES} empilhar formato="inteiro" altura={240} rotular="nenhum"
            metaPorRotulo={uni === "hh" ? (vis === "semanal" ? capSemana : capMes.map((v) => v || null)) : undefined} nomeMetaPorRotulo="Capacidade"
            series={serieDis.map((dn, i) => ({ nome: dn, cor: corDis(i), valores: proj.get(dn)!.map((v) => Math.round(v * 10) / 10) }))} />
        </Grafico>

        <Grafico titulo="HH mensal por disciplina" subtitulo={`${ano} · mês da quinta-feira da semana ISO (padrão SAP)`}
          legenda={<LegendaDis nomes={serieDis} cor={corDis} />}
          tabela={{ colunas: ["Mês", ...serieDis, "Total"], linhas: MESES.map((mm, i) => [mm, ...serieDis.map((dn) =>
            n1(Object.entries(mensal[i]).filter(([k]) => nomeDis(k) === dn).reduce((s, [, v]) => s + v, 0))), n1(Object.values(mensal[i]).reduce((s, v) => s + v, 0))]) }}>
          <Colunas rotulos={MESES} empilhar formato="inteiro" altura={240} rotular="todos"
            series={serieDis.map((dn, i) => ({ nome: dn, cor: corDis(i),
              valores: mensal.map((m) => Math.round(Object.entries(m).filter(([k]) => nomeDis(k) === dn).reduce((s, [, v]) => s + v, 0) * 10) / 10) }))} />
        </Grafico>
      </div>

      <Secao titulo="Utilização por centro de trabalho" destaque={`· ${ano}`}
        sub="HH previsto no ano ÷ capacidade da equipe que atende o centro (mesmo código, ou mesmo final: COMPONEN → MEC_COMP, ELE_COMP…). Traço = 100%.">
        <CargaCentros itens={porCentroAno.map((x) => ({ centro: x.centro, hh: x.hh, ordens: x.ordens, cap: x.cap, util: x.util, origem: x.origem }))} />
      </Secao>

      {sAberta && (
        <GavetaUrl parametro="sem" titulo={`Semana ${sAberta.rotulo} · ${ano}`}
          subtitulo={`${dataBr(sAberta.segunda)} a ${dataBr(sAberta.segunda + 6)} · programação prevista pelos filtros atuais`}>
          <DetalheSemana s={sAberta} ch={filtro.filter((x) => x.semana === sAberta.n)} carga={carga[sAberta.n - 1]} cap={capSemana[sAberta.n - 1]}
            disp={disp[sAberta.n - 1]} conf={conf} per={per} hoje={hoje} />
        </GavetaUrl>
      )}
      {um(params, "plano") && (
        <GavetaUrl parametro="plano" titulo={`Plano ${um(params, "plano")}`} subtitulo={linhas.find((l) => l.chave === um(params, "plano"))?.texto}>
          <Chamadas ch={filtro.filter((x) => x.chave === um(params, "plano")).sort((a, b) => (a.data ?? 0) - (b.data ?? 0))} per={per} hoje={hoje}
            csv={`plano_${um(params, "plano").replace(/\W+/g, "_")}`} />
        </GavetaUrl>
      )}
    </>,
  );
}

function Alternar({ params, chave, atual, opcoes }: { params: Params; chave: string; atual: string; opcoes: [string, string][] }) {
  return (
    <div className="inline-flex rounded-lg border border-borda p-0.5 text-[12px]">
      {opcoes.map(([v, r]) => (
        <Link prefetch={false} key={v} href={hrefCom(params, { [chave]: v, sem: null, plano: null })} scroll={false}
          className={clsx("rounded-md px-2.5 py-1 transition", v === atual ? "bg-tinta text-tinta-texto" : "text-texto-2 hover:bg-superficie-2")}>{r}</Link>
      ))}
    </div>
  );
}

function LegendaDis({ nomes, cor: c }: { nomes: string[]; cor: (i: number) => Cor }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-texto-2">
      {nomes.map((n, i) => <span key={n} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: corCss(c(i)) }} />{n}</span>)}
    </div>
  );
}

/** Barras horizontais de HH × capacidade (traço em 100%), uma por centro. */
function CargaCentros({ itens }: { itens: { centro: string; hh: number; ordens: number; cap: number | null; util: number | null; origem: string }[] }) {
  if (!itens.length) return <p className="text-[13px] text-texto-3">Nenhum centro com carga no filtro.</p>;
  const max = Math.max(110, ...itens.map((x) => x.util ?? 0));
  return (
    <ul className="space-y-2.5">
      {itens.map((x) => {
        const f = m52.faixa(x.util);
        return (
          <li key={x.centro} className="grid grid-cols-[minmax(84px,120px)_1fr] items-center gap-3 text-[12px]" title={x.origem}>
            <span className="truncate font-medium">{x.centro}</span>
            <div>
              <div className="flex justify-between gap-2 text-[11.5px] text-texto-3">
                <span>{inteiro(x.ordens)} ord · {n1(x.hh)}{x.cap != null ? ` / ${n1(x.cap)}` : ""} HH</span>
                <span className="num font-medium text-texto">{x.util != null ? pctTxt(x.util) : "s/ cap."}</span>
              </div>
              <div className="relative mt-1 h-2 rounded-full bg-superficie-3">
                <div className="h-2 rounded-full" style={{ width: `${Math.min(100, ((x.util ?? 0) / max) * 100)}%`, background: f ? corCss(COR_FAIXA[f]) : "var(--texto-4)" }} />
                <div className="absolute -inset-y-1 w-[2px] rounded-full bg-[var(--texto)]" style={{ left: `${(100 / max) * 100}%` }} />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DetalheSemana({ s, ch, carga, cap, disp, conf, per, hoje }: { s: m52.Semana; ch: planos.ChamadaClassificada[]; carga: m52.CargaSemana; hoje: number;
  cap: number | null; disp: Record<string, [number, number]>; conf: Record<string, number>; per: Map<string, m52.Periodicidade> }) {
  const util = m52.utilizacao(carga.hh, cap);
  const centros = Object.entries(carga.porCentro).map(([centro, v]) => {
    const c = m52.capacidadeDoCentro(centro, disp, conf);
    return { centro, hh: v.hh, ordens: v.ordens, cap: c.horas, util: m52.utilizacao(v.hh, c.horas), origem: c.origem };
  }).sort((a, b) => (b.util ?? -1) - (a.util ?? -1) || b.hh - a.hh);
  const ord = ch.slice().sort((a, b) => (a.centroTrabalho < b.centroTrabalho ? -1 : a.centroTrabalho > b.centroTrabalho ? 1 : (a.data ?? 0) - (b.data ?? 0)));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi rotulo="Ordens" valor={inteiro(carga.ordens)} />
        <Kpi rotulo="HH" valor={n1(carga.hh)} />
        <Kpi rotulo="Utilização" valor={pctTxt(util)} detalhe={cap != null ? `cap. ${n1(cap)} HH` : "sem capacidade"} />
        <Kpi rotulo="Sem ordem" valor={inteiro(carga.semOrdem)} detalhe="ainda a gerar" />
      </div>
      <div>
        <div className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-texto-2">Carga por centro</div>
        <p className="mb-2 text-[11.5px] text-texto-3">Capacidade de cada centro = equipe que o atende (passe o dedo/mouse para ver qual); centros atendidos pela mesma equipe mostram a mesma capacidade.</p>
        <CargaCentros itens={centros} />
      </div>
      <Chamadas ch={ord} per={per} hoje={hoje} csv={`semana_${s.rotulo}`} />
    </>
  );
}

function Chamadas({ ch, per, csv, hoje }: { ch: planos.ChamadaClassificada[]; per: Map<string, m52.Periodicidade>; csv: string; hoje?: number }) {
  return (
    <TabelaLonga altura={420} csv={csv} rotuloCsv="Baixar Excel" copiar rodape={`${inteiro(ch.length)} chamada(s)`}
      colunas={[{ titulo: "Data", largura: 92 }, { titulo: "Plano", largura: 80 }, { titulo: "Texto", largura: 220 }, { titulo: "Centro", largura: 96 },
        { titulo: "Per.", largura: 70 }, { titulo: "Status", largura: 160 }, { titulo: "Ordem", largura: 90 }, { titulo: "HH", largura: 60, num: true },
        { titulo: "Disciplina", largura: 110 }, { titulo: "Local", largura: 180 }]}
      linhas={ch.map((x): Celula[] => {
        const st = m52.status52(x), e = estilo(st);
        const atrasada = hoje != null && x.data != null && x.data < hoje && st !== m52.EXECUTADA && st !== m52.SALTADA;
        return [dataBr(x.data), x.chave, x.texto, x.centroTrabalho, per.get(x.chave)?.nome ?? "", { t: st + (atrasada ? " · atrasada" : ""), fundo: e.fundo, cor: e.cor },
          x.ordem, Math.round(x.horas * 10) / 10, m52.disciplina(x), x.local];
      })} />
  );
}
