import type { Metadata } from "next";

import { AbasVisao, PaginaWcm, Secao, SemDados } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { podeEditar } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { barra, contexto } from "@/lib/wcm/contexto";
import { descrever } from "@/lib/wcm/filtros";
import * as hh from "@/lib/wcm/hh";
import * as ind from "@/lib/wcm/indicadores";

import { param } from "../execucao/_ui/memo";
import { GestaoHh, type PessoaLinha } from "./GestaoHh";

export const metadata: Metadata = { title: "Gerenciador de HH" };
export const dynamic = "force-dynamic";

const VISOES = ["Pessoas", "Ausências", "Calendário"];

export default async function GerenciadorHh(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const u = await exigir("gestao_hh");
  const params = await props.searchParams;
  const c = await contexto(params);
  const cab = <Cabecalho titulo="Gerenciador de HH," destaque="a disponibilidade da equipe."
    sobre="Gestão de HH"
    subtitulo="Jornada, % disponível para manutenção e ausências (férias, afastamento, treinamento…) de cada manutentor — alimenta a utilização da mão de obra, a capacidade do backlog e a programação semanal." />;
  const equipe = c.b.equipe.dados;
  if (!equipe) return <PaginaWcm barra={barra(c)} dimensoes={false}>{cab}<SemDados base="Gestão de HH (equipe)" /></PaginaWcm>;

  const { ini, fim } = c.f;
  const horasSemana = ind.horasSemanaDe(c.cad.metas);
  const cad = c.cad.hh;
  const pes = hh.pessoas(equipe, cad, horasSemana);
  const disp = hh.disponibilidade(pes, cad, ini, fim);
  const visao = VISOES.includes(param(params, "visao")) ? param(params, "visao") : VISOES[0];
  const linhas: PessoaLinha[] = disp.map((p) => ({
    np: p.np, nome: p.nome, cargo: p.cargo, especialidade: p.especialidade, centro: p.centroTrabalho, area: p.area, turma: p.turma,
    jornada: p.jornada, disponivel: p.disponivel, conta: p.contaNaCapacidade, obs: p.observacao, diasAusente: p.diasAusente,
    horasBrutas: p.horasBrutas, horasAusente: p.horasAusente, horasDisp: p.horasDisponiveis,
  }));
  return (
    <PaginaWcm barra={barra(c)} dimensoes={false}>
      {cab}
      <Secao titulo="Disponibilidade" destaque={descrever(ini, fim)}
        sub="O período vem da barra do topo (os filtros de área, setor, centro e tipo de ordem não valem aqui: use os da equipe abaixo).">
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        <GestaoHh visao={visao} pessoas={linhas} ausencias={hh.ausencias(cad).map((a) => ({ ...a }))} hoje={c.b.hoje} ini={ini} fim={fim}
          edita={podeEditar(u)} horasSemana={horasSemana} tipos={hh.TIPOS_AUSENCIA} />
      </Secao>
    </PaginaWcm>
  );
}
