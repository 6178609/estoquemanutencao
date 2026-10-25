/**
 * Contas e filtros da aba Manuais (sem acesso a dados: a página e os testes passam as listas).
 * "Equipamento" aqui é a linha da Gestão de ativos já sem os desativados.
 */
import { casaBusca, normalizarBusca } from "@/lib/dados/texto";

export interface EquipamentoManual { codigo: string; nome: string; campo: string; area: string }
/** Um vínculo: o documento (manual ou link) ligado a um equipamento. */
interface VinculoManual {
  tag: string;
  doc: { id: string; titulo: string; tipo: string; url?: string; origem?: { tag: string; id: string } };
}
export type TipoManual = "pdf" | "imagem" | "link";
const TAMANHO_PAGINA = 50;

/** Números do topo: vínculos, equipamentos com e sem manual e a cobertura (0–100, inteiro). */
export function resumoManuais(ativos: { codigo: string }[], vinculos: { tag: string }[]) {
  const comVinculo = new Set(vinculos.map((v) => v.tag));
  const comManual = ativos.filter((a) => comVinculo.has(a.codigo)).length;
  return {
    vinculos: vinculos.length,
    comManual,
    semManual: ativos.length - comManual,
    cobertura: ativos.length ? Math.round((comManual * 100) / ativos.length) : 0,
  };
}

/** Equipamentos sem nenhum manual, por código (com filtro de área, quando informada). */
export function equipamentosSemManual<E extends { codigo: string; area: string }>(ativos: E[], vinculos: { tag: string }[], area = ""): E[] {
  const comVinculo = new Set(vinculos.map((v) => v.tag));
  return ativos
    .filter((a) => !comVinculo.has(a.codigo) && (!area || a.area === area))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
}

interface FiltrosManuais { q?: string; tipo?: TipoManual; area?: string }

/** Busca (equipamento ou título, sem acento e sem maiúscula), tipo e área do equipamento. */
export function filtrarManuais<V extends VinculoManual>(vinculos: V[], f: FiltrosManuais, ativos: EquipamentoManual[]): V[] {
  const porCodigo = new Map(ativos.map((a) => [a.codigo, a]));
  const busca = f.q?.trim() ? f.q : "";
  return vinculos.filter((v) => {
    const eq = porCodigo.get(v.tag);
    if (f.area && eq?.area !== f.area) return false;
    if (f.tipo === "link" && v.doc.tipo !== "link") return false;
    if (f.tipo === "pdf" && v.doc.tipo !== "application/pdf") return false;
    if (f.tipo === "imagem" && !v.doc.tipo.startsWith("image/")) return false;
    if (busca) return casaBusca(normalizarBusca([v.tag, eq?.campo, eq?.nome, v.doc.titulo].filter(Boolean).join(" ")), busca);
    return true;
  });
}

/** Uma página (50 por vez); a página pedida fora da faixa cai na mais próxima. */
export function paginar<T>(itens: T[], pedida: number, tamanho = TAMANHO_PAGINA) {
  const paginas = Math.max(1, Math.ceil(itens.length / tamanho));
  const pag = Math.min(Math.max(1, Math.floor(Number(pedida)) || 1), paginas);
  const inicio = (pag - 1) * tamanho;
  return { pag, paginas, total: itens.length, inicio, itens: itens.slice(inicio, inicio + tamanho) };
}
