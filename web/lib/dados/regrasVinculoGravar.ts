import "server-only";

import { catalogo } from "./bases";
import { gravarCadastroLote, lerCadastro } from "./cadastros";
import { comPecasDaRegra, vinculosDasRegras } from "./regrasVinculo";
import { bases } from "../wcm/dados";

const ARQ = "cadastro_equipamentos.json";

/**
 * Aplica as regras de vínculo (regrasVinculo.ts) no cadastro de equipamentos: só acrescenta peças que faltam; não grava
 * nada se já está tudo vinculado. Chamado depois do envio de uma IH08 ou de um catálogo do Sysmat novos.
 */
export async function aplicarRegrasDeVinculo(por = "Regra automática de vínculo"): Promise<{ equipamentos: number; pecas: number }> {
  const [b, cat] = await Promise.all([bases(), catalogo()]);
  if (!b.equipamentos.dados?.length || !cat.dados?.length) return { equipamentos: 0, pecas: 0 };
  const quer = vinculosDasRegras(b.equipamentos.dados, cat.dados);
  if (!quer.size) return { equipamentos: 0, pecas: 0 };
  const atual = await lerCadastro(ARQ, { fresco: true });
  const faltando = [...quer].filter(([tag, v]) => comPecasDaRegra(atual[tag], v.nome, v.materiais) != null);
  if (!faltando.length) return { equipamentos: 0, pecas: 0 };
  let pecas = 0;
  await gravarCadastroLote(ARQ, Object.fromEntries(faltando.map(([tag, v]) => [tag, (item: Record<string, unknown> | undefined) => {
    const novo = comPecasDaRegra(item, v.nome, v.materiais);
    if (novo) pecas += (novo.materiais as string[]).length - (Array.isArray(item?.materiais) ? item!.materiais.length : 0);
    return novo ?? undefined;
  }])), por);
  return { equipamentos: faltando.length, pecas };
}
