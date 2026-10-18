/**
 * Alertas da tela Início: o que pede atenção agora (ordens atrasadas, estoque, reciclagens). Função pura, sem I/O:
 * a página monta a entrada só com os blocos que a pessoa pode ver (null = sem acesso ou sem base). Testado em
 * testes/inicio.test.ts.
 */

export type NivelAlerta = "critico" | "serio" | "atencao";

export interface Alerta {
  id: "ordens" | "estoque" | "reciclagens";
  nivel: NivelAlerta;
  numero: number;
  titulo: string;
  detalhe: string;
  href: string;
}

export interface EntradaInicio {
  ordens?: { atrasadas: number; altaPrioridade: number } | null;
  estoque?: { abaixo: number; zerados: number } | null;
  reciclagens?: { vencendo: number; vencidas: number; titulos: string[] } | null;
}

/** Quantos títulos de reciclagem aparecem no detalhe. */
const TITULOS_NO_DETALHE = 2;
const ORDEM_NIVEL: Record<NivelAlerta, number> = { critico: 0, serio: 1, atencao: 2 };
const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

export function alertasInicio(e: EntradaInicio): Alerta[] {
  const out: Alerta[] = [];

  const o = e.ordens;
  if (o && o.atrasadas > 0) {
    const alta = o.altaPrioridade > 0
      ? `${n0.format(o.altaPrioridade)} de alta prioridade`
      : "nenhuma de alta prioridade";
    out.push({ id: "ordens", nivel: "critico", numero: o.atrasadas,
      titulo: plural(o.atrasadas, "ordem atrasada", "ordens atrasadas"),
      detalhe: `Data-base vencida e ainda em aberto · ${alta}`,
      href: "/ordens?atr=1" });
  }

  const s = e.estoque;
  const faltam = s ? s.abaixo + s.zerados : 0;
  if (s && faltam > 0) {
    out.push({ id: "estoque", nivel: "serio", numero: faltam,
      titulo: plural(faltam, "material sem estoque suficiente", "materiais sem estoque suficiente"),
      detalhe: `${n0.format(s.zerados)} zerado(s) · ${n0.format(s.abaixo)} abaixo do mínimo`,
      href: "/estoque" });
  }

  const r = e.reciclagens;
  const vencendoOuVencidas = r ? r.vencidas + r.vencendo : 0;
  if (r && vencendoOuVencidas > 0) {
    const titulos = r.titulos.slice(0, TITULOS_NO_DETALHE);
    const exemplos = titulos.length ? ` · ${titulos.join(", ")}` : "";
    out.push({ id: "reciclagens", nivel: "atencao", numero: vencendoOuVencidas,
      titulo: plural(vencendoOuVencidas, "reciclagem vencida ou vencendo", "reciclagens vencidas ou vencendo"),
      detalhe: `${n0.format(r.vencidas)} vencida(s) · ${n0.format(r.vencendo)} em até 60 dias${exemplos}`,
      href: "/treinamentos_ferias" });
  }

  return out.sort((a, b) => ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel]);
}
