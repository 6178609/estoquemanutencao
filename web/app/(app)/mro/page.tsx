import { Boxes, Factory, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, PaginaWcm } from "@/components/PaginaWcm";
import { Cabecalho, Selo } from "@/components/ui";
import { podeEditar, soEstoque, veInteira } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { brl } from "@/lib/formato";
import { barra, contexto } from "@/lib/wcm/contexto";

import { AbasParam, Cartao, GradeNumeros, inteiroBr, Numero, Paginacao, TabelaT } from "../equipamentos/_ui/Blocos";
import { FiltrosUrl } from "../equipamentos/_ui/FiltrosUrl";
import { hrefCom, type Params } from "../equipamentos/_ui/url";
import { infoCad, inventarioAtivos, materiaisDe } from "../equipamentos/dados";
import { paginar, param, SEM_CLASSE, V_CADASTRO } from "../equipamentos/logica";
import { SeloPeca } from "../equipamentos/SeloPeca";
import { baseMateriais, camposDosAtivos } from "./dados";
import * as M from "./logica";
import { PecasAtivo } from "./PecasAtivo";

export const metadata: Metadata = { title: "Gestão de MRO" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SELO_MRO: Record<string, "vermelho" | "cinza" | "verde"> = { [M.COM_FALTA]: "vermelho", [M.SEM_PECAS]: "cinza", [M.EM_DIA]: "verde" };
const SELO_CRIT: Record<string, "vermelho" | "laranja" | "verde"> = { Alta: "vermelho", "Média": "laranja", Baixa: "verde" };
const ABAS = [
  { id: M.V_ATIVOS, rotulo: "Por ativo", icone: <Factory className="size-4" strokeWidth={1.75} /> },
  { id: M.V_MATERIAIS, rotulo: "Por material (onde é usado)", icone: <Boxes className="size-4" strokeWidth={1.75} /> },
];
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
const crit = (c: string) => (c ? <Selo cor={SELO_CRIT[c] ?? "cinza"}>{c}</Selo> : <span className="text-texto-3">sem classe</span>);

/**
 * Gestão de MRO: as peças de reposição (materiais do MB52) de cada ativo da lista de equipamentos e, ao contrário,
 * onde cada material é usado. O vínculo é o mesmo do cadastro de equipamentos (aba Equipamentos), então as duas abas,
 * o Almoxarifado e as peças críticas do Painel enxergam a mesma coisa.
 */
export default async function Mro(props: { searchParams: Promise<Params> }) {
  const u = await exigir("mro");
  const params = await props.searchParams;
  const c = await contexto(params);
  // terceiros consultam; vincular é de editor/administrador da equipe
  const edita = veInteira(u, "mro") && podeEditar(u) && !soEstoque(u);
  const [inv, bm, campos] = await Promise.all([inventarioAtivos(c), baseMateriais(), camposDosAtivos(c)]);
  const t = M.linhasPorAtivo(inv, (k) => materiaisDe(infoCad(c, k)), (m) => M.pecaMro(m, bm, c.cad.materiais),
    (k) => campos.get(k) ?? "");
  const r = M.resumo(t);
  const visao = param(params, "visao") === M.V_MATERIAIS ? M.V_MATERIAIS : M.V_ATIVOS;

  return (
    <PaginaWcm barra={barra(c)} periodo={false} dimensoes={false}>
      <Cabecalho titulo="Gestão de MRO," destaque="as peças de reposição de cada ativo."
        sobre="Custos e suprimentos"
        subtitulo="Cada equipamento da lista (IH08, cadastro do site e IW38) com os materiais de manutenção vinculados a ele, completados pela MB52 (saldo, valor, depósitos) e pelo catálogo Sysmat (descrição completa, fabricante/referência) — e, ao contrário, onde cada material é usado." />
      {!t.length ? (
        <Aviso>Nenhum equipamento na lista. Envie o export do <b>IH08</b> ou do <b>IW38</b> em <Link href="/dados" className="font-medium underline">Fontes de dados</Link>.</Aviso>
      ) : (
        <div className="space-y-6">
          {(!bm.est || !bm.cat) && (
            <Aviso tom="azul">{!bm.est ? <>Sem o export do <b>MB52</b> o saldo das peças fica em branco. </> : null}
              {!bm.cat ? <>Sem o <b>catálogo Sysmat</b> faltam o código Sysmat, a descrição completa e o fabricante/referência das peças. </> : null}
              Envie em <Link href="/dados" className="font-medium underline">Fontes de dados</Link>.</Aviso>
          )}
          <GradeNumeros colunas={5}>
            <Numero rotulo="Ativos com peças vinculadas" valor={pct(r.cobertura)} detalhe={`${inteiroBr(r.comPecas)} de ${inteiroBr(r.ativos)} ativos`}
              dica="Ativos não desativados com pelo menos uma peça de reposição vinculada." />
            <Numero rotulo="Cobertura dos ativos Alta" valor={pct(r.coberturaAlta)} detalhe={`${inteiroBr(r.altaComPecas)} de ${inteiroBr(r.alta)} ativos Alta`}
              tom={r.coberturaAlta == null ? undefined : r.coberturaAlta >= 100 ? "bom" : r.coberturaAlta >= 80 ? "atencao" : "critico"}
              dica="Ativos de criticidade Alta (cadastro do site ou ABC = A no IH08) com peças vinculadas. Meta: 100%." />
            <Numero rotulo="Materiais vinculados" valor={inteiroBr(r.materiais)} detalhe="códigos distintos" />
            <Numero rotulo="Peças em falta" valor={inteiroBr(r.materiaisEmFalta)} detalhe={`em ${inteiroBr(r.ativosComFalta)} ativo(s)`}
              tom={r.materiaisEmFalta ? "atencao" : undefined} dica="Materiais vinculados zerados, abaixo do mínimo ou fora da base de material atual." />
            <Numero rotulo="Peças críticas em falta" valor={inteiroBr(r.criticosEmFalta)} detalhe="usadas em ativos Alta"
              tom={r.criticosEmFalta ? "critico" : bm.est ? "bom" : undefined} dica="Peças em falta que pertencem a pelo menos um ativo de criticidade Alta." />
          </GradeNumeros>
          {!edita && <Aviso tom="azul">Só editor ou administrador da equipe de manutenção vincula e desvincula peças. Aqui você consulta.</Aviso>}
          <div id="abas" className="scroll-mt-24 space-y-4">
            <AbasParam params={params} param="visao" abas={ABAS} atual={visao} ancora="abas" />
            {visao === M.V_ATIVOS ? <PorAtivo t={t} params={params} edita={edita} /> : <PorMaterial t={t} params={params} />}
          </div>
        </div>
      )}
    </PaginaWcm>
  );
}

/** Equipamento pelo campo de ordenação do IW38, com o código do equipamento embaixo (sem campo: só o código). */
function Equip({ a }: { a: { codigo: string; campo: string } }) {
  if (!a.campo || a.campo === a.codigo) return <>{a.codigo}</>;
  return (
    <span className="inline-flex flex-col leading-tight">
      <span>{a.campo}</span>
      <span className="text-[11px] font-normal text-texto-3">{a.codigo}</span>
    </span>
  );
}

const COLS_ATIVOS = [
  { rotulo: "Equipamento", dica: "Campo de ordenação do IW38 (o código do equipamento embaixo)" }, { rotulo: "Nome", larga: true }, { rotulo: "Criticidade" }, { rotulo: "Área" }, { rotulo: "Local de instalação" },
  { rotulo: "Peças", dir: true, dica: "Materiais vinculados ao ativo" }, { rotulo: "Em falta", dir: true, dica: "Zeradas, abaixo do mínimo ou fora da base de material" },
  { rotulo: "Situação MRO" },
];

function PorAtivo({ t, params, edita }: { t: M.AtivoMro[]; params: Params; edita: boolean }) {
  const f = M.lerFiltroAtivos(params);
  const vis = M.filtrarAtivos(t, f);
  const pg = paginar(vis, Number(param(params, "pag")) || 1);
  const sel = param(params, "at");
  const a = sel ? t.find((x) => x.codigo === sel) : undefined;
  const vivos = t.filter((x) => f.desativados || !x.desativado);
  const conta = (fn: (x: M.AtivoMro) => boolean) => vivos.filter(fn).length;
  const areas = [...new Set(vivos.map((x) => x.area).filter(Boolean))].sort();
  return (
    <div className="space-y-3">
      <FiltrosUrl zerar={["at"]} campos={[
        { tipo: "busca", param: "q", placeholder: "Buscar campo de ordenação, equipamento, nome, local ou material…" },
        { tipo: "multi", param: "crit", rotulo: "Criticidade", opcoes: M.CRITS.map((cr) => ({ valor: cr, n: conta((x) => (x.criticidade || SEM_CLASSE) === cr) })) },
        { tipo: "multi", param: "area", rotulo: "Área", opcoes: areas.map((ar) => ({ valor: ar, n: conta((x) => x.area === ar) })) },
        { tipo: "pilulas", param: "smro", rotulo: "Situação MRO", opcoes: M.SITUACOES_MRO },
        { tipo: "alternar", param: "desat", rotulo: "Incluir desativados" },
      ]} />
      <p className="text-[12.5px] text-texto-3">{inteiroBr(vis.length)} ativo(s) · clique no código do equipamento para ver{edita ? " e vincular" : ""} as peças.</p>
      {a && (
        <Cartao className="border-borda-forte" titulo={`${a.campo && a.campo !== a.codigo ? `${a.campo} · ${a.codigo}` : a.codigo} · ${a.nome || "—"}`}
          sub={<span className="inline-flex flex-wrap items-center gap-1.5">{a.situacao} · {crit(a.criticidade)} · {[a.area, a.local].filter(Boolean).join(" · ") || "sem local"}
            · <Selo cor={SELO_MRO[a.mro]}>{a.mro}</Selo></span>}
          acoes={<div className="flex flex-wrap gap-2">
            <Link href={`/equipamentos?${new URLSearchParams({ visao: V_CADASTRO, form: a.codigo })}#form`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borda px-3 text-[13px] transition hover:bg-superficie-2">
              <Pencil className="size-3.5" /> Cadastro do equipamento</Link>
            <Link scroll={false} href={hrefCom(params, { at: null })} className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] text-texto-3 hover:text-texto">Fechar</Link>
          </div>}>
          <PecasAtivo key={a.codigo} tag={a.codigo} pecas={a.pecas} edita={edita} />
        </Cartao>
      )}
      <TabelaT colunas={COLS_ATIVOS} vazio="Nenhum ativo com estes filtros."
        linhas={pg.itens.map((x) => ({
          chave: x.codigo, ativa: x.codigo === sel, href: hrefCom(params, { at: x.codigo === sel ? null : x.codigo }, "abas"),
          celulas: [<Equip key="e" a={x} />, x.nome || "—", crit(x.criticidade), x.area || "—", x.local || "—", x.pecas.length, x.emFalta || "—",
            <Selo key="m" cor={SELO_MRO[x.mro]}>{x.mro}</Selo>],
        }))} />
      <Paginacao params={params} {...pg} mostrados={pg.itens.length} rotulo="ativo(s)" baixar={`/api/mro${hrefCom(params, { planilha: "ativos", pag: null, at: null })}`} />
    </div>
  );
}

const COLS_MAT = [
  { rotulo: "Material" }, { rotulo: "Descrição", larga: true }, { rotulo: "Situação no estoque" }, { rotulo: "Sysmat" },
  { rotulo: "Fabricante / referência", larga: true }, { rotulo: "Valor (R$)", dir: true, dica: "Valor do saldo em estoque (MB52)" },
  { rotulo: "Ativos", dir: true, dica: "Quantos ativos usam a peça" }, { rotulo: "Ativos Alta", dir: true }, { rotulo: "Onde é usado", larga: true },
];

function PorMaterial({ t, params }: { t: M.AtivoMro[]; params: Params }) {
  const todos = M.linhasPorMaterial(t);
  const f = M.lerFiltroMateriais(params);
  const vis = M.filtrarMateriais(todos, f);
  const pg = paginar(vis, Number(param(params, "pag")) || 1);
  const irAtivo = (codigo: string) => `?${new URLSearchParams({ visao: M.V_ATIVOS, q: codigo, at: codigo })}#abas`;
  const dica = (a: M.UsoAtivo) => [a.campo && a.campo !== a.codigo ? `Equipamento ${a.codigo}` : "", a.nome].filter(Boolean).join(" · ");
  return (
    <div className="space-y-3">
      <FiltrosUrl campos={[
        { tipo: "busca", param: "mq", placeholder: "Buscar material, descrição, Sysmat, fabricante ou equipamento…" },
        { tipo: "alternar", param: "mfalta", rotulo: "Só peças em falta" },
        { tipo: "alternar", param: "malta", rotulo: "Só usadas em ativos Alta" },
      ]} />
      <p className="text-[12.5px] text-texto-3">{inteiroBr(vis.length)} de {inteiroBr(todos.length)} material(is) vinculado(s) a ativos · clique num equipamento para abrir as peças dele.</p>
      <TabelaT colunas={COLS_MAT} vazio={todos.length ? "Nenhum material com estes filtros." : "Nenhuma peça vinculada ainda — comece pela visão Por ativo."}
        linhas={pg.itens.map((x) => ({
          chave: x.codigo,
          celulas: [<span key="c" className="font-mono text-[12.5px] text-alp-azul">{x.codigo}</span>, x.descricao || "—", <SeloPeca key="s" p={x} />,
            x.sysmat ? <span key="y" title={x.cadastro} className="font-mono text-[12.5px]">{x.sysmat}</span> : <span key="y" className="text-texto-3">{x.cadastro || "—"}</span>,
            x.fabricanteRef || "—", x.valor != null ? brl(x.valor) : "—",
            x.ativos.length, x.nAlta || "—",
            <span key="u" className="flex flex-wrap gap-1">
              {x.ativos.slice(0, 12).map((a) => (
                <Link key={a.codigo} href={irAtivo(a.codigo)} title={dica(a)} className="rounded-md bg-superficie-2 px-1.5 py-0.5 font-mono text-[11.5px] text-texto-2 hover:underline"
                  style={a.criticidade === "Alta" ? { boxShadow: "inset 0 0 0 1px var(--st-critico)" } : undefined}>{M.rotuloAtivo(a)}</Link>
              ))}
              {x.ativos.length > 12 && <span className="text-[11.5px] text-texto-3">+{x.ativos.length - 12}</span>}
            </span>],
        }))} />
      <Paginacao params={params} {...pg} mostrados={pg.itens.length} rotulo="material(is)" baixar={`/api/mro${hrefCom(params, { planilha: "materiais", pag: null })}`} />
    </div>
  );
}
