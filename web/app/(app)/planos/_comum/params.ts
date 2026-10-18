import { deIsoDia, paraIso } from "@/lib/wcm/filtros";
import { dia, inicioDoMes, partes, somarMeses, type Dia } from "@/lib/wcm/util";

/** Leitura dos parâmetros próprios das abas de programação (o que os <Controles> gravam no endereço). */
export type Params = Record<string, string | string[] | undefined>;

export const um = (p: Params, k: string): string => {
  const v = p[k];
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
};
export const lista = (p: Params, k: string): string[] => um(p, k).split(",").map((x) => x.trim()).filter(Boolean).slice(0, 80);
export const ligado = (p: Params, k: string) => um(p, k) === "1";
export const diaDe = (p: Params, k: string): Dia | null => deIsoDia(um(p, k));
export const iso = paraIso;

export const fimDoMes = (d: Dia): Dia => somarMeses(inicioDoMes(d), 1) - 1;
export const segundaDe = (d: Dia): Dia => d - ((partes(d).semana + 6) % 7);
export const domingoDe = (d: Dia): Dia => d - partes(d).semana;

/** Período (de, até) dos parâmetros, com o padrão quando faltam; sempre em ordem. */
export function periodo(p: Params, de: string, ate: string, padrao: [Dia, Dia]): [Dia, Dia] {
  let a = diaDe(p, de) ?? padrao[0], b = diaDe(p, ate) ?? padrao[1];
  if (b < a) [a, b] = [b, a];
  return [a, b];
}

type Atalho = { rotulo: string; de: string; ate: string };
const at = (rotulo: string, a: Dia, b: Dia): Atalho => ({ rotulo, de: iso(a), ate: iso(b) });

/** Atalhos de período usados nas abas. */
export function atalhos(hoje: Dia, quais: string[], minimo?: Dia | null, maximo?: Dia | null): Atalho[] {
  const mes = inicioDoMes(hoje), seg = segundaDe(hoje), dom = domingoDe(hoje);
  const todos: Record<string, () => Atalho> = {
    "Este mês": () => at("Este mês", mes, fimDoMes(mes)),
    "Mês passado": () => at("Mês passado", somarMeses(mes, -1), mes - 1),
    "Próximo mês": () => at("Próximo mês", somarMeses(mes, 1), fimDoMes(somarMeses(mes, 1))),
    "Próximos 90 dias": () => at("Próximos 90 dias", hoje, hoje + 90),
    "Ano atual": () => at("Ano atual", dia(partes(hoje).ano, 1, 1)!, dia(partes(hoje).ano, 12, 31)!),
    Tudo: () => at("Tudo", minimo ?? somarMeses(mes, -24), Math.max(maximo ?? hoje, hoje)),
    // semanas do calendário de ordens: domingo → sábado
    "Esta semana": () => at("Esta semana", dom, dom + 6),
    "Próxima semana": () => at("Próxima semana", dom + 7, dom + 13),
    "Semana passada": () => at("Semana passada", dom - 7, dom - 1),
    // programação do mês: semanas de segunda a domingo
    "Esta semana (seg–dom)": () => at("Esta semana", seg, seg + 6),
    "Próxima semana (seg–dom)": () => at("Próxima semana", seg + 7, seg + 13),
  };
  return quais.filter((q) => todos[q]).map((q) => todos[q]());
}

/** Contagem de valores (para as opções dos filtros: mais frequentes primeiro). */
export function contagem(valores: Iterable<string>): { valor: string; n: number }[] {
  const m = new Map<string, number>();
  for (const v of valores) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([valor, n]) => ({ valor, n }));
}

/** Endereço com os parâmetros atuais trocados (para links de linha, abas e "fechar"). */
export function hrefCom(p: Params, mudar: Record<string, string | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v == null || k in mudar) continue;
    for (const x of Array.isArray(v) ? v : [v]) u.append(k, x);
  }
  for (const [k, v] of Object.entries(mudar)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : "?";
}
