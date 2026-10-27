import { Boxes, Factory, Pencil, Wand2 } from "lucide-react";
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
import { lerCadastro } from "@/lib/dados/cadastros";

import { AlocacaoAcoes, AlocarUm } from "./AlocacaoAcoes";
import { NIVEIS, ROTULO_NIVEL, type Nivel, type Sugestao } from "./alocacao";
import { baseMateriais, camposDosAtivos, distribuicaoDoAtivo, listasDosAtivos, sugestoesAlocacao, type DistribuicaoAtivo } from "./dados";
import { DistribuicaoIa06 } from "./DistribuicaoIa06";
import * as M from "./logica";
import { InclusaoIa06 } from "./InclusaoIa06";
import { identificarAtivo, type ListaTarefas } from "./ia06";
import { PecasAtivo } from "./PecasAtivo";
import type { GrupoPecas } from "../equipamentos/_ui/PecasPorSistema";
import { gruposDoAtivo } from "../equipamentos/gruposPecas";

export const metadata: Metadata = { title: "Gestão de MRO" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SELO_MRO: Record<string, "vermelho" | "cinza" | "verde"> = { [M.COM_FALTA]: "vermelho", [M.SEM_PECAS]: "cinza", [M.EM_DIA]: "verde" };
const SELO_CRIT: Record<string, "vermelho" | "laranja" | "verde"> = { Alta: "vermelho", "Média": "laranja", Baixa: "verde" };
const ABAS = [
  { id: M.V_ATIVOS, rotulo: "Por ativo", icone: <Factory className="size-4" strokeWidth={1.75} /> },
  { id: M.V_MATERIAIS, rotulo: "Por material (onde é usado)", icone: <Boxes className="size-4" strokeWidth={1.75} /> },
  { id: M.V_ALOCACAO, rotulo: "Alocação automática", icone: <Wand2 className="size-4" strokeWidth={1.75} /> },
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
  const pedida = param(params, "visao");
  const visao = pedida === M.V_MATERIAIS || pedida === M.V_ALOCACAO ? pedida : M.V_ATIVOS;

  return (
    <PaginaWcm barra={barra(c)} periodo={false} dimensoes={false}>
      <Cabecalho titulo="Gestão de MRO," destaque="as peças de reposição de cada ativo."
        sobre="Custos e suprimentos"
        subtitulo="Cada equipamento da lista (IH08, cadastro do site e IW38) com os materiais de manutenção vinculados a ele, completados pela MB52 (saldo, valor, depósitos) e pelo catálogo Sysmat (descrição completa, fabricante/referência) — e, ao contrário, onde cada material é usado." />
      {!t.length ? (
        <Aviso>Nenhum equipamento na lista. Envie o export do <b>IH08</b> ou do <b>IW38</b> em <Link prefetch={false} href="/dados" className="font-medium underline">Fontes de dados</Link>.</Aviso>
      ) : (
        <div className="space-y-6">
          {(!bm.est || !bm.cat) && (
            <Aviso tom="azul">{!bm.est ? <>Sem o export do <b>MB52</b> o saldo das peças fica em branco. </> : null}
              {!bm.cat ? <>Sem o <b>catálogo Sysmat</b> faltam o código Sysmat, a descrição completa e o fabricante/referência das peças. </> : null}
              Envie em <Link prefetch={false} href="/dados" className="font-medium underline">Fontes de dados</Link>.</Aviso>
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
            {visao === M.V_ATIVOS ? <PorAtivo t={t} params={params} edita={edita} listas={edita ? await listasDosAtivos(c) : null}
              grupos={param(params, "at") ? gruposDoAtivo(c, param(params, "at"), bm) : null}
              distribuicao={edita && param(params, "at") ? await distribuicaoDoAtivo(c, param(params, "at"), bm) : null} />
              : visao === M.V_MATERIAIS ? <PorMaterial t={t} params={params} />
              : <Alocacao t={t} params={params} edita={edita}
                  sugestoes={await sugestoesAlocacao(c, inv, bm, campos, (k) => new Set(materiaisDe(infoCad(c, k))))}
                  temDesfazer={!!(await lerCadastro("alocacao_automatica.json")).ultima} />}
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

function PorAtivo({ t, params, edita, listas, grupos, distribuicao }: { t: M.AtivoMro[]; params: Params; edita: boolean; listas: Map<string, ListaTarefas[]> | null;
  grupos: GrupoPecas[] | null; distribuicao: DistribuicaoAtivo | null }) {
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
            <Link prefetch={false} href={`/equipamentos?${new URLSearchParams({ visao: V_CADASTRO, form: a.codigo })}#form`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borda px-3 text-[13px] transition hover:bg-superficie-2">
              <Pencil className="size-3.5" /> Cadastro do equipamento</Link>
            <Link prefetch={false} scroll={false} href={hrefCom(params, { at: null })} className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] text-texto-3 hover:text-texto">Fechar</Link>
          </div>}>
          <PecasAtivo key={a.codigo} tag={a.codigo} pecas={a.pecas} grupos={grupos ?? []} edita={edita} />
          {edita && listas && (a.pecas.length > 0 || !!distribuicao?.atribuicoes.length) && (
            <details className="mt-4 rounded-xl border border-borda">
              <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[13.5px] font-medium hover:bg-superficie-2">Incluir no SAP (IA06) — peças já distribuídas por lista e operação</summary>
              <div className="space-y-4 border-t border-borda p-3">
                {distribuicao && <DistribuicaoIa06 key={`dist-${a.codigo}-${distribuicao.atribuicoes.length}`} rotulo={identificarAtivo(a)} atribuicoes={distribuicao.atribuicoes}
                  listas={distribuicao.listas} nomes={distribuicao.nomes} comTextoIa03={distribuicao.comTextoIa03} />}
                {a.pecas.length > 0 && (
                  <details className="rounded-xl border border-borda">
                    <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[13px] text-texto-2 hover:bg-superficie-2">Montar a carga à mão (uma operação para todas as peças)</summary>
                    <div className="border-t border-borda p-3">
                      <InclusaoIa06 key={`ia06-${a.codigo}-${a.pecas.length}`} equipamento={a.codigo} rotulo={identificarAtivo(a)} listas={listas.get(a.codigo) ?? []}
                        pecas={a.pecas.map((p) => ({ codigo: p.codigo, descricao: p.descricao, um: p.um }))} />
                    </div>
                  </details>
                )}
              </div>
            </details>
          )}
        </Cartao>
      )}
      <TabelaT colunas={COLS_ATIVOS} vazio="Nenhum ativo com estes filtros."
        linhas={pg.itens.map((x) => ({
          chave: x.codigo, ativa: x.codigo === sel, href: hrefCom(params, { at: x.codigo === sel ? null : x.codigo }, "abas"),
          celulas: [<Equip key="e" a={x} />, x.nome || "—", crit(x.criticidade), x.area || "—", x.local || "—", x.pecas.length, x.emFalta || "—",
            <Selo key="m" cor={SELO_MRO[x.mro]}>{x.mro}</Selo>],
        }))} />
      <Paginacao params={params} {...pg} mostrados={pg.itens.length} rotulo="ativo(s)" baixar={`/api/mro${hrefCom(params, { planilha: "ativos", pag: null, at: null })}`} />
      {edita && (
        <p className="text-[12.5px] text-texto-3">
          Carga para o SAP de todos os ativos filtrados, pronta para o script (listas de tarefas pelos planos, operação 0010, quantidade 1;
          cada material uma vez por lista, nunca repetido, e a coluna ATIVOS diz para quais ativos a peça vai): <a className="font-medium text-alp-azul underline" download href={`/api/mro${hrefCom(params, { planilha: "ia06", pag: null, at: null })}`}>baixar
          SAP_IA06_INCLUIR_materiais.csv</a>. O script vem da ficha de qualquer ativo (botão “Baixar script VBS”).
        </p>
      )}
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
                <Link prefetch={false} key={a.codigo} href={irAtivo(a.codigo)} title={dica(a)} className="rounded-md bg-superficie-2 px-1.5 py-0.5 font-mono text-[11.5px] text-texto-2 hover:underline"
                  style={a.criticidade === "Alta" ? { boxShadow: "inset 0 0 0 1px var(--st-critico)" } : undefined}>{M.rotuloAtivo(a)}</Link>
              ))}
              {x.ativos.length > 12 && <span className="text-[11.5px] text-texto-3">+{x.ativos.length - 12}</span>}
            </span>],
        }))} />
      <Paginacao params={params} {...pg} mostrados={pg.itens.length} rotulo="material(is)" baixar={`/api/mro${hrefCom(params, { planilha: "materiais", pag: null })}`} />
    </div>
  );
}

const SELO_NIVEL: Record<Nivel, "verde" | "amarelo" | "cinza"> = { alta: "verde", media: "amarelo", baixa: "cinza" };
const COLS_ALOC = [
  { rotulo: "Equipamento" }, { rotulo: "Nome", larga: true }, { rotulo: "Material" }, { rotulo: "Descrição do material", larga: true },
  { rotulo: "Confiança" }, { rotulo: "Por quê", larga: true },
];

/**
 * Alocação automática: cada material do catálogo/MB52 casado com os ativos pelo texto (lib: ./alocacao.ts), com o nível
 * de confiança e o motivo. Alta e média vão em lote; baixa, uma a uma. Só sugere o que ainda não está vinculado.
 */
function Alocacao({ t, sugestoes, params, edita, temDesfazer }: { t: M.AtivoMro[]; sugestoes: Sugestao[]; params: Params; edita: boolean; temDesfazer: boolean }) {
  const porCodigo = new Map(t.map((a) => [a.codigo, a]));
  const nivel = param(params, "anivel");
  const q = param(params, "aq").trim().toUpperCase();
  const contagem = Object.fromEntries(NIVEIS.map((n) => [n, sugestoes.filter((s) => s.nivel === n).length])) as Record<Nivel, number>;
  const vis = sugestoes.filter((s) => (!nivel || ROTULO_NIVEL[s.nivel] === nivel) && (!q || [s.ativo, s.material, s.motivo, porCodigo.get(s.ativo)?.nome ?? "", porCodigo.get(s.ativo)?.campo ?? ""]
    .join(" ").toUpperCase().includes(q)));
  const pg = paginar(vis, Number(param(params, "pag")) || 1);
  const ativosComSug = new Set(sugestoes.filter((s) => s.nivel !== "baixa").map((s) => s.ativo)).size;
  const semPecasHoje = t.filter((a) => !a.desativado && !a.pecas.length).length;
  return (
    <div className="space-y-4">
      <p className="text-[13.5px] text-texto-2">
        Compara a descrição de cada material (curta + Descr Completa do Sysmat, com o campo <b>APLICAÇÃO</b>) com o nome, o código, o campo de ordenação,
        o fabricante e o modelo de cada ativo. Material genérico (parafuso, EPI…) não casa com nada e fica sem ativo. Só aparece o que ainda não está vinculado.
      </p>
      <GradeNumeros colunas={4}>
        <Numero rotulo={ROTULO_NIVEL.alta} valor={inteiroBr(contagem.alta)} detalhe="cita o equipamento, a aplicação com o número dele ou fabricante + modelo" tom="bom" />
        <Numero rotulo={ROTULO_NIVEL.media} valor={inteiroBr(contagem.media)} detalhe="aplicação pelo tipo de equipamento ou só o modelo" />
        <Numero rotulo={ROTULO_NIVEL.baixa} valor={inteiroBr(contagem.baixa)} detalhe="a descrição só cita o tipo do equipamento" />
        <Numero rotulo="Ativos que ganham peças (alta + média)" valor={inteiroBr(ativosComSug)} detalhe={`${inteiroBr(semPecasHoje)} ativo(s) ainda sem peça`} />
      </GradeNumeros>
      {edita ? <AlocacaoAcoes contagem={contagem} temDesfazer={temDesfazer} /> : null}
      <FiltrosUrl campos={[
        { tipo: "busca", param: "aq", placeholder: "Buscar equipamento, nome, material ou motivo…" },
        { tipo: "pilulas", param: "anivel", rotulo: "Confiança", opcoes: NIVEIS.map((n) => ROTULO_NIVEL[n]) },
      ]} />
      <p className="text-[12.5px] text-texto-3">{inteiroBr(vis.length)} sugestão(ões).</p>
      <TabelaT colunas={edita ? [...COLS_ALOC, { rotulo: "" }] : COLS_ALOC} vazio={sugestoes.length ? "Nenhuma sugestão com estes filtros." : "Nenhuma sugestão: os materiais não citam os ativos na descrição (ou já estão todos vinculados)."}
        linhas={pg.itens.map((s) => {
          const a = porCodigo.get(s.ativo);
          return {
            chave: `${s.ativo}|${s.material}`,
            celulas: [a ? <Equip key="e" a={a} /> : s.ativo, a?.nome || "—", <span key="m" className="font-mono text-[12.5px] text-alp-azul">{s.material}</span>,
              s.descricao || "—", <Selo key="n" cor={SELO_NIVEL[s.nivel]}>{ROTULO_NIVEL[s.nivel].replace("Confiança ", "")}</Selo>,
              <span key="p" className="text-[12.5px] text-texto-2">{s.motivo}</span>,
              ...(edita ? [<AlocarUm key="a" ativo={s.ativo} material={s.material} />] : [])],
          };
        })} />
      <Paginacao params={params} {...pg} mostrados={pg.itens.length} rotulo="sugestão(ões)" baixar={`/api/mro${hrefCom(params, { planilha: "alocacao", pag: null })}`} />
    </div>
  );
}
