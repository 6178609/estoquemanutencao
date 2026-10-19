import { normalizarBusca } from "@/lib/dados/texto";

import { aplicarPecas, limparCodigos, semZeros } from "./logica";

/**
 * Alocação automática de materiais aos ativos pelo texto: a descrição de cada material (curta + Descr Completa do
 * Sysmat, com o campo APLICAÇÃO) contra o nome, o código, o campo de ordenação, o fabricante e o modelo de cada ativo.
 * Não há ligação material × ordem nas bases do SAP usadas aqui, então é sugestão por evidência no texto, com nível:
 * - alta: o material cita o código/campo do ativo; a APLICAÇÃO bate com o nome do ativo (com o número dele, até 3
 *   ativos); ou cita fabricante + modelo do ativo (até 5 ativos com esse modelo);
 * - média: a APLICAÇÃO cita o tipo de equipamento (ex.: "PRENSA HIDRAULICA") sem o número — vale para todos desse tipo;
 *   ou cita o modelo do ativo (até 30 ativos);
 * - baixa: a descrição cita o tipo do equipamento (ex.: "ROLAMENTO P/ COMPRESSOR") e há poucos ativos desse tipo.
 * Material genérico (parafuso, EPI…) não casa com nada e fica sem ativo. Testado em testes/alocacao.test.ts.
 */
export type Nivel = "alta" | "media" | "baixa";
export const NIVEIS: Nivel[] = ["alta", "media", "baixa"];
export const ROTULO_NIVEL: Record<Nivel, string> = { alta: "Confiança alta", media: "Confiança média", baixa: "Confiança baixa" };

export interface AtivoTexto { codigo: string; nome: string; campo?: string; fabricante?: string; modelo?: string; desativado?: boolean }
export interface MaterialTexto { codigo: string; descricao: string; descrCompleta: string }
export interface Sugestao { ativo: string; material: string; descricao: string; nivel: Nivel; pontos: number; motivo: string }

const PARADAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "PARA", "P", "PL", "COM", "EM", "A", "O", "AS", "OS", "NO", "NA", "TIPO",
  "MOD", "MODELO", "LINHA", "MAQUINA", "MAQ", "EQUIP", "EQUIPAMENTO", "GERAL", "UNIDADE", "CONJUNTO", "CJ", "SET", "NR", "N", "NUM"]);
/** "não se aplica", "vários", "*****"… não dizem a aplicação. */
const APLICACAO_VAZIA = /^(\**|-+|N\/?A|NAO SE APLICA|NAO APLICAVEL|VARIAS?|VARIOS|DIVERS[OA]S?|GERAL|DIVERSAS APLICACOES|UNIVERSAL)$/;

/** Palavras significativas em maiúsculas sem acento; números sem zeros à esquerda ("01" → "1"). */
export function palavras(t: string): string[] {
  return normalizarBusca(t).split(/[^A-Z0-9]+/).filter(Boolean)
    .map((p) => (/^\d+$/.test(p) ? String(Number(p)) : p))
    .filter((p) => !PARADAS.has(p) && (p.length >= 2 || /^\d$/.test(p)));
}
const numero = (p: string) => /^\d+$/.test(p);

/** O texto do campo APLICAÇÃO da Descr Completa (vazio quando não diz nada). */
export function aplicacaoDe(descrCompleta: string): string {
  const m = normalizarBusca(descrCompleta).match(/APLICACAO\s*:\s*([^;.]*)/);
  const v = (m?.[1] ?? "").trim();
  return APLICACAO_VAZIA.test(v) ? "" : v;
}

interface Indice { ativo: AtivoTexto; nomePal: string[]; nomeNum: Set<string>; tipo: string; modelo: string[]; fabricante: string[] }

const PONTOS: Record<Nivel, number> = { alta: 90, media: 65, baixa: 40 };
const MAX_BAIXA = 10; // tipo citado na descrição só sugere quando há poucos ativos desse tipo
const MAX_MEDIA = 30; // aplicação sem número / só o modelo: acima disso é genérico demais para sugerir
const MAX_ALTA_MODELO = 5; // fabricante + modelo: alta só quando poucos ativos têm esse modelo
const MAX_ALTA_APLICACAO = 3; // aplicação com número que casa com mais ativos que isso (ex.: "01" de vários tipos) vira média

const TOKENS = /[A-Z0-9][A-Z0-9._/-]*[A-Z0-9]/g;
const letraEDigito = (t: string) => /[A-Z]/.test(t) && /\d/.test(t);
const compacto = (t: string) => t.replace(/[^A-Z0-9]/g, "");
/** Referências do fabricante, CA, NCM… são números do material, não do equipamento: saem antes de procurar o código. */
const REFERENCIAS = /\b(?:REF(?:ERENCIA)?|P\/?N|PART\s*NUMBER|CA|NCM|COD(?:IGO)?\s*FAB\w*|SAP|SYSMAT)\b\s*[:.#-]?\s*[A-Z0-9][A-Z0-9._/-]*/g;

/** Código do equipamento citável: só número com 7+ dígitos, ou letras e números juntos (5+). */
const codigoCitavel = (k: string) => (/^\d+$/.test(k) ? k.length >= 7 : k.length >= 5 && letraEDigito(k));

/** Chaves do modelo do ativo: cada parte com letra e número (ex.: "PH300", "IR-900" → "IR900") e o modelo inteiro sem espaços. */
function chavesModelo(modelo: string, nome: string[]): string[] {
  const m = normalizarBusca(modelo);
  const ks = new Set((m.match(TOKENS) ?? []).map(compacto));
  ks.add(compacto(m));
  return [...ks].filter((k) => k.length >= 3 && k.length <= 20 && letraEDigito(k) && !nome.includes(k));
}

export function sugerirAlocacoes(ativos: AtivoTexto[], materiais: MaterialTexto[], jaVinculados: (ativo: string) => Set<string> = () => new Set()):
  Sugestao[] {
  const idx: Indice[] = ativos.filter((a) => !a.desativado && a.codigo).map((a) => {
    const nome = palavras(a.nome);
    return { ativo: a, nomePal: nome.filter((p) => !numero(p)), nomeNum: new Set(nome.filter(numero)), tipo: nome.find((p) => !numero(p) && p.length >= 4) ?? "",
      modelo: chavesModelo(a.modelo ?? "", nome), fabricante: palavras(a.fabricante ?? "").filter((p) => p.length >= 3) };
  });
  // palavra do nome → ativos (para não comparar todo material com todo ativo)
  const porPalavra = new Map<string, Indice[]>();
  for (const i of idx) for (const p of new Set(i.nomePal)) (porPalavra.get(p) ?? porPalavra.set(p, []).get(p)!).push(i);
  const porCodigo = new Map<string, Indice>();
  for (const i of idx) {
    const cod = compacto(normalizarBusca(i.ativo.codigo)), campo = compacto(normalizarBusca(i.ativo.campo ?? ""));
    if (codigoCitavel(cod)) porCodigo.set(cod, i);
    if (campo.length >= 5 && letraEDigito(campo)) porCodigo.set(campo, i); // campo só número ("0101") casaria com qualquer medida
  }
  const porModelo = new Map<string, Indice[]>();
  for (const i of idx) for (const p of i.modelo) (porModelo.get(p) ?? porModelo.set(p, []).get(p)!).push(i);
  const porTipo = new Map<string, Indice[]>();
  for (const i of idx) if (i.tipo) (porTipo.get(i.tipo) ?? porTipo.set(i.tipo, []).get(i.tipo)!).push(i);

  // o que já está vinculado, sem zeros à esquerda (o MB52 e o Sysmat escrevem o mesmo código de jeitos diferentes)
  const vinc = new Map<string, Set<string>>();
  const jaTem = (ativo: string, m: string) => {
    let v = vinc.get(ativo);
    if (!v) vinc.set(ativo, (v = new Set([...jaVinculados(ativo)].map((x) => semZeros(String(x))))));
    return v.has(m);
  };
  const melhor = new Map<string, Sugestao>();
  const propor = (i: Indice, m: MaterialTexto, nivel: Nivel, motivo: string) => {
    const cod = semZeros(m.codigo);
    if (jaTem(i.ativo.codigo, cod)) return;
    const k = `${i.ativo.codigo}\u0000${cod}`;
    const atual = melhor.get(k);
    if (!atual || PONTOS[nivel] > atual.pontos) melhor.set(k, { ativo: i.ativo.codigo, material: cod, descricao: m.descricao, nivel, pontos: PONTOS[nivel], motivo });
  };

  for (const m of materiais) {
    const texto = normalizarBusca(`${m.descricao} ${m.descrCompleta}`);
    const tokens = (texto.match(TOKENS) ?? []).map(compacto);
    const pal = new Set([...palavras(texto), ...tokens]);
    // 1) cita o código ou o campo de ordenação do ativo (fora das referências do fabricante, CA, NCM…)
    for (const t of new Set((texto.replace(REFERENCIAS, " ").match(TOKENS) ?? []).map(compacto))) {
      const i = porCodigo.get(t);
      if (i) propor(i, m, "alta", `cita o equipamento ${i.ativo.campo || i.ativo.codigo}`);
    }
    // 2) APLICAÇÃO do Sysmat
    const ap = aplicacaoDe(m.descrCompleta);
    if (ap) {
      const apPal = palavras(ap), apTexto = apPal.filter((p) => !numero(p)), apNum = apPal.filter(numero);
      if (apTexto.length) {
        const cands = (porPalavra.get(apTexto[0]) ?? []).filter((i) => apTexto.every((p) => i.nomePal.includes(p)));
        if (apNum.length) {
          const comNum = cands.filter((i) => apNum.some((n) => i.nomeNum.has(n)));
          const nivel: Nivel = comNum.length <= MAX_ALTA_APLICACAO ? "alta" : "media";
          if (comNum.length <= MAX_MEDIA) for (const i of comNum) propor(i, m, nivel, `aplicação "${ap}" = ${i.ativo.nome}`);
        } else if (cands.length <= MAX_MEDIA) {
          for (const i of cands) propor(i, m, "media", `aplicação "${ap}" (os ${cands.length} ativo(s) desse tipo)`);
        }
      }
      for (const p of new Set((ap.match(TOKENS) ?? []).map(compacto))) {
        const xs = porModelo.get(p) ?? [];
        if (xs.length <= MAX_MEDIA) for (const i of xs) propor(i, m, "media", `aplicação cita o modelo ${i.ativo.modelo}`);
      }
    }
    // 3) modelo do ativo no texto do material (com o fabricante e poucos ativos desse modelo: alta)
    for (const p of pal) {
      const xs = porModelo.get(p) ?? [];
      if (xs.length > MAX_MEDIA) continue;
      for (const i of xs) {
        if (xs.length <= MAX_ALTA_MODELO && i.fabricante.length && i.fabricante.every((f) => pal.has(f)))
          propor(i, m, "alta", `fabricante e modelo do ativo (${i.ativo.fabricante} ${i.ativo.modelo})`);
        else propor(i, m, "media", `cita o modelo do ativo (${i.ativo.modelo})`);
      }
    }
    // 4) só o tipo do equipamento na descrição (ex.: "ROLAMENTO P/ COMPRESSOR"), quando há poucos desse tipo
    for (const p of palavras(m.descricao)) {
      const xs = porTipo.get(p);
      if (xs && xs.length <= MAX_BAIXA) for (const i of xs) propor(i, m, "baixa", `a descrição cita "${p.toLowerCase()}"`);
    }
  }
  return [...melhor.values()].sort((a, b) => b.pontos - a.pontos || a.ativo.localeCompare(b.ativo) || a.material.localeCompare(b.material));
}

/** Agrupa por ativo (para gravar de uma vez): ativo → materiais novos. */
export function porAtivo(s: Sugestao[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const x of s) (m.get(x.ativo) ?? m.set(x.ativo, []).get(x.ativo)!).push(x.material);
  return m;
}

/**
 * O item do ativo com as peças novas (sobre o item relido na gravação) e quais entraram de fato: as que já estavam
 * (mesmo com zeros à esquerda) não contam, e as que passam do limite de peças do ativo ficam de fora.
 */
export function incluirPecas(atual: Record<string, unknown> | undefined, mats: string[]):
  { item: Record<string, unknown> | null | undefined; incluidos: string[]; foraDoLimite: number } {
  const antes = limparCodigos(atual?.materiais), tem = new Set(antes.map(semZeros));
  const novos = [...new Set(mats)].filter((m) => !tem.has(semZeros(m)));
  if (!novos.length) return { item: undefined, incluidos: [], foraDoLimite: 0 }; // nada muda: não regrava o item
  const item = aplicarPecas(atual, novos, []);
  const depois = new Set(limparCodigos(item?.materiais));
  const incluidos = novos.filter((m) => depois.has(m));
  return { item, incluidos, foraDoLimite: novos.length - incluidos.length };
}
