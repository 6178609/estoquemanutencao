import { Selo } from "@/components/ui";
import { atividadesDoMaterial, atividadesPorPeriodicidade, codigoSap, materiaisPorCodigo, type FichaTecnica } from "@/lib/wcm/fichaTecnica";

import { GradeNumeros, inteiroBr, Numero, TabelaT } from "../_ui/Blocos";
import type { PecaMro } from "../../mro/logica";

const COR_TIPO: Record<string, "azul" | "amarelo" | "cinza"> = { PREVENTIVA: "azul", CONDICIONAL: "amarelo", "CORRETIVA/REPOSIÇÃO": "cinza" };

/**
 * Ficha técnica do modelo da máquina (levantada dos manuais e planilhas de spare parts): dados técnicos, atividades
 * preventivas por periodicidade (proposta para revisar e levar ao SAP), materiais com código SAP (com o saldo do Estoque) e
 * os materiais a cadastrar no Sysmat.
 */
export function FichaModelo({ modelo, ficha, peca }: { modelo: string; ficha: FichaTecnica; peca: (codigo: string) => PecaMro }) {
  const { comCodigo, semCodigo } = materiaisPorCodigo(ficha);
  const grupos = atividadesPorPeriodicidade(ficha);
  const porMat = atividadesDoMaterial(ficha);
  const naoPrev = ficha.atividades.filter((a) => a.tipo !== "PREVENTIVA");
  const nomeMat = new Map(ficha.materiais.map((m) => [m.id, `${m.descricao}${m.especificacao ? ` ${m.especificacao}` : ""}`]));
  const dados = ficha.dados_tecnicos.reduce<Record<string, typeof ficha.dados_tecnicos>>((m, d) => ((m[d.grupo] ??= []).push(d), m), {});
  const href = (p: string) => `/api/equipamentos/ficha?modelo=${encodeURIComponent(modelo)}&planilha=${p}`;
  return (
    <div className="space-y-5">
      <GradeNumeros colunas={4}>
        <Numero rotulo="Componentes / materiais" valor={inteiroBr(ficha.materiais.length)} detalhe={`${inteiroBr(comCodigo.length)} com código SAP`} />
        <Numero rotulo="Sem código SAP" valor={inteiroBr(semCodigo.length)} detalhe="a cadastrar no Sysmat" tom={semCodigo.length ? "atencao" : "bom"} />
        <Numero rotulo="Atividades preventivas" valor={inteiroBr(grupos.reduce((s, g) => s + g.atividades.length, 0))} detalhe={`${grupos.length} periodicidades`} />
        <Numero rotulo="Condicionais e reposição" valor={inteiroBr(naoPrev.length)} detalhe="quando necessário ou sob demanda" />
      </GradeNumeros>

      <details className="rounded-xl border border-borda" open>
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[13.5px] font-medium hover:bg-superficie-2">Atividades preventivas por periodicidade (proposta de lista)</summary>
        <div className="space-y-4 border-t border-borda p-3">
          <p className="text-[12.5px] text-texto-3">Levantadas do manual do modelo: revise e leve ao SAP (lista de tarefas/plano). <a className="text-alp-azul hover:underline" href={href("atividades")} download>Baixar (Excel)</a></p>
          {grupos.map((g) => (
            <div key={g.periodicidade}>
              <div className="mb-1 text-[13px] font-medium">{g.periodicidade} <span className="text-texto-3">({g.atividades.length})</span></div>
              <ul className="divide-y divide-borda rounded-lg border border-borda text-[13px]">
                {g.atividades.map((a) => (
                  <li key={a.id} className="space-y-0.5 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2"><Selo cor={COR_TIPO[a.tipo] ?? "cinza"}>{a.sistema}</Selo><span>{a.descricao}</span></div>
                    <div className="text-[11.5px] text-texto-3">{a.referencia}{a.material_ids.length ? ` · materiais: ${a.material_ids.map((id) => nomeMat.get(id) ?? id).join("; ")}` : ""}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>

      <details className="rounded-xl border border-borda">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[13.5px] font-medium hover:bg-superficie-2">Materiais com código SAP ({comCodigo.length})</summary>
        <div className="border-t border-borda p-3">
          <TabelaT vazio="Nenhum material com código SAP." colunas={[{ rotulo: "Código SAP" }, { rotulo: "Material", larga: true }, { rotulo: "Texto SAP", larga: true }, { rotulo: "Qtd.", dir: true },
            { rotulo: "Estoque", dir: true }, { rotulo: "Atividades", dir: true }]}
            linhas={comCodigo.map((m) => { const p = peca(codigoSap(m)); return { chave: m.id, celulas: [codigoSap(m), `${m.descricao}${m.especificacao ? ` · ${m.especificacao}` : ""}`,
              p.descricao || m.descricao_sap || "—", m.qtd_planilha ?? m.qtd_orcamento ?? "—", p.estoque == null ? "—" : inteiroBr(p.estoque), porMat.get(m.id)?.length ?? 0] }; })} />
        </div>
      </details>

      <details className="rounded-xl border border-borda">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[13.5px] font-medium hover:bg-superficie-2">Materiais sem código SAP — cadastrar no Sysmat ({semCodigo.length})</summary>
        <div className="space-y-2 border-t border-borda p-3">
          <p className="text-[12.5px] text-texto-3">Sem código SAP nos arquivos recebidos (ficam fora do almoxarifado). <a className="text-alp-azul hover:underline" href={href("cadastro")} download>Baixar a lista (Excel)</a></p>
          <TabelaT vazio="Todos os materiais têm código." colunas={[{ rotulo: "Material", larga: true }, { rotulo: "Especificação", larga: true }, { rotulo: "Qtd.", dir: true }, { rotulo: "Origem" }, { rotulo: "Atividades", dir: true }]}
            linhas={semCodigo.map((m) => ({ chave: m.id, celulas: [m.descricao, m.especificacao || "—", m.qtd_planilha ?? m.qtd_orcamento ?? "—", m.origem, porMat.get(m.id)?.length ?? 0] }))} />
        </div>
      </details>

      <details className="rounded-xl border border-borda">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[13.5px] font-medium hover:bg-superficie-2">Dados técnicos e pontos a validar</summary>
        <div className="space-y-4 border-t border-borda p-3">
          {Object.entries(dados).map(([g, ds]) => (
            <div key={g}>
              <div className="mb-1 text-[13px] font-medium">{g}</div>
              <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
                {ds.map((d) => <div key={d.parametro} className="flex justify-between gap-3 border-b border-borda py-1"><dt className="text-texto-3">{d.parametro}</dt><dd>{d.valor ?? "—"}{d.unidade ? ` ${d.unidade}` : ""}</dd></div>)}
              </dl>
            </div>
          ))}
          {ficha.alertas_qualidade.length > 0 && (
            <div>
              <div className="mb-1 text-[13px] font-medium">Pontos a validar</div>
              <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-texto-2">{ficha.alertas_qualidade.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
