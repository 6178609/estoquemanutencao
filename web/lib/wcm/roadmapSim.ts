import { chave } from "../dados/texto";

/**
 * Roadmap SIM: o passo previsto × realizado de cada máquina, mês a mês (export do Power BI enviado em Fontes de dados).
 * Realizado abaixo do previsto = atrasada no mês. Testado em testes/indicadoresSim.test.ts.
 */
export const MESES_ROADMAP = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export interface MaquinaRoadmap {
  fabrica: string;
  maquina: string;
  previsto: (number | null)[]; // 12 meses
  realizado: (number | null)[];
  comentario: string;
}

const num = (v: unknown): number | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function prepararRoadmap(linhas: Record<string, unknown>[]): MaquinaRoadmap[] {
  if (!linhas.length) return [];
  const porChave = new Map(Object.keys(linhas[0]).map((c) => [chave(c), c]));
  const col = (k: string) => porChave.get(k) ?? "";
  const cMaq = col("MAQUINA"), cFab = col("FABRICA"), cCom = col("COMENTARIO") || col("COMENTARIOS");
  const saida: MaquinaRoadmap[] = [];
  for (const l of linhas) {
    const maquina = String(l[cMaq] ?? "").trim();
    if (!maquina) continue;
    saida.push({
      fabrica: String(l[cFab] ?? "").trim(), maquina,
      previsto: MESES_ROADMAP.map((m) => num(l[col(`PREV ${m}`)])),
      realizado: MESES_ROADMAP.map((m) => num(l[col(`REL ${m}`)])),
      comentario: cCom ? String(l[cCom] ?? "").trim() : "",
    });
  }
  return saida;
}

/** Situação de um mês: na meta (realizado ≥ previsto), atrasada, ou sem dado (sem previsto ou sem realizado). */
export type Situacao = "ok" | "atrasada" | "sem";
export function situacao(previsto: number | null, realizado: number | null): Situacao {
  if (previsto == null || realizado == null) return "sem";
  return realizado >= previsto ? "ok" : "atrasada";
}

/** Índice (0–11) do último mês com algum realizado lançado; −1 se nenhum. */
export function ultimoMesComReal(ms: MaquinaRoadmap[]): number {
  let u = -1;
  for (const m of ms) m.realizado.forEach((v, i) => { if (v != null && i > u) u = i; });
  return u;
}

/** Família da máquina para o filtro: o nome sem o número do fim ("PAN STONE 12" → "PAN STONE"). */
export function familia(maquina: string): string {
  const base = maquina.replace(/\s*(\(.*\))?\s*$/, "");
  const semNumero = base.replace(/[\s.-]*\d+[A-Z]?$/i, "");
  // sem número no fim, a letra solta é o "número" ("LINHA B" → "LINHA")
  return (semNumero !== base ? semNumero : base.replace(/\s+[A-Z]$/i, "")).trim() || maquina;
}

export interface ResumoRoadmap { total: number; ok: number; atrasadas: number; semDado: number; passoMedio: number | null; metaFimAno: number | null }

/** Resumo do mês escolhido. */
export function resumir(ms: MaquinaRoadmap[], mes: number): ResumoRoadmap {
  const sit = ms.map((m) => situacao(m.previsto[mes], m.realizado[mes]));
  const reais = ms.map((m) => m.realizado[mes]).filter((v): v is number => v != null);
  const dez = ms.map((m) => m.previsto[11]).filter((v): v is number => v != null);
  return {
    total: ms.length, ok: sit.filter((s) => s === "ok").length, atrasadas: sit.filter((s) => s === "atrasada").length,
    semDado: sit.filter((s) => s === "sem").length,
    passoMedio: reais.length ? reais.reduce((a, b) => a + b, 0) / reais.length : null,
    metaFimAno: dez.length ? dez.reduce((a, b) => a + b, 0) / dez.length : null,
  };
}

// ----------------------------------------------------------------------------
// Comentário manual: por máquina, no cadastro `roadmap_comentarios.json` ({ "F26|MAQUINA": { comentario } }).
// Vale o manual (até alguém voltar ao da planilha); o da planilha continua guardado para comparar.
// ----------------------------------------------------------------------------
export const ARQ_COMENTARIOS = "roadmap_comentarios.json";
export const MAX_COMENTARIO = 500;
const RESERVADAS = new Set(["__proto__", "constructor", "prototype"]);

/** Chave da máquina no cadastro de comentários. */
export const chaveMaquina = (fabrica: string, maquina: string) => `${fabrica.trim()}|${maquina.trim()}`.slice(0, 160);
export const chaveValida = (k: string) => !!k.replace("|", "").trim() && k.length <= 160 && !RESERVADAS.has(k) && !/[\u0000-\u001f]/.test(k);

/** Texto limpo: uma linha, sem caracteres invisíveis, até 500 caracteres. */
export const limparComentario = (t: unknown) =>
  String(t ?? "").replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_COMENTARIO);

export interface ComentarioManual { texto: string; por: string; em: string }
export type MaquinaComComentario = MaquinaRoadmap & { comentarioPlanilha: string; manual: ComentarioManual | null };

/** O comentário que vale em cada máquina: o manual, se houver; senão, o da planilha. */
export function aplicarComentarios(ms: MaquinaRoadmap[], cad: Record<string, unknown>): MaquinaComComentario[] {
  return ms.map((m) => {
    const item = cad[chaveMaquina(m.fabrica, m.maquina)] as Record<string, unknown> | undefined;
    const texto = item && typeof item.comentario === "string" ? limparComentario(item.comentario) : null;
    const manual = texto != null ? { texto, por: String(item!.atualizado_por ?? ""), em: String(item!.atualizado_em ?? "") } : null;
    return { ...m, comentario: manual ? manual.texto : m.comentario, comentarioPlanilha: m.comentario, manual };
  });
}
