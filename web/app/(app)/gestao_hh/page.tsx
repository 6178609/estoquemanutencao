import type { Metadata } from "next";

import { AbasVisao, PaginaWcm, Secao } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { podeEditar } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { barra, contexto } from "@/lib/wcm/contexto";
import { descrever } from "@/lib/wcm/filtros";
import * as hh from "@/lib/wcm/hh";
import * as ind from "@/lib/wcm/indicadores";

import { param } from "../execucao/_ui/memo";
import { EquipeCadastro, MigrarEquipe, type MembroLinha } from "./EquipeCadastro";
import { GestaoHh, type PessoaLinha } from "./GestaoHh";

export const metadata: Metadata = { title: "Gerenciador de HH" };
export const dynamic = "force-dynamic";

const VISOES = ["Pessoas", "Equipe (cadastro)", "Ausências", "Calendário"];

export default async function GerenciadorHh(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const u = await exigir("gestao_hh");
  const params = await props.searchParams;
  const c = await contexto(params);
  const cab = <Cabecalho titulo="Gerenciador de HH," destaque="a disponibilidade da equipe."
    sobre="Gestão de HH"
    subtitulo="A equipe da manutenção (cadastro manual: quem é, cargo, centro, turma), a jornada, o % disponível e as ausências (férias, afastamento, treinamento…) de cada um — alimenta a utilização da mão de obra, a capacidade do backlog e a programação semanal." />;
  const cad = c.cad.hh;
  const doCadastro = hh.temEquipeCadastrada(cad);
  const equipe = c.b.equipe.dados ?? [];
  // a equipe inteira para a visão de cadastro (com desligados e quem está fora da visão de manutenção)
  const membros: MembroLinha[] = doCadastro
    ? hh.equipeDoCadastro(cad, { comDesligados: true }).map((p) => ({ np: p.np, nome: p.nome, cargo: p.cargo, especialidade: p.especialidade,
      centro: p.centroTrabalho, area: p.area, turma: p.turma, supervisor: p.supervisor, ativo: p.ativo }))
    : equipe.map((p) => ({ np: p.np, nome: p.nome, cargo: p.cargo, especialidade: p.especialidade, centro: p.centroTrabalho, area: p.area,
      turma: p.turma, supervisor: p.supervisor, ativo: true }));

  const { ini, fim } = c.f;
  const horasSemana = ind.horasSemanaDe(c.cad.metas);
  const pes = hh.pessoas(equipe, cad, horasSemana);
  const disp = hh.disponibilidade(pes, cad, ini, fim);
  const visao = VISOES.includes(param(params, "visao")) ? param(params, "visao") : equipe.length ? VISOES[0] : VISOES[1];
  const linhas: PessoaLinha[] = disp.map((p) => ({
    np: p.np, nome: p.nome, cargo: p.cargo, especialidade: p.especialidade, centro: p.centroTrabalho, area: p.area, turma: p.turma,
    jornada: p.jornada, disponivel: p.disponivel, conta: p.contaNaCapacidade, obs: p.observacao, diasAusente: p.diasAusente,
    horasBrutas: p.horasBrutas, horasAusente: p.horasAusente, horasDisp: p.horasDisponiveis,
  }));
  return (
    <PaginaWcm barra={barra(c)} dimensoes={false}>
      {cab}
      {!doCadastro && equipe.length > 0 && <div className="mb-8"><MigrarEquipe nPlanilha={equipe.length} edita={podeEditar(u)} /></div>}
      <Secao titulo="Disponibilidade" destaque={descrever(ini, fim)}
        sub="O período vem da barra do topo (os filtros de área, setor, centro e tipo de ordem não valem aqui: use os da equipe abaixo).">
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        {visao === "Equipe (cadastro)" ? <EquipeCadastro membros={membros} edita={podeEditar(u)} doCadastro={doCadastro} /> : <GestaoHh visao={visao} pessoas={linhas} ausencias={hh.ausencias(cad).map((a) => ({ ...a }))} hoje={c.b.hoje} ini={ini} fim={fim}
          edita={podeEditar(u)} horasSemana={horasSemana} tipos={hh.TIPOS_AUSENCIA} />}
      </Secao>
    </PaginaWcm>
  );
}
