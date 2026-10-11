/** Números e datas no padrão brasileiro. */
const n0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const n2 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const inteiro = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : n0.format(v));
export const numero = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : n2.format(v));
export const brl = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : brlFmt.format(v));

export function brlCurto(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e6) return `R$ ${n2.format(Math.round(v / 1e4) / 100)} mi`;
  if (a >= 1e3) return `R$ ${n2.format(Math.round(v / 100) / 10)} mil`;
  return brl(v);
}

const fuso = "America/Sao_Paulo";
export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, dateStyle: "short", timeStyle: "short" }).format(d);
}

export function idade(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `há ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

export function saudacao(): string {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
