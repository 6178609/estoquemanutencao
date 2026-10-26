import { FileSpreadsheet, FileText } from "lucide-react";

/** Baixar as peças vinculadas ao equipamento: PDF (para imprimir) ou Excel (.xlsx). */
export function BaixarPecas({ eq, n }: { eq: string; n: number }) {
  if (!n) return null;
  const href = (formato: string) => `/api/equipamentos/pecas?${new URLSearchParams({ eq, formato })}`;
  const cls = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-borda bg-superficie px-3 text-[13px] transition hover:bg-superficie-2";
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-[12.5px] text-texto-3">Peças vinculadas ({n}):</span>
      <a href={href("pdf")} className={cls} download><FileText className="size-3.5" /> Baixar PDF</a>
      <a href={href("xlsx")} className={cls} download><FileSpreadsheet className="size-3.5" /> Baixar Excel</a>
    </span>
  );
}
