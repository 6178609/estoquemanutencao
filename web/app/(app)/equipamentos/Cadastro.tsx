import { AlertTriangle, ChevronDown, ClipboardList, Hourglass, Link2, Pencil, Plus, Wrench } from "lucide-react";
import Link from "next/link";

import { Aviso } from "@/components/PaginaWcm";
import { BOTAO_PRIMARIO, Selo } from "@/components/ui";
import { brl } from "@/lib/formato";
import * as ativos from "@/lib/wcm/ativos";
import type { Contexto } from "@/lib/wcm/contexto";
import { PENDENTES } from "@/lib/wcm/preparo";
import { dataBr, paraData, partes } from "@/lib/wcm/util";

import { GradeNumeros, inteiroBr, Numero, Paginacao } from "./_ui/Blocos";
import { FiltrosUrl } from "./_ui/FiltrosUrl";
import { hrefCom, type Params } from "./_ui/url";
import { infoCad, mapaEstoque, materiaisDe, type MapaEstoque } from "./dados";
import { FormEquipamento } from "./FormEquipamento";
import { CRITICIDADES, filtrarCadastro, formInicial, lerFiltroCadastro, paginar, param, pecasEmAlerta, situacaoPeca, V_ANALISE } from "./logica";
import { RemoverEquip } from "./RemoverEquip";
import { SeloPeca } from "./SeloPeca";

/** Visão "Cadastro de equipamentos": formulário (novo/editar) e a lista do cadastro do site com os componentes. */

const SELO_CRIT: Record<string, "vermelho" | "laranja" | "verde"> = { Alta: "vermelho", "Média": "laranja", Baixa: "verde" };
const num = (v: unknown) => { const x = Number(v); return v != null && v !== "" && Number.isFinite(x) && x > 0 ? x : null; };

export async function Cadastro({ c, params, cadastra }: { c: Contexto; params: Params; cadastra: boolean }) {
  const est = await mapaEstoque();
  const cad = c.cad.equipamentos;
  const n = Object.keys(cad).length;
  const form = param(params, "form");
  const voltar = hrefCom(params, { form: null });

  let formulario: React.ReactNode = null;
  if (form && cadastra) {
    const tag = form === "novo" ? "" : form.toUpperCase().slice(0, 60);
    const eq = c.b.equipamentos.dados?.find((x) => x.equipamento === tag);
    const nomeO = tag ? c.b.ordens.dados?.find((o) => o.equipChave === tag)?.objeto ?? "" : "";
    const sap = eq || nomeO ? { nome: eq?.denominacao || nomeO, abc: eq?.codigoAbc ?? "", desativado: !!eq?.desativado } : null;
    const info = tag && tag in cad ? infoCad(c, tag) : null;
    const ini = formInicial(tag, info, sap);
    formulario = <FormEquipamento key={form} inicial={ini} editando={info ? tag : null} anoMax={partes(c.b.hoje).ano} voltar={voltar}
      vinculados={ini.materiais.map((m) => situacaoPeca(m, est, c.cad.materiais))} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-2xl text-[13.5px] text-texto-3">Equipamentos da planta com categoria, criticidade, situação, ciclo de vida e os componentes de reposição vinculados à base de material (MB52).
          A criticidade cadastrada aqui vale para a Saúde dos ativos, a Gestão de ativos e as peças críticas do Painel.</p>
        {cadastra && !form && <Link href={hrefCom(params, { form: "novo" }, "form")} scroll={false} className={BOTAO_PRIMARIO}><Plus className="size-4" /> Novo equipamento</Link>}
      </div>
      {!cadastra && <Aviso tom="azul">Só editor ou administrador cadastra e edita equipamentos. Aqui você consulta o cadastro.</Aviso>}

      {n > 0 && (
        <GradeNumeros>
          {CRITICIDADES.map((cr) => (
            <Numero key={cr} rotulo={`Criticidade ${cr}`} valor={inteiroBr(Object.values(cad).filter((v) => v?.criticidade === cr).length)}
              dica={cr === "Alta" ? "As peças dos equipamentos de criticidade Alta entram em “Peças críticas em falta” no Painel." : undefined} />
          ))}
          <Numero rotulo="Total cadastrado" valor={inteiroBr(n)} detalhe={`${inteiroBr(Object.values(cad).filter((v) => materiaisDe(v ?? {}).length).length)} com componentes vinculados`} />
        </GradeNumeros>
      )}

      {formulario}

      {!n && !formulario ? (
        <div className="rounded-cartao border border-dashed border-borda bg-superficie px-6 py-10 text-center">
          <Wrench className="mx-auto size-6 text-texto-3" strokeWidth={1.75} />
          <div className="mt-3 font-display text-[17px] font-medium">Nenhum equipamento cadastrado</div>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-texto-3">Cadastre os equipamentos da planta com categoria, criticidade e vincule os componentes de reposição da base de material.</p>
        </div>
      ) : n > 0 && <Lista c={c} params={params} est={est} cadastra={cadastra} />}
    </div>
  );
}

function Lista({ c, params, est, cadastra }: { c: Contexto; params: Params; est: MapaEstoque | null; cadastra: boolean }) {
  const itens = filtrarCadastro(c.cad.equipamentos, lerFiltroCadastro(params), (m) => est?.get(m)?.descricao ?? "");
  const pg = paginar(itens, Number(param(params, "pag")) || 1);
  // resumo das ordens do IW38 e o código ABC do SAP
  const resumo = new Map<string, { ordens: number; pendentes: number }>();
  const tags = new Set(pg.itens.map(([k]) => k));
  for (const o of c.b.ordens.dados ?? []) {
    if (!tags.has(o.equipChave)) continue;
    const r = resumo.get(o.equipChave) ?? { ordens: 0, pendentes: 0 };
    r.ordens++;
    if (PENDENTES.has(o.situacao)) r.pendentes++;
    resumo.set(o.equipChave, r);
  }
  const abc = new Map((c.b.equipamentos.dados ?? []).filter((e) => tags.has(e.equipamento)).map((e) => [e.equipamento, e.codigoAbc]));
  return (
    <div className="space-y-3">
      <FiltrosUrl campos={[
        { tipo: "busca", param: "cq", placeholder: "Buscar TAG, nome ou componente…" },
        { tipo: "pilulas", param: "ccrit", rotulo: "Criticidade", opcoes: CRITICIDADES },
      ]} />
      <div className="space-y-2">
        {!pg.itens.length && <p className="px-1 text-[13px] text-texto-3">Nenhum equipamento com esse filtro.</p>}
        {pg.itens.map(([tag, v]) => {
          const comps = materiaisDe(v);
          const pecas = comps.map((m) => situacaoPeca(m, est, c.cad.materiais));
          const alerta = pecasEmAlerta(pecas);
          const crit = String(v.criticidade ?? "");
          const sit = String(v.situacao ?? "");
          const gar = v.garantia_ate ? paraData(v.garantia_ate) : null;
          const ciclo = [[v.fabricante, v.modelo].filter(Boolean).join(" "), v.serie ? `série ${v.serie}` : "",
            num(v.ano_instalacao) ? `instalado em ${Math.trunc(num(v.ano_instalacao)!)}` : "", num(v.vida_util) ? `vida útil ${Math.trunc(num(v.vida_util)!)} anos` : "",
            gar != null ? `garantia até ${dataBr(gar)}` : "", num(v.valor_reposicao) ? `reposição ${brl(num(v.valor_reposicao))}` : ""].filter(Boolean);
          const r = resumo.get(tag);
          return (
            <details key={tag} className="group rounded-cartao border border-borda bg-superficie open:border-borda-forte">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 py-3.5 hover:bg-superficie-2 [&::-webkit-details-marker]:hidden">
                <span className="font-mono text-[13px] font-semibold text-alp-azul">{tag}</span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{String(v.nome ?? "")}</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Selo cor="azul">{String(v.categoria || "—")}</Selo>
                  <Selo cor={SELO_CRIT[crit] ?? "cinza"}>{crit || "sem criticidade"}</Selo>
                  {sit && sit !== ativos.OPERACAO && <Selo cor="ciano">{sit}</Selo>}
                  <span className="inline-flex items-center gap-1 text-[12px] text-texto-3" title="Componentes vinculados"><Link2 className="size-3.5" />{comps.length}</span>
                  {alerta > 0 && <span title={`${alerta} peça(s) sem estoque ou abaixo do mínimo`} className="inline-flex items-center gap-1 text-[12px] font-medium text-texto-2"><AlertTriangle className="size-3.5" style={{ color: "var(--st-critico)" }} />{alerta}</span>}
                  <ChevronDown className="size-4 text-texto-3 transition group-open:rotate-180" />
                </span>
              </summary>
              <div className="space-y-3 border-t border-borda px-4 py-4 text-[13px]">
                {!!v.observacoes && <blockquote className="border-l-2 border-borda-forte pl-3 text-texto-2">{String(v.observacoes)}</blockquote>}
                {ciclo.length > 0 && <p className="flex items-start gap-1.5 text-texto-3"><Hourglass className="mt-0.5 size-3.5 shrink-0" />{ciclo.join(" · ")}</p>}
                {(r || abc.get(tag)) && (
                  <p className="flex items-start gap-1.5 text-texto-3"><ClipboardList className="mt-0.5 size-3.5 shrink-0" />
                    {r ? `${inteiroBr(r.ordens)} ordens no IW38 · ${inteiroBr(r.pendentes)} pendentes` : "sem ordens no IW38"}{abc.get(tag) ? ` · ABC ${abc.get(tag)} no SAP` : ""}</p>
                )}
                <div>
                  <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-texto-3">Componentes vinculados</div>
                  {!pecas.length ? <p className="text-texto-3">Nenhum componente vinculado.</p> : (
                    <ul className="divide-y divide-borda rounded-xl border border-borda">
                      {pecas.map((p) => (
                        <li key={p.codigo} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2">
                          <span className="font-mono text-[12.5px] text-alp-azul">{p.codigo}</span>
                          <span className="min-w-0 flex-1 text-texto-2">{p.descricao || "—"}</span>
                          <SeloPeca p={p} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <span className="text-[12px] text-texto-3">{v.atualizado_em ? `Última edição: ${String(v.atualizado_por || "sem nome")} em ${String(v.atualizado_em).slice(0, 16).replace("T", " ")} (UTC)` : ""}</span>
                  <span className="flex flex-wrap gap-2">
                    {c.b.ordens.dados && <Link href={`?${new URLSearchParams({ visao: V_ANALISE, eq: tag })}#ficha`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borda px-3 text-[13px] transition hover:bg-superficie-2"><ClipboardList className="size-3.5" /> Ficha</Link>}
                    {cadastra && <Link href={hrefCom(params, { form: tag }, "form")} scroll={false} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borda px-3 text-[13px] transition hover:bg-superficie-2"><Pencil className="size-3.5" /> Editar</Link>}
                    {cadastra && <RemoverEquip tag={tag} />}
                  </span>
                </div>
              </div>
            </details>
          );
        })}
      </div>
      <Paginacao params={params} {...pg} mostrados={pg.itens.length} rotulo="equipamento(s)" />
    </div>
  );
}
