import "server-only";

import { guardar } from "@/app/(app)/saude/calculo";
import { lerCadastro } from "@/lib/dados/cadastros";
import { fonte } from "@/lib/dados/fonte";
import { campoDoEquipamento } from "@/lib/wcm/campoGeral";
import { bases } from "@/lib/wcm/dados";
import { hashTexto } from "@/lib/wcm/util";

import { calcular, montarEntrada, type Calculo, type Montado } from "./montar";

/**
 * Programação de paradas no servidor: lê IP19, IW38, IW38OP e IH08 das bases do site e o cadastro
 * `programacao_paradas.json`, monta a entrada e calcula. Cache pela versão das 4 bases, pelo cadastro e pelo dia.
 */

export const ARQ_PARADAS = "programacao_paradas.json";

export interface ProgramacaoParadas {
  montado: Montado; calculo: Calculo; demo: boolean;
  atualizado: { ip19: string | null; iw38: string | null; ih08: string | null; iw38op: string | null };
}

export async function programacaoParadas(): Promise<ProgramacaoParadas | null> {
  const b = await bases();
  const ip19 = b.cruas.ip19.dados;
  if (!ip19?.length) return null;
  const demo = !fonte();
  const [cadLido, campo] = await Promise.all([lerCadastro(ARQ_PARADAS), campoDoEquipamento({ b })]);
  const cad = cadLido as Record<string, Record<string, unknown>>;
  // demonstração: os dados fictícios não têm GAL1, Componentes nem as máquinas das classes — tudo entra
  const cadUsado = demo ? { ...cad, parametros: { ...(cad.parametros ?? {}), localizacoes: [], centrosEliminados: [], soClasses: false } } : cad;
  const atualizado = { ip19: b.cruas.ip19.atualizado, iw38: b.ordens.atualizado, ih08: b.equipamentos.atualizado, iw38op: b.operacoes.atualizado };
  const assin = [b.cruas.ip19, b.ordens, b.operacoes, b.equipamentos].map((x) => `${x.atualizado}:${x.dados?.length ?? -1}`).join("|");
  const chave = `paradas|${assin}|${hashTexto(JSON.stringify(cadUsado))}|${b.hoje}|${demo}`;
  return guardar(chave, () => {
    const montado = montarEntrada({ ip19, ordens: b.ordens.dados, ops: b.operacoes.dados, eqs: b.equipamentos.dados, campoGeral: (e) => campo(e),
      cad: cadUsado, hoje: b.hoje, demo });
    return { montado, calculo: calcular(montado.entrada), demo, atualizado };
  });
}
