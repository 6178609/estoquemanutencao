import { Lock } from "lucide-react";
import type { Metadata } from "next";

import { AbasVisao, Secao } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { podeEditar } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { contexto, dados } from "@/lib/wcm/contexto";
import * as ind from "@/lib/wcm/indicadores";

import { EditorCapacidade, EditorJornada, EditorMetas, EditorTipos, type LinhaCapacidade, type LinhaMeta, type LinhaTipo } from "./Editores";

export const metadata: Metadata = { title: "Metas e parâmetros" };
export const dynamic = "force-dynamic";

const VISOES = ["Metas dos indicadores", "Equipe e capacidade", "Tipos de ordem"];
const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const UNIDADE: Record<string, string> = { "%": "%", h: "horas", dias: "dias", "R$": "R$", un: "quantidade", sem: "semanas" };

export default async function Metas(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const u = await exigir("metas");
  const params = await props.searchParams;
  const edita = podeEditar(u);
  const visao = VISOES.includes(String(params.visao)) ? String(params.visao) : VISOES[0];
  const c = await contexto(params);
  const cad = c.cad.metas;

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-10 px-4 py-8 sm:px-8 sm:py-12">
      <Cabecalho titulo="Metas e parâmetros," destaque="o que o farol de cada indicador usa." sobre="Configuração"
        subtitulo="Metas de cada indicador, jornada da equipe, capacidade por centro de trabalho e classificação dos tipos de ordem. Vale para todas as abas." />
      {!edita && (
        <p className="flex items-center gap-2 rounded-cartao border border-borda bg-superficie-2 px-4 py-3 text-[13.5px] text-texto-2">
          <Lock className="size-4 shrink-0 text-texto-3" /> Seu perfil é de consulta — só editores e administradores alteram metas e parâmetros.
        </p>
      )}
      <div className="space-y-6">
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        {visao === "Metas dos indicadores" ? <SecaoMetas cad={cad} edita={edita} />
          : visao === "Equipe e capacidade" ? <SecaoCapacidade c={c} edita={edita} />
            : <SecaoTipos c={c} edita={edita} />}
      </div>
    </div>
  );
}

function SecaoMetas({ cad, edita }: { cad: Record<string, Record<string, unknown>>; edita: boolean }) {
  const linhas: LinhaMeta[] = ind.KPIS.map((k) => ({ id: k.id, grupo: k.grupo, nome: k.nome, unidade: UNIDADE[k.unidade] ?? k.unidade,
    sentido: k.sentido > 0 ? "maior é melhor" : "menor é melhor", padrao: k.meta, meta: ind.meta(k, cad), formula: k.formula }));
  const pers = ind.KPIS.filter((k) => k.id in cad).length;
  const semMeta = linhas.filter((l) => l.meta == null).length;
  return (
    <Secao titulo="Metas" destaque="dos indicadores"
      sub={`Deixe a meta vazia para o indicador ficar sem meta (sem farol). Valores em % de 0 a 100; custos em R$. O farol fica amarelo até 10% pior que a meta. ${pers} meta(s) personalizada(s) · ${semMeta} indicador(es) sem meta.`}>
      <EditorMetas linhas={linhas} edita={edita} personalizadas={pers} />
    </Secao>
  );
}

async function SecaoCapacidade({ c, edita }: { c: Awaited<ReturnType<typeof contexto>>; edita: boolean }) {
  const horas = ind.horasSemanaDe(c.cad.metas);
  // sem filtros: a fábrica toda; média apontada sem a capacidade configurada
  const d = await dados(c, { areas: [], centros: [], tipos: [] });
  const semCfg: ind.Dados = { ...d, capacidade: {}, memo: new Map() };
  const centros = new Set<string>();
  for (const xs of [d.conf, d.oper, d.ordens]) for (const x of xs ?? []) if (x.centroTrabalho) centros.add(x.centroTrabalho);
  const tec = ind.tecnicos(d);
  const cfg = ind.capacidadeDe(c.cad.metas);
  const linhas: LinhaCapacidade[] = [...centros].sort().map((ctr) => {
    const n = tec.filter((p) => p.centroTrabalho === ctr).length;
    return { centro: ctr, tecnicos: n, sugestao: n ? n * horas : null, media: ind.capacidadeSemanal(semCfg, [ctr])[0], configurada: cfg[ctr] ?? null };
  }).sort((a, b) => (b.media ?? -1) - (a.media ?? -1) || a.centro.localeCompare(b.centro));
  return (
    <div className="space-y-10">
      <Secao titulo="Jornada semanal" destaque="por técnico" sub="Base da utilização da mão de obra e da capacidade sugerida (o Gerenciador de HH pode ter jornada própria por pessoa).">
        <EditorJornada horas={horas} edita={edita} />
      </Secao>
      <Secao titulo="Capacidade semanal" destaque="por centro de trabalho (HH/semana)"
        sub={`Usada no backlog em semanas. Vazio = o site usa a média de HH apontadas nas últimas 12 semanas.${d.equipe ? ` Equipe da Gestão de HH: ${n0.format(d.equipe.length)} pessoas, ${n0.format(tec.length)} técnicos de execução.` : ""}`}>
        <EditorCapacidade linhas={linhas} edita={edita} />
      </Secao>
    </div>
  );
}

function SecaoTipos({ c, edita }: { c: Awaited<ReturnType<typeof contexto>>; edita: boolean }) {
  const contagem = new Map<string, number>();
  for (const o of c.b.ordens.dados ?? []) if (o.tipo) contagem.set(o.tipo, (contagem.get(o.tipo) ?? 0) + 1);
  const codigos = [...new Set([...Object.keys(c.tipos), ...contagem.keys()])].filter(Boolean).sort();
  const linhas: LinhaTipo[] = codigos.map((cod) => {
    const t = c.tipos[cod];
    return { codigo: cod, descricao: t?.descricao ?? "", classe: t?.classe ?? "", ordens: contagem.get(cod) ?? 0,
      deduzida: ind.classeTipo(cod, { [cod]: { descricao: t?.descricao ?? "", classe: "" } }) };
  });
  return (
    <Secao titulo="Tipos" destaque="de ordem"
      sub="A classe WCM de cada tipo alimenta os indicadores de corretiva emergencial e os gráficos por classe. Sem classe definida, ela é deduzida do nome (ex.: “Corretiva Emergencial” → Emergencial). Os nomes padrão vêm da aba de apoio da planilha de Gestão de HH.">
      {linhas.length ? <EditorTipos linhas={linhas} classes={ind.CLASSES_TIPO} edita={edita} />
        : <p className="text-[14px] text-texto-3">Nenhum tipo de ordem encontrado.</p>}
    </Secao>
  );
}
