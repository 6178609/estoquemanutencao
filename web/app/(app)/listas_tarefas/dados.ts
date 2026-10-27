import "server-only";

import { lerCadastro } from "@/lib/dados/cadastros";
import { ARQ_DOCUMENTOS } from "@/lib/dados/documentos";
import { listasTarefas } from "@/lib/dados/listasTarefas";
import type { Contexto } from "@/lib/wcm/contexto";
import { chaveLista, equipamentosPorLista, type EquipLista, type ListaLT } from "@/lib/wcm/listasTarefas";

import { guardar } from "../saude/calculo";

/** Um documento da biblioteca de um equipamento (o que a ficha precisa para mostrar e abrir). */
export interface DocEquip { tag: string; id: string; titulo: string; tipo: string; url?: string }

export interface DadosListas {
  listas: ListaLT[];
  atualizado: string | null;
  erro?: string;
  /** equipamentos de cada lista (IP19 + ordens do IW38) */
  equipamentos: Map<string, EquipLista[]>;
  /** nome de cada equipamento do IH08 e o superior dele */
  nome: (tag: string) => string;
  superiores: (tag: string) => string[];
  /** documentos da biblioteca de cada equipamento */
  documentos: (tag: string) => DocEquip[];
}

/** Listas de tarefas com os vínculos de cada uma (equipamentos, superiores, documentos). */
export async function dadosListas(c: Contexto): Promise<DadosListas> {
  const [base, cadDocs] = await Promise.all([listasTarefas(), lerCadastro(ARQ_DOCUMENTOS)]);
  const ordens = c.b.ordens.dados ?? [], ip19 = c.b.cruas.ip19, eqs = c.b.equipamentos;
  const equipamentos = guardar(`lt-eq|${ip19.atualizado}:${ip19.dados?.length ?? -1}|${c.b.ordens.atualizado}:${ordens.length}`,
    () => equipamentosPorLista(ip19.dados, ordens.map((o) => ({ equipChave: o.equipChave, plano: o.plano }))));
  const porCodigo = guardar(`lt-ih|${eqs.atualizado}:${eqs.dados?.length ?? -1}`,
    () => new Map((eqs.dados ?? []).map((e) => [e.equipamento, { nome: e.denominacao, superior: e.superior }])));
  const superiores = (tag: string) => {
    const out: string[] = [];
    for (let s = porCodigo.get(tag)?.superior, n = 0; s && n < 4 && !out.includes(s); n++) { out.push(s); s = porCodigo.get(s)?.superior; }
    return out;
  };
  const documentos = (tag: string): DocEquip[] => {
    const d = (cadDocs[tag] as { documentos?: unknown } | undefined)?.documentos;
    if (!Array.isArray(d)) return [];
    return d.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string")
      .map((x) => ({ tag, id: String(x.id), titulo: String(x.titulo ?? x.nome ?? "Documento"), tipo: String(x.tipo ?? ""),
        url: typeof x.url === "string" ? x.url : undefined }));
  };
  return { listas: base.dados ?? [], atualizado: base.atualizado, erro: base.erro, equipamentos,
    nome: (t) => porCodigo.get(t)?.nome ?? "", superiores, documentos };
}

/** A lista pelo grupo e numerador do endereço. */
export function acharLista(d: DadosListas, grupo: string, numerador: string): ListaLT | undefined {
  const k = chaveLista(grupo, numerador);
  return d.listas.find((l) => l.chave === k);
}

/** Documentos dos equipamentos da lista e dos superiores deles (a máquina costuma ter o manual inteiro), sem repetir. */
export function documentosDaLista(d: DadosListas, eqs: EquipLista[]): DocEquip[] {
  const tags = [...new Set(eqs.flatMap((e) => [e.equipamento, ...d.superiores(e.equipamento)]))];
  const vistos = new Set<string>();
  return tags.flatMap((t) => d.documentos(t)).filter((x) => {
    const k = `${x.titulo}|${x.tipo}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
}
