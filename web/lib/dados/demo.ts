/**
 * Modo demonstração: dados FICTÍCIOS gerados aqui, usados quando o site não tem fonte de dados configurada
 * (ex.: o primeiro deploy na Vercel antes de colocar o token). Nada aqui é dado da empresa.
 */
import { chaveMes } from "../wcm/orcamento";
import { hoje, inicioDoMes, somarMeses } from "../wcm/util";
import type { ItemCatalogo, ItemEstoque } from "./materiais";

function gerador(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const FAMILIAS: { pdm: string; cat: string; sub: string; um: string; attrs: (r: () => number) => string[]; fabs: string[] }[] = [
  { pdm: "ROLAMENTO", cat: "COMPONENTES", sub: "ROLAMENTOS E MANCAIS", um: "UN", fabs: ["SKF", "FAG", "NSK", "TIMKEN"],
    attrs: (r) => { const d = [15, 20, 25, 30, 35, 40][Math.floor(r() * 6)]; return ["ROLAMENTO RIGIDO ESFERAS", "CARREIRAS: UMA CARREIRA", `DIAMETRO INTERNO: ${d},00 MM`, `DIAMETRO EXTERNO: ${d * 2 + 2},00 MM`, `LARGURA: ${Math.round(d / 2 + 3)},00 MM`, `VEDACAO: ${r() > 0.5 ? "DUPLA" : "SEM VEDACAO"}`]; } },
  { pdm: "CORREIA", cat: "COMPONENTES", sub: "TRANSMISSAO", um: "UN", fabs: ["GATES", "CONTINENTAL", "OPTIBELT"],
    attrs: (r) => [`CORREIA EM V`, `PERFIL: ${["A", "B", "C", "SPZ"][Math.floor(r() * 4)]}`, `COMPRIMENTO: ${800 + Math.floor(r() * 30) * 50} MM`, "MATERIAL: BORRACHA"] },
  { pdm: "CONTATOR", cat: "ELETRICA", sub: "COMANDO E PROTECAO", um: "UN", fabs: ["WEG", "SIEMENS", "SCHNEIDER"],
    attrs: (r) => ["CONTATOR TRIPOLAR", `CORRENTE NOMINAL: ${[9, 12, 18, 25, 32][Math.floor(r() * 5)]} A`, `TENSAO BOBINA: ${r() > 0.5 ? "220" : "24"} V`, "CONTATOS AUXILIARES: 1NA+1NF"] },
  { pdm: "PARAFUSO", cat: "FIXACAO", sub: "PARAFUSOS", um: "PC", fabs: ["CISER", "BELENUS"],
    attrs: (r) => { const m = [5, 6, 8, 10, 12][Math.floor(r() * 5)]; return ["PARAFUSO SEXTAVADO", `ROSCA: M${m}`, `COMPRIMENTO: ${m * 4} MM`, "CLASSE: 8.8", `ACABAMENTO: ${r() > 0.5 ? "ZINCADO" : "GALVANIZADO"}`]; } },
  { pdm: "SENSOR", cat: "MEDICAO E CONTROLE", sub: "SENSORES", um: "UN", fabs: ["SICK", "IFM", "BALLUFF"],
    attrs: (r) => [`SENSOR ${r() > 0.5 ? "INDUTIVO" : "CAPACITIVO"}`, `DISTANCIA SENSORA: ${[2, 4, 8, 15][Math.floor(r() * 4)]} MM`, "SAIDA: PNP NA", "CONEXAO: CONECTOR M12", "TENSAO: 10-30 VCC"] },
  { pdm: "VALVULA", cat: "HIDRAULICA, PNEUMATICA E ACIONAMENTOS", sub: "VALVULAS", um: "UN", fabs: ["FESTO", "SMC", "PARKER"],
    attrs: (r) => ["VALVULA SOLENOIDE", `VIAS: ${r() > 0.5 ? "5/2" : "3/2"}`, `ROSCA: ${["1/8", "1/4", "3/8"][Math.floor(r() * 3)]} BSP`, "TENSAO: 24 VCC"] },
  { pdm: "RETENTOR", cat: "VEDACAO", sub: "RETENTORES", um: "UN", fabs: ["SABO", "VEDABRAS"],
    attrs: (r) => { const d = 20 + Math.floor(r() * 12) * 5; return ["RETENTOR", `DIAMETRO INTERNO: ${d} MM`, `DIAMETRO EXTERNO: ${d + 15} MM`, "MATERIAL: NBR"]; } },
  { pdm: "LUVA", cat: "SEGURANCA PESSOAL E PATRIMONIAL", sub: "EPI", um: "PAR", fabs: ["DANNY", "VOLK"],
    attrs: (r) => ["LUVA DE SEGURANCA", `MATERIAL: ${r() > 0.5 ? "VAQUETA" : "NITRILICA"}`, `TAMANHO: ${["P", "M", "G", "GG"][Math.floor(r() * 4)]}`, "CA: 00000"] },
];
/** Os tipos de equipamento da demonstração (lib/wcm/demo.ts), como apareceriam na APLICAÇÃO do Sysmat. */
const APLICACOES = ["PRENSA HIDRAULICA", "INJETORA", "ESTEIRA DE MONTAGEM", "COMPRESSOR", "CALDEIRA", "MAQUINA DE CORTE",
  "ROBO DE COLA", "FORNO DE VULCANIZACAO", "TORRE DE RESFRIAMENTO", "BOMBA DE RECALQUE"];
const STATUS = ["APROVADO", "APROVADO", "APROVADO", "APROVADO", "BLOQUEADO", "CANCELADO", "DUPLICADO"];

let memo: { estoque: ItemEstoque[]; catalogo: ItemCatalogo[] } | null = null;

export function dadosDemo() {
  if (memo) return memo;
  const r = gerador(26);
  const catalogo: ItemCatalogo[] = [];
  for (let i = 0; i < 2400; i++) {
    const f = FAMILIAS[Math.floor(r() * FAMILIAS.length)];
    const fab = f.fabs[Math.floor(r() * f.fabs.length)];
    const ref = `${f.pdm.slice(0, 2)}-${Math.floor(r() * 9000 + 1000)}`;
    // APLICAÇÃO (como no Sysmat): parte cita o equipamento com o número, parte só o tipo, o resto não diz ("*****")
    const tipo = APLICACOES[Math.floor(r() * APLICACOES.length)], sorte = r();
    const aplicacao = sorte < 0.15 ? `${tipo} ${String(1 + Math.floor(r() * 5)).padStart(2, "0")}` : sorte < 0.3 ? tipo : "*****";
    const attrs = [...f.attrs(r), `APLICACAO: ${aplicacao}`, `FAB: ${fab} - REF: ${ref}`];
    const material = String(900000 + i * 7);
    catalogo.push({
      material, sysmat: String(30000000 + i), substituto: "", ncm: String(84000000 + Math.floor(r() * 99999)),
      um: f.um, categoria: f.cat, subcategoria: f.sub, pdm: f.pdm, descricaoCurta: `${attrs[0].slice(0, 22)} ${ref}`,
      descrCompleta: attrs.join("; ") + ".", fabricanteRef: `${fab} ${ref}`,
      status: i % 9 === 0 ? STATUS[Math.floor(r() * STATUS.length)] : "APROVADO",
    });
  }
  const estoque: ItemEstoque[] = [];
  for (let i = 0; i < 640; i++) {
    const c = catalogo[Math.floor(r() * catalogo.length)];
    if (estoque.some((e) => e.material === c.material)) continue;
    const q = r() < 0.08 ? 0 : Math.floor(r() * 60);
    estoque.push({ material: c.material, descricao: c.descricaoCurta, um: c.um, estoque: q,
      valor: Math.round(q * (5 + r() * 400) * 100) / 100, depositos: r() > 0.3 ? "MA01" : "MA01, MA02" });
  }
  for (let i = 0; i < 40; i++) {
    estoque.push({ material: String(500000 + i * 13), descricao: `ITEM SEM CADASTRO ${i + 1}`, um: "UN",
      estoque: Math.floor(r() * 10), valor: 0, depositos: "MA01" });
  }
  memo = { estoque, catalogo };
  return memo;
}

// cadastros da demonstração ficam só na memória do servidor
// (em globalThis: as rotas de API e as páginas podem ter cópias separadas deste módulo no mesmo processo)
/** Orçamento fictício: de 3 meses atrás até 2 meses à frente do mês de hoje, valores redondos que variam por mês. */
const VALORES_DEMO = [280000, 300000, 320000, 300000, 300000, 300000]; // deslocamentos -3 a +2
export function orcamentoDemo(h: number): Record<string, Record<string, unknown>> {
  const inicio = inicioDoMes(h);
  const out: Record<string, Record<string, unknown>> = {};
  VALORES_DEMO.forEach((valor, i) => { out[`orcamento:${chaveMes(somarMeses(inicio, i - 3))}`] = { valor }; });
  return out;
}

const globalDemo = globalThis as unknown as { __cmCadastrosDemo?: Map<string, Record<string, Record<string, unknown>>> };
const cadastrosDemo = (globalDemo.__cmCadastrosDemo ??= new Map<string, Record<string, Record<string, unknown>>>([
  ["cadastro_materiais.json", {}],
  ["cadastro_equipamentos.json", { "PRENSA-01": { nome: "Prensa hidráulica 1", criticidade: "Alta", materiais: [] } }],
  ["metas_wcm.json", orcamentoDemo(hoje())],
  ["tipos_ordem.json", { YM01: { descricao: "Preventiva" }, YM03: { descricao: "Preditiva / inspeção" },
    YM11: { descricao: "Corretiva Emergencial" }, YM12: { descricao: "Corretiva programada" }, YM13: { descricao: "Melhoria" } }],
]));

export function lerJsonDemo(nome: string) {
  return structuredClone(cadastrosDemo.get(nome) || {});
}

export function gravarJsonDemo(nome: string, itens: Record<string, Record<string, unknown> | null |
  ((atual: Record<string, unknown> | undefined) => Record<string, unknown> | null | undefined)>, usuario: string, mesclar: boolean) {
  const atual = cadastrosDemo.get(nome) || {};
  const agora = new Date().toISOString();
  for (const [k, v] of Object.entries(itens)) {
    let dados: Record<string, unknown> | null | undefined;
    if (typeof v === "function") {
      dados = v(atual[k] ? { ...atual[k] } : undefined);
      if (dados === undefined) continue;
    } else dados = v;
    if (dados && mesclar && typeof v !== "function") {
      const junto = Object.fromEntries(Object.entries({ ...(atual[k] || {}), ...dados })
        .filter(([c, x]) => x !== null && x !== undefined && c !== "atualizado_em" && c !== "atualizado_por"));
      dados = Object.keys(junto).length ? junto : null;
    }
    if (!dados) delete atual[k];
    else atual[k] = { ...dados, atualizado_em: agora, atualizado_por: usuario };
  }
  cadastrosDemo.set(nome, atual);
}
