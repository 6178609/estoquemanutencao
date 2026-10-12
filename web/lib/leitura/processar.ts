import { chave } from "../dados/texto";
import { lerArquivo, LeituraErro, paraTexto, sondar } from "./leitura";
import { emPartes } from "./parquet";
import { NOMES_BASE, type Tipo } from "./tipos";
import { Xlsx } from "./xlsx";

/** O que sai de um arquivo anexado: as bases achadas nele, já em parquet (em partes, se grande). */
export interface BaseLida {
  tipo: Tipo;
  nome: string;
  aba: string | null;
  colunas: string[];
  linhas: number;
  partes: Uint8Array[];
}

export interface Processado {
  arquivo: string;
  bases: BaseLida[];
  erro?: string;
  /** nomes dos tipos de ordem (YM11 → "Corretiva Emergencial…") da aba de apoio da Gestão de HH */
  tiposOrdem?: Record<string, string>;
}

/** A aba de apoio da planilha de Gestão de HH: colunas "TIPO" (código) e "TIPO DE OM" (descrição) — como _tipos_da_gestao. */
export function tiposDaGestao(x: Xlsx): Record<string, string> {
  for (const aba of x.abas) {
    const linhas = x.linhas(aba, 60);
    const cab = (linhas[0] || []).map((v) => chave(paraTexto(v)));
    const i = cab.indexOf("TIPO"), j = cab.indexOf("TIPO DE OM");
    if (i < 0 || j < 0) continue;
    const out: Record<string, string> = {};
    for (const r of linhas.slice(1)) {
      const cod = paraTexto(r[i]).trim(), desc = paraTexto(r[j]).trim();
      if (cod && desc && /^[A-Z]{1,3}\d{2}$/.test(cod)) out[cod] = desc;
    }
    return out;
  }
  return {};
}

export function processar(arquivo: string, bytes: Uint8Array): Processado {
  try {
    const x = bytes[0] === 0x50 && bytes[1] === 0x4b ? new Xlsx(bytes) : undefined;
    const achados = sondar(arquivo, bytes, x);
    if (!achados.length) return { arquivo, bases: [], erro: /filtrad/i.test(arquivo)
      ? "é um recorte filtrado (baixado do site), não o export completo"
      : "não reconheci nenhuma base pelos cabeçalhos (IW38, MB52, IW28, IH08, IP19, IW47, requisições, Sysmat, Gestão de HH, Gerenciador de AF)" };
    const bases = achados.map((a) => {
      const t = lerArquivo(arquivo, bytes, a.aba, a.linhaCab, x);
      return { tipo: a.tipo, nome: NOMES_BASE[a.tipo], aba: a.aba, colunas: t.colunas, linhas: t.linhas.length, partes: emPartes(t) };
    });
    const tiposOrdem = x && bases.some((b) => b.tipo === "equipe") ? tiposDaGestao(x) : undefined;
    return { arquivo, bases, ...(tiposOrdem && Object.keys(tiposOrdem).length ? { tiposOrdem } : {}) };
  } catch (e) {
    return { arquivo, bases: [], erro: e instanceof LeituraErro ? e.message : `falha ao ler: ${(e as Error).message}` };
  }
}
