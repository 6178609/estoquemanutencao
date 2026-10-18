import "server-only";

import { parquetMetadata } from "hyparquet";

import { DESTINO, type Tipo } from "../leitura/tipos";
import { MANIFESTO, type InfoBase } from "./bases";
import { fonte, FonteErro } from "./fonte";

/**
 * Recebe uma base lida no navegador (já em parquet) e grava no repositório de dados. Base pequena: `bases/<BASE>.parquet`. Base grande: partes em `bases/partes/`, e o
 * manifesto só passa a apontar para elas quando a última chega (até lá, vale a versão anterior inteira).
 */
export const LIMITE_BYTES = 4_000_000;
export const MAX_PARTES = 40;

export interface Parte {
  tipo: Tipo;
  envio: string;      // identificador do envio (as partes de uma base têm o mesmo)
  parte: number;      // 1..total
  total: number;
  bytes: Uint8Array;
  arquivo: string;    // nome do export original
  aba: string | null;
  modificado: string; // data do arquivo (ISO)
  linhas: number;     // linhas da base inteira
  por: string;
}

export function caminhoParte(tipo: Tipo, envio: string, parte: number): string {
  const base = DESTINO[tipo].replace(/^bases\//, "").replace(/\.parquet$/, "");
  return `bases/partes/${base}-${envio}-${String(parte).padStart(3, "0")}.parquet`;
}

/** Confere que é um parquet de verdade e devolve quantas linhas ele tem. */
export function conferirParquet(bytes: Uint8Array): number {
  const fim = bytes.length;
  const magico = (i: number) => bytes[i] === 0x50 && bytes[i + 1] === 0x41 && bytes[i + 2] === 0x52 && bytes[i + 3] === 0x31;
  if (fim < 12 || !magico(0) || !magico(fim - 4)) throw new FonteErro("o arquivo enviado não é um parquet válido");
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + fim) as ArrayBuffer;
  return Number(parquetMetadata(buf).num_rows);
}

async function gravar(caminho: string, bytes: Uint8Array, mensagem: string) {
  const f = fonte()!;
  for (let i = 0; i < 3; i++) {
    const versao = (await f.versoes(i > 0)).get(caminho) ?? null;
    if (await f.gravarCondicional(caminho, bytes, versao, mensagem)) return;
  }
  throw new FonteErro(`${caminho} está sendo gravado por outra pessoa agora; tente de novo.`);
}

/** Junta a entrada ao manifesto lido agora e grava condicionado à versão (outra pessoa pode gravar no meio). */
async function registrar(caminho: string, entrada: InfoBase): Promise<InfoBase | undefined> {
  const f = fonte()!;
  await f.versoes(true); // a versão do manifesto tem de ser a de agora (senão a 1ª gravação sempre conflita)
  for (let i = 0; i < 5; i++) {
    const lido = await f.ler(MANIFESTO);
    const man: Record<string, InfoBase> = lido ? JSON.parse(new TextDecoder().decode(lido.bytes)) : {};
    const anterior = man[caminho];
    man[caminho] = entrada;
    const bytes = new TextEncoder().encode(JSON.stringify(man, null, 1));
    if (await f.gravarCondicional(MANIFESTO, bytes, lido?.versao ?? null, `Manifesto: ${caminho}`)) return anterior;
    await f.versoes(true);
  }
  throw new FonteErro("O manifesto das bases está sendo alterado agora; tente de novo.");
}

export async function receberParte(p: Parte): Promise<{ concluido: boolean }> {
  const f = fonte();
  if (!f) throw new FonteErro("O site está em demonstração: não há repositório de dados para gravar.");
  if (!Number.isInteger(p.total) || p.total < 1 || p.total > MAX_PARTES || !Number.isInteger(p.parte) || p.parte < 1
    || p.parte > p.total) throw new FonteErro("parte inválida");
  if (!/^[a-z0-9]{8,32}$/.test(p.envio)) throw new FonteErro("envio inválido");
  if (p.bytes.length > LIMITE_BYTES) throw new FonteErro("parte grande demais");
  conferirParquet(p.bytes);

  const destino = DESTINO[p.tipo];
  const unico = p.total === 1;
  const caminho = unico ? destino : caminhoParte(p.tipo, p.envio, p.parte);
  await gravar(caminho, p.bytes, `${p.tipo.toUpperCase()}: ${p.arquivo}${unico ? "" : ` (parte ${p.parte}/${p.total})`}`);
  if (p.parte < p.total) return { concluido: false };

  // última parte: confere que todas chegaram e só então o manifesto passa a valer
  const partes = unico ? undefined : Array.from({ length: p.total }, (_, i) => caminhoParte(p.tipo, p.envio, i + 1));
  if (partes) {
    // logo depois de gravar, a lista de arquivos do GitHub pode vir sem a última parte por alguns segundos
    let faltam = partes;
    for (let i = 0; i < 4 && faltam.length; i++) {
      if (i) await new Promise((ok) => setTimeout(ok, 1500 * i));
      const versoes = await f.versoes(true);
      faltam = partes.filter((c) => !versoes.has(c));
    }
    if (faltam.length) throw new FonteErro(`faltam ${faltam.length} parte(s) deste envio; envie o arquivo de novo`);
  }
  const anterior = await registrar(destino, {
    modificado: p.modificado, origem: p.aba ? `${p.arquivo} › ${p.aba}` : p.arquivo, linhas: p.linhas,
    enviado_em: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"), enviado_por: p.por, ...(partes ? { partes } : {}),
  });
  // as partes do envio anterior não servem mais (a cópia de segurança é o histórico do próprio repositório)
  const velhas = (anterior?.partes || []).filter((c) => !partes?.includes(c));
  if (velhas.length) {
    const versoes = await f.versoes(true);
    for (const c of velhas) {
      const v = versoes.get(c);
      if (v) await f.apagar(c, v, `Remove parte antiga ${c}`).catch(() => false);
    }
  }
  return { concluido: true };
}
