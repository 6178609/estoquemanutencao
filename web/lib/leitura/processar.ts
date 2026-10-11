import { lerArquivo, LeituraErro, sondar } from "./leitura";
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
    return { arquivo, bases };
  } catch (e) {
    return { arquivo, bases: [], erro: e instanceof LeituraErro ? e.message : `falha ao ler: ${(e as Error).message}` };
  }
}
