/**
 * Pontos a corrigir nas listas de tarefas (visão Qualidade). Funções puras, testadas em testes/listasTarefas.test.ts.
 */
import { chave } from "@/lib/dados/texto";

import type { LinhaLista } from "./logica";

export interface Problema {
  id: string; titulo: string; explica: string; cor: "vermelho" | "laranja" | "amarelo";
  listas: (LinhaLista & { detalhe?: string })[];
}

/** Lista geral com muitos equipamentos: a peça incluída nela vai para todos. */
export const LIMITE_GERAL = 10;

export function problemasDasListas(t: LinhaLista[]): Problema[] {
  const com = (fn: (x: LinhaLista) => string | false) => t.flatMap((x) => { const d = fn(x); return d === false ? [] : [{ ...x, detalhe: d || undefined }]; });
  // listas com as mesmas operações (texto e ordem) que outra
  const porConteudo = new Map<string, LinhaLista[]>();
  for (const x of t) {
    if (!x.lt.operacoes.length) continue;
    const k = x.lt.operacoes.map((o) => chave(`${o.texto} ${o.textoLongo}`)).join("|");
    (porConteudo.get(k) ?? porConteudo.set(k, []).get(k)!).push(x);
  }
  const repetidas = new Map<string, string>();
  for (const g of porConteudo.values()) if (g.length > 1) for (const x of g) {
    repetidas.set(x.lt.chave, `igual a ${g.filter((y) => y !== x).slice(0, 3).map((y) => `${y.lt.grupo}/${y.lt.numerador}`).join(", ")}${g.length > 4 ? "…" : ""}`);
  }
  const nOps = (x: LinhaLista, fn: (o: LinhaLista["lt"]["operacoes"][number]) => boolean) => x.lt.operacoes.filter(fn).length;
  return [
    { id: "sem-equip", titulo: "Sem equipamento", cor: "vermelho",
      explica: "Nenhum plano da IP19 nem ordem do IW38 usa a lista: confira se ela ainda é usada ou se o plano está com outra lista.",
      listas: com((x) => (!x.equipamentos.length ? "" : false)) },
    { id: "sem-operacao", titulo: "Sem operação", cor: "vermelho", explica: "A lista não tem nenhuma operação.",
      listas: com((x) => (!x.lt.operacoes.length ? "" : false)) },
    { id: "sem-tempo", titulo: "Operação sem trabalho ou duração", cor: "laranja",
      explica: "Sem o trabalho, a ordem não entra na carga da equipe (Mão de obra e Programação semanal).",
      listas: com((x) => { const n = nOps(x, (o) => !o.trabalhoH || !o.duracaoH); return n ? `${n} operação(ões)` : false; }) },
    { id: "sem-ciclo", titulo: "Operação sem pacote (ciclo)", cor: "laranja",
      explica: "A operação não tem pacote de manutenção da estratégia: não é chamada pelo plano.",
      listas: com((x) => { const n = nOps(x, (o) => o.cicloDias == null); return n ? `${n} operação(ões)` : false; }) },
    { id: "sem-centro", titulo: "Operação sem centro de trabalho", cor: "laranja", explica: "Sem o centro de trabalho, não se sabe que equipe executa.",
      listas: com((x) => { const n = nOps(x, (o) => !o.centroTrabalho); return n ? `${n} operação(ões)` : false; }) },
    { id: "sem-texto", titulo: "Operação sem texto longo", cor: "amarelo",
      explica: "Só o texto curto: o executante não tem o passo a passo (o que verificar, valores de referência).",
      listas: com((x) => { const n = nOps(x, (o) => !o.textoLongo); return n ? `${n} operação(ões)` : false; }) },
    { id: "repetida", titulo: "Listas com as mesmas operações", cor: "amarelo",
      explica: "Duas ou mais listas com o mesmo conteúdo: dá para usar uma só (ou adaptar ao equipamento).",
      listas: com((x) => repetidas.get(x.lt.chave) ?? false) },
    { id: "geral-grande", titulo: `Lista geral com mais de ${LIMITE_GERAL} equipamentos`, cor: "amarelo",
      explica: "Uma peça incluída nela (IA06) vai para todos esses equipamentos: confira antes de incluir componentes.",
      listas: com((x) => (x.equipamentos.length > LIMITE_GERAL ? `${x.equipamentos.length} equipamentos` : false)) },
    { id: "troca-sem-componente", titulo: "Troca sem componente na lista", cor: "amarelo",
      explica: "A operação manda substituir/trocar, mas a lista não tem o material (componente): a peça não é reservada na ordem.",
      listas: com((x) => {
        const n = nOps(x, (o) => !o.componentes.length && /SUBSTITU|\bTROCA|\bTROCAR/.test(chave(`${o.texto} ${o.textoLongo}`)));
        return n ? `${n} operação(ões)` : false;
      }) },
  ];
}
