import { ArrowLeft, ClipboardList, ListPlus, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BOTAO_COMPACTO, Cabecalho, Pagina, Pilula, Selo } from "@/components/ui";
import { podeEditar, podeVer, veInteira } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { documentosDe } from "@/lib/dados/documentos";
import { pecasSemCadastroDe } from "@/lib/dados/pecasSemCadastro";
import { brl } from "@/lib/formato";
import { urlFotoMaterial } from "@/lib/fotoMaterial";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { contexto, ordensEnriquecidas } from "@/lib/wcm/contexto";
import { dataBr } from "@/lib/wcm/util";

import { BarraSaude, Cartao, GradeNumeros, inteiroBr, Numero } from "../_ui/Blocos";
import type { Params } from "../_ui/url";
import { baseMateriais } from "../../mro/dados";
import { PecasPorSistema } from "../_ui/PecasPorSistema";
import { infoCad, inventarioAtivos } from "../dados";
import { gruposDoAtivo } from "../gruposPecas";
import { SELO_REC } from "../GestaoAtivos";
import { ROTULO_CAMPO, V_ANALISE, V_CADASTRO } from "../logica";
import { BaixarPecas } from "../BaixarPecas";
import { Documentos } from "./Documentos";
import { PecasSemCadastro } from "./PecasSemCadastro";

export const metadata: Metadata = { title: "Biblioteca do ativo" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Biblioteca do ativo: tudo de um equipamento numa página — o resumo (inventário, saúde, custo, ciclo de vida),
 * os componentes (peças vinculadas no cadastro, com a situação no estoque e a foto do material), os manuais e
 * documentos (arquivo ou link) e as últimas ordens. Aberta a partir da Gestão de ativos (?eq=<código>).
 */
export default async function Biblioteca(props: { searchParams: Promise<Params> }) {
  const u = await exigir("equipamentos");
  const params = await props.searchParams;
  const eq = typeof params.eq === "string" ? params.eq.trim() : "";
  const completo = veInteira(u, "equipamentos");
  const edita = completo && podeEditar(u);
  const voltar = (
    <Link prefetch={false} href="/equipamentos#abas" className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-medium text-texto-2 hover:text-texto">
      <ArrowLeft className="size-4" /> Escolher outro ativo
    </Link>
  );
  if (!eq) {
    return (
      <Pagina>
        {voltar}
        <Cabecalho titulo="Biblioteca do ativo" subtitulo="Escolha um equipamento na lista de Equipamentos para abrir a biblioteca dele." />
      </Pagina>
    );
  }
  const c = await contexto({});
  const [inv, bm, campoEq, docs] = await Promise.all([inventarioAtivos(c), baseMateriais(), campoDoEquipamento(c), documentosDe(eq)]);
  const r = inv.find((x) => x.codigo === eq);
  if (!r) {
    return (
      <Pagina>
        {voltar}
        <Cabecalho titulo="Biblioteca do ativo" subtitulo={`O equipamento ${eq} não está no inventário (IH08, IW38 ou cadastro do site).`} />
      </Pagina>
    );
  }
  const campo = campoEq(r.codigo);
  const info = infoCad(c, r.codigo);
  const verEstoque = podeVer(u, "estoque");
  const grupos = gruposDoAtivo(c, r.codigo, bm,
    verEstoque ? (m) => urlFotoMaterial(m, (c.cad.materiais[m] as { foto?: unknown } | undefined)?.foto, true) : undefined);
  const nPecas = new Set(grupos.flatMap((g) => g.pecas.map((p) => p.codigo))).size;
  const semCadastro = pecasSemCadastroDe(info);
  const verOrdens = podeVer(u, "ordens");
  const ordens = c.b.ordens.dados && (verOrdens || completo) ? ordensEnriquecidas(c).filter((o) => o.equipChave === r.codigo).sort((a, b) => (b.data ?? -1e9) - (a.data ?? -1e9)) : [];
  const obs = typeof info.observacoes === "string" ? info.observacoes : "";

  return (
    <Pagina>
      {voltar}
      <Cabecalho titulo={campo || r.codigo} destaque={r.equipamento || undefined}
        sobre={<Pilula>Biblioteca do ativo · {r.codigo}</Pilula>}
        subtitulo={[r.localInstalacao, r.area, r.categoria].filter(Boolean).join(" · ") || undefined}
        acoes={<div className="flex flex-wrap gap-2">
          {completo && ordens.length > 0 && <Link prefetch={false} href={`/equipamentos?${new URLSearchParams({ visao: V_ANALISE, eq: r.codigo })}#ficha`} className={BOTAO_COMPACTO}><ClipboardList className="size-3.5" /> Ficha das ordens</Link>}
          {podeVer(u, "mro") && <Link prefetch={false} href={`/mro?${new URLSearchParams({ at: r.codigo, ia06: "1" })}#ia06`} className={BOTAO_COMPACTO}><ListPlus className="size-3.5" /> Incluir no SAP (IA06)</Link>}
          {edita && <Link prefetch={false} href={`/equipamentos?${new URLSearchParams({ visao: V_CADASTRO, form: r.codigo })}#form`} className={BOTAO_COMPACTO}><Pencil className="size-3.5" /> {r.origem !== "SAP" ? "Editar cadastro" : "Cadastrar no site"}</Link>}
        </div>} />

      {/* 1. resumo */}
      <section aria-labelledby="resumo" className="space-y-4">
        <h2 id="resumo" className="font-display text-[20px] font-medium">Resumo do ativo</h2>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <Selo>{r.situacao}</Selo>
          <Selo cor={r.criticidade === "Alta" ? "vermelho" : r.criticidade === "Média" ? "laranja" : r.criticidade === "Baixa" ? "verde" : "cinza"}>Criticidade {r.criticidade || "sem classe"}</Selo>
          <Selo cor={SELO_REC[r.recomendacao] ?? "cinza"}>{r.recomendacao}</Selo>
        </div>
        <GradeNumeros colunas={4}>
          <Numero rotulo="Saúde" valor={r.saude != null ? String(r.saude) : "—"} detalhe={r.faixa || undefined} dica="Índice 0–100 da Saúde dos ativos" />
          <Numero rotulo="Quebras em 12 meses" valor={inteiroBr(r.quebras12Meses)} detalhe={r.mtbfDias != null ? `MTBF ${r.mtbfDias} dias` : undefined} />
          <Numero rotulo="Custo em 12 meses" valor={brl(r.custo12Meses)} detalhe={`total ${brl(r.custoTotal)}`} />
          <Numero rotulo="Ordens pendentes" valor={inteiroBr(r.ordensPendentes)} detalhe={`${inteiroBr(r.planosPreventivos)} plano(s) preventivo(s)`} />
        </GradeNumeros>
        {r.saude != null && <div className="max-w-sm"><BarraSaude valor={r.saude} faixa={r.faixa} /></div>}
        <Cartao>
          <dl className="grid gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-2 lg:grid-cols-4">
            {[[ROTULO_CAMPO, campo || "—"], ["Código", r.codigo], ["Local de instalação", r.localInstalacao || "—"], ["Área / centro", [r.area, r.centro].filter(Boolean).join(" · ") || "—"],
              ["Fabricante", r.fabricante || "—"], ["Modelo", r.modelo || "—"], ["Nº de série", r.serie || "—"], ["Categoria", r.categoria || "—"],
              ["Instalação", r.anoInstalacao != null ? `${r.anoInstalacao} (${r.idade} anos)` : "—"], ["Vida útil", r.vidaUtil != null ? `${r.vidaUtil} anos (restam ${r.vidaRestante ?? "—"})` : "—"],
              ["Garantia", r.garantiaAte != null ? `${r.garantia} · até ${dataBr(r.garantiaAte)}` : r.garantia || "—"], ["Valor de reposição", brl(r.valorReposicao)],
              ["Centro de custo", r.centroCusto || "—"], ["Status do usuário", r.statusUsuario || "—"], ["Nº de inventário", r.inventario || "—"],
              ["Equipamento superior", r.superior
                ? <Link prefetch={false} href={`/equipamentos/biblioteca?${new URLSearchParams({ eq: r.superior })}`} className="text-[var(--acao)] hover:underline">{r.superior}</Link> : "—"],
              ["Origem", r.origem], ["ABC", r.abc || "—"],
            ].map(([k, v]) => <div key={String(k)}><dt className="text-[12px] text-texto-3">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          </dl>
          {obs && <p className="mt-4 border-t border-borda pt-3 text-[13.5px] text-texto-2"><span className="text-texto-3">Observações: </span>{obs}</p>}
        </Cartao>
      </section>

      {/* 2. componentes */}
      <section aria-labelledby="componentes" className="space-y-4">
        <div>
          <h2 id="componentes" className="font-display text-[20px] font-medium">Componentes <span className="text-texto-3">({nPecas})</span></h2>
          <p className="mt-1 text-[13px] text-texto-3">Peças vinculadas ao equipamento e aos sistemas dele no SAP, com o saldo no almoxarifado (MB52). Toque na peça para ver o detalhe.{edita ? " Para vincular mais, use Editar cadastro ou a Gestão de MRO." : ""}</p>
          <div className="mt-3"><BaixarPecas eq={r.codigo} n={nPecas + semCadastro.length} /></div>
        </div>
        {nPecas === 0 ? (
          <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">Nenhum componente vinculado a este equipamento.</p>
        ) : <PecasPorSistema grupos={grupos} />}
        {verEstoque && nPecas > 0 && <p className="text-[12.5px] text-texto-3">A foto de cada peça se põe no Estoque (toque no material → Tirar foto).</p>}
      </section>

      {/* 2b. peças sem cadastro no Sysmat */}
      <section aria-labelledby="sem-cadastro" className="space-y-4">
        <div>
          <h2 id="sem-cadastro" className="font-display text-[20px] font-medium">Peças sem cadastro no Sysmat <span className="text-texto-3">({semCadastro.length})</span></h2>
          <p className="mt-1 text-[13px] text-texto-3">Peças deste equipamento que ainda não têm código de material (do manual, de desenho ou da máquina). A lista também sai no PDF e no Excel de peças, para pedir o cadastro.</p>
        </div>
        <PecasSemCadastro eq={r.codigo} edita={edita}
          pecas={semCadastro.map(({ id, descricao, referencia, fabricante, quantidade, origem }) => ({ id, descricao, referencia, fabricante, quantidade, origem }))} />
      </section>

      {/* 3. manuais e documentos */}
      <section aria-labelledby="manuais" className="space-y-4">
        <div>
          <h2 id="manuais" className="font-display text-[20px] font-medium">Manuais e documentos <span className="text-texto-3">({docs.length})</span></h2>
          <p className="mt-1 text-[13px] text-texto-3">Manuais, catálogos de peças, desenhos, fotos da plaqueta, procedimentos — arquivo (PDF ou imagem) ou link.{edita ? "" : " Só editor ou administrador adiciona."}</p>
        </div>
        <Documentos eq={r.codigo} edita={edita}
          docs={docs.map((d) => ({ id: d.id, titulo: d.titulo, tipo: d.tipo, tamanho: d.tamanho, em: d.em, por: d.por, url: d.url }))} />
      </section>

      {/* 4. últimas ordens */}
      {ordens.length > 0 && verOrdens && (
        <section aria-labelledby="ordens" className="space-y-4">
          <h2 id="ordens" className="font-display text-[20px] font-medium">Últimas ordens <span className="text-texto-3">({inteiroBr(ordens.length)} no IW38)</span></h2>
          <ul className="divide-y divide-borda overflow-hidden rounded-cartao border border-borda bg-superficie">
            {ordens.slice(0, 8).map((o) => (
              <li key={o.ordem}>
                <Link prefetch={false} href={`/ordens?${new URLSearchParams({ ordem: o.ordem })}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13.5px] transition hover:bg-superficie-2">
                  <span className="num font-mono text-acao">{o.ordem}</span>
                  <span className="text-texto-3">{o.data != null ? dataBr(o.data) : "—"}</span>
                  <span className="min-w-0 flex-1 truncate">{o.texto || "—"}</span>
                  <Selo cor={o.situacao === "Concluída" ? "verde" : o.atrasada ? "vermelho" : "azul"}>{o.atrasada ? "atrasada" : o.situacao}</Selo>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Pagina>
  );
}
