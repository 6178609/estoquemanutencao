import "server-only";

import { guardar } from "@/app/(app)/saude/calculo";

import { camposDeOrdenacao } from "./camposOrdenacao";
import type { Contexto } from "./contexto";
import { bases } from "./dados";
import { campoGeralPorEquipamento } from "./util";

/**
 * Campo de ordenação GERAL de cada equipamento — o que identifica o ativo em todas as abas (o mais usado nas ordens
 * dele no IW38; o mesmo da Gestão de MRO). Cache pela versão do IW38.
 */
export async function camposGerais(c: Pick<Contexto, "b">): Promise<Map<string, string>> {
  const ordens = c.b.ordens.dados ?? [];
  const porOrdem = await camposDeOrdenacao(c.b.ordens.dados);
  const eqs = c.b.equipamentos.dados ?? [];
  return guardar(`campo-geral|${c.b.ordens.atualizado}:${ordens.length}:${porOrdem.size}|${c.b.equipamentos.atualizado}:${eqs.length}`, () => {
    const m = campoGeralPorEquipamento(ordens, porOrdem);
    // sem ordem com campo no IW38: o campo de ordenação do próprio IH08 (fora os de preenchimento genérico)
    for (const e of c.b.equipamentos.dados ?? []) {
      const v = (e.campo ?? "").trim();
      if (v && !m.has(e.equipamento) && !m.has(normalizar(e.equipamento)) && !CAMPO_GENERICO.test(v)) m.set(e.equipamento, v);
    }
    // o mesmo equipamento também pelo código em maiúsculas e sem zeros à esquerda (IH08, AF, SEMEQ…)
    for (const [k, v] of [...m]) {
      const n = normalizar(k);
      if (n && !m.has(n)) m.set(n, v);
    }
    return m;
  });
}

/** Campos de ordenação de preenchimento genérico no IH08 (XX, 1234, só pontos ou traços…). */
const CAMPO_GENERICO = /^(X+|1234|0+|[.\-_ ]+)$/i;

const normalizar = (codigo: string) => String(codigo ?? "").trim().toUpperCase().replace(/^0+(?=.)/, "");

/** Campo de ordenação de um equipamento ("" quando ele não tem ordem com campo no IW38). */
function campoDe(campos: Map<string, string>, codigo: string | null | undefined): string {
  if (!codigo) return "";
  return campos.get(codigo) ?? campos.get(normalizar(codigo)) ?? "";
}

/** Para telas sem o contexto dos filtros (ex.: Estoque): só as bases, sem montar o resto do contexto. */
export async function campoDoEquipamentoDasBases(): Promise<(codigo: string | null | undefined) => string> {
  return campoDoEquipamento({ b: await bases() });
}

/** Função pronta para as telas: código do equipamento → campo de ordenação. */
export async function campoDoEquipamento(c: Pick<Contexto, "b">): Promise<(codigo: string | null | undefined) => string> {
  const campos = await camposGerais(c);
  return (codigo) => campoDe(campos, codigo);
}
