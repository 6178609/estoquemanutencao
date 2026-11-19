import { Lock } from "lucide-react";
import type { Metadata } from "next";

import { AbasVisao } from "@/components/PaginaWcm";
import { Cabecalho, Pagina } from "@/components/ui";
import { lerAgendaHh, listaEquipamentos } from "@/lib/agendaHh/dados";
import { hojeIso } from "@/lib/agendaHh/regras";
import { podeEditar } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";

import { param } from "../execucao/_ui/memo";
import { Backup } from "./Backup";
import { CalendarioEditavel } from "./CalendarioEditavel";
import { Cobertura } from "./Cobertura";
import { Comparativo } from "./Comparativo";
import { Horas } from "./Horas";
import { Programacao } from "./Programacao";

export const metadata: Metadata = { title: "Controle de HH" };
export const dynamic = "force-dynamic";

const VISOES = ["Horas disponíveis", "Programação", "Comparativo", "Cobertura", "Calendário"];

/**
 * Controle de HH (recriação do app "Controle de HH | PCM"): horas disponíveis dos técnicos, programação de serviços,
 * comparativo disponível × programado, folha de cobertura e calendário. Dados em agenda_hh.json (lib/agendaHh/);
 * considera as ausências da Gestão de HH e busca as ordens na IW38. Quem vê a aba vê tudo; edita quem tem perfil de
 * edição (fora da demonstração).
 */
export default async function ControleHh(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const u = await exigir("agenda_hh");
  const params = await props.searchParams;
  const visao = VISOES.includes(param(params, "visao")) ? param(params, "visao") : VISOES[0];
  const edita = podeEditar(u) && !u.demo;
  const precisaEquip = edita && (visao === "Programação" || visao === "Calendário");
  const [{ tecnicos, programacoes }, equipamentos] = await Promise.all([lerAgendaHh(), precisaEquip ? listaEquipamentos() : Promise.resolve([])]);
  const hoje = hojeIso();

  return (
    <Pagina>
      <Cabecalho titulo="Controle de HH," destaque="disponível × programado." sobre="Planejamento"
        subtitulo="Horas disponíveis de cada técnico (dias úteis × jornada − férias, folgas e ausências da Gestão de HH), a programação das ordens, o comparativo com saldo e ocupação, a folha de cobertura para divulgar e o calendário da manutenção."
        acoes={<Backup tecnicos={tecnicos} programacoes={programacoes} hoje={hoje} edita={edita} />} />
      <div className="space-y-6">
        <AbasVisao visoes={VISOES} atual={visao} params={params} />
        {!edita && (
          <p className="inline-flex items-center gap-1.5 text-[12.5px] text-texto-3">
            <Lock className="size-3.5" aria-hidden />{u.demo ? "Demonstração: os dados são fictícios e não podem ser alterados." : "Seu perfil é de consulta — só editores e administradores alteram o Controle de HH."}
          </p>
        )}
        {visao === "Horas disponíveis" && <Horas tecnicos={tecnicos} hoje={hoje} edita={edita} />}
        {visao === "Programação" && <Programacao tecnicos={tecnicos} programacoes={programacoes} hoje={hoje} edita={edita} equipamentos={equipamentos} />}
        {visao === "Comparativo" && <Comparativo tecnicos={tecnicos} programacoes={programacoes} hoje={hoje} />}
        {visao === "Cobertura" && <Cobertura tecnicos={tecnicos} programacoes={programacoes} hoje={hoje} />}
        {visao === "Calendário" && <CalendarioEditavel tecnicos={tecnicos} programacoes={programacoes} hoje={hoje} edita={edita} equipamentos={equipamentos} />}
      </div>
    </Pagina>
  );
}
