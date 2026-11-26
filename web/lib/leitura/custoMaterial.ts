import { acharColuna, paraNumero } from "../dados/texto";
import type { Tabela } from "./leitura";

/**
 * Recorte da lista de custo dos materiais do SAP (preço médio e standard) antes do envio: só as colunas que o site usa,
 * com nomes fixos, o código sem zeros à esquerda e os números normalizados. Feito no navegador: colunas fora da lista
 * (centro de lucro, planejador MRP e o nome dele…) nem saem do computador. Testado em testes/custoMaterial.test.ts.
 *
 * Cabeçalhos aceitos em inglês (export padrão: "Moving Average Price/Periodic Unit Price", "Prç.standard"…) ou português.
 */
interface Coluna { nome: string; padroes: string[]; excluir?: string; numero?: boolean }

export const COLUNAS_CUSTO: Coluna[] = [
  { nome: "Material", padroes: ["^MATERIAL$", "^CODIGO( DO)? MATERIAL$"] },
  // no Excel o 2º "Material" (a descrição) vira "Material.1"
  { nome: "Descrição", padroes: ["^MATERIAL 1$", "MATERIAL DESCRIPTION", "TEXTO BREVE", "^DESCRICAO", "DENOMINACAO"] },
  { nome: "UM", padroes: ["BASE UNIT OF MEASURE", "UNIDADE (DE )?MEDIDA", "^UMB$", "^UM$", "^UN$"] },
  { nome: "Preço médio", padroes: ["MOVING AVERAGE PRICE", "PRECO MEDIO", "PRC MEDIO", "^PRECO MED "], numero: true },
  { nome: "Preço standard", padroes: ["^PRC STANDARD$", "^PRECO STANDARD$", "^STANDARD PRICE$"], numero: true },
  { nome: "Classe de avaliação", padroes: ["VALUATION CLASS", "CLASSE (DE )?AVALIACAO", "CLASSE AVAL"] },
  { nome: "Tipo de material", padroes: ["^MATERIAL TYPE$", "^TIPO (DE )?MATERIAL$"] },
  { nome: "Depósito", padroes: ["^STORAGE LOCATION$", "^DEPOSITO$", "DEPOSITO"], excluir: "ISSUE|SAIDA|DENOMINACAO|DESCR" },
  { nome: "Utilização livre", padroes: ["UTILIZ LIVRE", "UTILIZACAO LIVRE", "LIVRE UTILIZ", "UNRESTRICTED"], excluir: "VALOR|VALUE", numero: true },
  { nome: "Tipo de MRP", padroes: ["^MRP TYPE$", "^TIPO (DE )?MRP$"] },
  { nome: "Tipo de suprimento", padroes: ["PROCUREMENT TYPE", "TIPO (DE )?SUPRIMENTO", "TP SUPRIMENTO"] },
];

/** "000123" → "123" (só código numérico). */
export const semZerosCodigo = (c: string) => (/^\d+$/.test(c) ? c.replace(/^0+(?=\d)/, "") : c);

/** Só as colunas conhecidas (as que faltam no arquivo não entram) e as linhas com código de material. */
export function recortarCusto(t: Tabela): Tabela {
  const achadas = COLUNAS_CUSTO.map((c) => ({ c, col: acharColuna(t.colunas, c.padroes, c.excluir) }))
    .filter((x): x is { c: Coluna; col: string } => !!x.col);
  const idx = achadas.map((x) => t.colunas.indexOf(x.col));
  const iMat = achadas.findIndex((x) => x.c.nome === "Material");
  const linhas: string[][] = [];
  for (const l of t.linhas) {
    const out = idx.map((i, k) => {
      const v = String(l[i] ?? "").trim();
      if (achadas[k].c.numero) {
        const n = paraNumero(v);
        return Number.isFinite(n) ? String(n) : "";
      }
      return k === iMat ? semZerosCodigo(v.toUpperCase()) : v;
    });
    if (iMat >= 0 && out[iMat]) linhas.push(out);
  }
  return { colunas: achadas.map((x) => x.c.nome), linhas };
}
