import type { Metadata } from "next";

import { AbasVisao, PaginaWcm } from "@/components/PaginaWcm";
import { Cabecalho } from "@/components/ui";
import { podeEditar, veInteira } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { barra, contexto } from "@/lib/wcm/contexto";

import type { Params } from "./_ui/url";
import { Analise } from "./Analise";
import { Cadastro } from "./Cadastro";
import { GestaoAtivos } from "./GestaoAtivos";
import { V_ANALISE, V_ATIVOS, V_CADASTRO, VISOES } from "./logica";

export const metadata: Metadata = { title: "Equipamentos" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Equipamentos · gestão de ativos (porta de paginas/equipamentos.py). Quem tem a aba inteira vê as três visões;
 * os demais (Manutentor) veem só a Gestão de ativos, sem editar. Cadastrar/editar/remover: editor ou administrador.
 */
export default async function Equipamentos(props: { searchParams: Promise<Params> }) {
  const u = await exigir("equipamentos");
  const params = { ...(await props.searchParams) };
  const c = await contexto(params);
  const completo = veInteira(u, "equipamentos");
  const cadastra = completo && podeEditar(u);
  const pedida = String(params.visao ?? "");
  // link de outras abas (/equipamentos?eq=<código>): abre a ficha; quem só vê a Gestão de ativos abre o resumo do ativo
  const eq = typeof params.eq === "string" ? params.eq : "";
  const visao = completo && VISOES.includes(pedida) ? pedida : completo && eq && !pedida ? V_ANALISE : V_ATIVOS;
  if (visao === V_ATIVOS && eq && !params.at) params.at = eq;
  // a Gestão de ativos e o cadastro são da fábrica inteira; só a análise segue os filtros globais (período inclusive)
  const filtros = visao === V_ANALISE;
  return (
    <PaginaWcm barra={barra(c)} periodo={filtros} dimensoes={filtros}>
      <Cabecalho titulo="Equipamentos," destaque="a gestão de ativos da planta."
        sobre="Confiabilidade"
        subtitulo="Inventário, criticidade, custo, cobertura preventiva e ciclo de vida dos ativos — e o cadastro com os componentes vinculados à base de material." />
      {completo && <AbasVisao visoes={VISOES} atual={visao} params={Object.fromEntries(Object.entries(params).filter(([k]) => ["ini", "fim", "atalho", "area", "setor", "centro", "tipo"].includes(k)))} />}
      {visao === V_ATIVOS && <GestaoAtivos c={c} params={params} completo={completo} cadastra={cadastra} />}
      {visao === V_CADASTRO && <Cadastro c={c} params={params} cadastra={cadastra} />}
      {visao === V_ANALISE && <Analise c={c} params={params} cadastra={cadastra} />}
    </PaginaWcm>
  );
}
