import { Download } from "lucide-react";

/** Link de exportação (CSV gerado no servidor com TODOS os registros do filtro, não só a página). */
export function Baixar({ href, children = "Baixar CSV" }: { href: string; children?: React.ReactNode }) {
  return (
    <a href={href} download className="inline-flex h-9 items-center gap-2 rounded-lg border border-borda bg-superficie px-3 text-[13px] font-medium text-texto-2 transition hover:bg-superficie-2 hover:text-texto">
      <Download className="size-4" strokeWidth={1.75} />{children}
    </a>
  );
}

/** Parâmetros atuais da página → query string (para levar o mesmo filtro à exportação). */
export function query(params: Record<string, string | string[] | undefined>, tirar: string[] = []): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || tirar.includes(k)) continue;
    for (const x of Array.isArray(v) ? v : [v]) p.append(k, x);
  }
  return p.toString();
}
