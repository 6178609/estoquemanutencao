import { ArrowLeft, ClipboardList, PackageOpen, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BOTAO_COMPACTO, Cabecalho, Pagina, Pilula, Selo } from "@/components/ui";
import { podeEditar, podeVer, veInteira } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { documentosDe } from "@/lib/dados/documentos";
import { brl } from "@/lib/formato";
import { urlFotoMaterial } from "@/lib/fotoMaterial";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { contexto, ordensEnriquecidas } from "@/lib/wcm/contexto";
import { dataBr } from "@/lib/wcm/util";

import { BarraSaude, Cartao, GradeNumeros, inteiroBr, Numero } from "../_ui/Blocos";
import type { Params } from "../_ui/url";
import { infoCad, inventarioAtivos, mapaEstoque, pecasDe } from "../dados";
import { SELO_REC } from "../GestaoAtivos";
import { ROTULO_CAMPO, V_ANALISE, V_CADASTRO } from "../logica";
import { BaixarPecas } from "../BaixarPecas";
import { SeloPeca } from "../SeloPeca";
import { Documentos } from "./Documentos";

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
    <Link prefetch={false} href={`/equipamentos?${new URLSearchParams(eq ? { at: eq } : {})}${eq ? "#abas" : ""}`} className="inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-medium text-texto-2 hover:text-texto">
      <ArrowLeft className="size-4" /> Equipamentos
    </Link>
  );
  if (!eq) {
    return (
      <Pagina>
        {voltar}
        <Cabecalho titulo="Biblioteca do ativo" subtitulo="Escolha um equipamento na Gestão de ativos para abrir a biblioteca dele." />
      </Pagina>
    );
  }
  const c = await contexto({});
  const [inv, est, campoEq, docs] = await Promise.all([inventarioAtivos(c), mapaEstoque(), campoDoEquipamento(c), documentosDe(eq)]);
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
  const pecas = pecasDe(c, r.codigo, est);
  const verEstoque = podeVer(u, "estoque");
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
              ["Origem", r.origem], ["ABC", r.abc || "—"],
            ].map(([k, v]) => <div key={k}><dt className="text-[12px] text-texto-3">{k}</dt><dd className="font-medium">{v}</dd></div>)}
          </dl>
          {obs && <p className="mt-4 border-t border-borda pt-3 text-[13.5px] text-texto-2"><span className="text-texto-3">Observações: </span>{obs}</p>}
        </Cartao>
      </section>

      {/* 2. componentes */}
      <section aria-labelledby="componentes" className="space-y-4">
        <div>
          <h2 id="componentes" className="font-display text-[20px] font-medium">Componentes <span className="text-texto-3">({pecas.length})</span></h2>
          <p className="mt-1 text-[13px] text-texto-3">Peças vinculadas no cadastro do equipamento, com a situação no estoque (MB52).{edita ? " Para vincular mais, use Editar cadastro." : ""}</p>
          <div className="mt-3"><BaixarPecas eq={r.codigo} n={pecas.length} /></div>
        </div>
        {pecas.length === 0 ? (
          <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">Nenhum componente vinculado a este equipamento.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pecas.map((p) => {
              const foto = verEstoque ? urlFotoMaterial(p.codigo, (c.cad.materiais[p.codigo] as { foto?: unknown } | undefined)?.foto, true) : null;
              return (
                <li key={p.codigo} className="flex gap-3 rounded-cartao border border-borda bg-superficie p-4">
                  {foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={foto} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl border border-borda bg-white object-cover" />
                  ) : (
                    <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-superficie-2 text-texto-3"><PackageOpen className="size-6" aria-hidden /></span>
                  )}
                  <div className="min-w-0">
                    <div className="num font-mono text-[12.5px] text-acao">{p.codigo}</div>
                    <div className="line-clamp-2 text-[14px] font-medium">{p.descricao || "—"}</div>
                    <div className="mt-1.5"><SeloPeca p={p} /></div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {verEstoque && pecas.length > 0 && <p className="text-[12.5px] text-texto-3">A foto de cada peça se põe no Estoque (toque no material → Tirar foto).</p>}
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
