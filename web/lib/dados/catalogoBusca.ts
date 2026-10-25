import "server-only";

import { type FotoExterna, fotosDoCadastro } from "../fotoMaterial";
import { catalogo, estoque } from "./bases";
import { lerCadastro } from "./cadastros";
import { fotosExternasDoItem } from "./fotosExternas";
import { ARQUIVO_REFERENCIA } from "./fotosReferencia";
import { ARQUIVO_TIPOS } from "./fotosTipo";
import { ATIVOS, INATIVOS, type ItemCatalogo } from "./materiais";
import { casaBusca, normalizarBusca } from "./texto";

interface FiltroCatalogo {
  q: string;
  status: string[];
  categorias: string[];
  onde: "todos" | "almox" | "fora";
  cursor: number;
  limite: number;
}

export interface ItemCatalogoTela extends ItemCatalogo {
  noAlmox: boolean;
  estoque: number | null;
  /** Foto própria (a principal do cadastro de materiais), a do fabricante e a ilustrativa do tipo. */
  foto: string | null;
  fotoRef: FotoExterna | null;
  fotoTipo: FotoExterna | null;
}

interface Indice {
  chave: string;
  itens: ItemCatalogoTela[];
  busca: string[];
  resumo: { total: number; ativos: number; aprovados: number; inativos: number; noAlmox: number;
    status: [string, number][]; categorias: string[] };
}

let indice: Indice | null = null;
const semZeros = (c: string) => c.replace(/^0+/, "");

async function montar(): Promise<Indice | null> {
  const [cat, est] = await Promise.all([catalogo(), estoque()]);
  if (!cat.dados) return null;
  const chave = `${cat.atualizado}|${cat.dados.length}|${est.atualizado}|${est.dados?.length ?? 0}`;
  if (indice?.chave === chave) return indice;
  const saldo = new Map<string, number>();
  for (const e of est.dados || []) saldo.set(semZeros(e.material), (saldo.get(semZeros(e.material)) || 0) + e.estoque);
  const itens: ItemCatalogoTela[] = cat.dados.map((c) => {
    const s = c.material ? saldo.get(semZeros(c.material)) : undefined;
    return { ...c, noAlmox: s !== undefined, estoque: s ?? null, foto: null, fotoRef: null, fotoTipo: null };
  });
  // no almoxarifado primeiro, depois pela descrição
  itens.sort((a, b) => Number(b.noAlmox) - Number(a.noAlmox) || a.descricaoCurta.localeCompare(b.descricaoCurta, "pt-BR"));
  const busca = itens.map((c) => normalizarBusca(
    [c.material, c.sysmat, c.ncm, c.descricaoCurta, c.pdm, c.fabricanteRef, c.descrCompleta].join(" ")));
  const contagem = new Map<string, number>();
  for (const c of itens) contagem.set(c.status, (contagem.get(c.status) || 0) + 1);
  const ordem = [...ATIVOS, ...INATIVOS];
  const status = [...contagem.entries()].filter(([s]) => s)
    .sort((a, b) => (ordem.indexOf(a[0]) + 1 || 99) - (ordem.indexOf(b[0]) + 1 || 99) || b[1] - a[1]);
  indice = {
    chave, itens, busca,
    resumo: {
      total: itens.length, ativos: itens.filter((c) => ATIVOS.includes(c.status)).length,
      aprovados: contagem.get("APROVADO") || 0, inativos: itens.filter((c) => INATIVOS.includes(c.status)).length,
      noAlmox: itens.filter((c) => c.noAlmox).length, status,
      categorias: [...new Set(itens.map((c) => c.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    },
  };
  return indice;
}

export async function resumoCatalogo() {
  return (await montar())?.resumo ?? null;
}

/** Uma "página" da rolagem infinita: sem limite no total, a tela pede o próximo pedaço quando chega ao fim. */
export async function buscarCatalogo(f: FiltroCatalogo) {
  const ind = await montar();
  if (!ind) return null;
  const st = new Set(f.status), cats = new Set(f.categorias);
  const achados: number[] = [];
  for (let i = 0; i < ind.itens.length; i++) {
    const c = ind.itens[i];
    if (st.size && !st.has(c.status)) continue;
    if (cats.size && !cats.has(c.categoria)) continue;
    if (f.onde === "almox" && !c.noAlmox) continue;
    if (f.onde === "fora" && c.noAlmox) continue;
    if (f.q && !casaBusca(ind.busca[i], f.q)) continue;
    achados.push(i);
  }
  // as fotos só para a página pedida (o cadastro é lido de novo a cada pedido: é barato, tem cache pela versão)
  const [cadMat, cadRef, cadTipo] = await Promise.all([lerCadastro("cadastro_materiais.json"), lerCadastro(ARQUIVO_REFERENCIA), lerCadastro(ARQUIVO_TIPOS)]);
  const fatia = achados.slice(f.cursor, f.cursor + f.limite).map((i) => {
    const c = ind.itens[i];
    // o código pode vir com zeros à esquerda no Sysmat e sem eles no MB52 (onde as fotos são gravadas)
    const codigo = Object.hasOwn(cadMat, c.material) || Object.hasOwn(cadRef, c.material) ? c.material : semZeros(c.material);
    const foto = fotosDoCadastro(cadMat[codigo] as { foto?: unknown; fotos?: unknown } | undefined)[0] ?? null;
    return { ...c, foto, ...(codigo !== c.material && { codigoFoto: codigo }), ...fotosExternasDoItem(codigo, c.pdm, cadRef, cadTipo) };
  });
  const proximo = f.cursor + f.limite < achados.length ? f.cursor + f.limite : null;
  return { itens: fatia, total: achados.length, proximo };
}
