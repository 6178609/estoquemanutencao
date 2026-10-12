import "server-only";

import { formatarCelula, type Coluna, type Linha } from "./TabelaDados";

/** Resposta CSV (separador ;, BOM UTF-8 — abre direto no Excel em português). */
export function respostaCsv(nome: string, colunas: Coluna[], linhas: Linha[]): Response {
  const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const cel = (l: Linha, c: Coluna) => {
    const v = l[c.chave];
    if (v == null || v === "") return "";
    if (typeof v === "number" && (c.tipo === "R$" || c.tipo === "num1" || c.tipo === "int")) return String(v).replace(".", ",");
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    return formatarCelula(v, c.tipo === "data" ? "data" : "texto");
  };
  const corpo = [colunas.map((c) => esc(c.rotulo)).join(";"), ...linhas.map((l) => colunas.map((c) => esc(cel(l, c))).join(";"))].join("\r\n");
  return new Response("﻿" + corpo, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${nome}.csv"`, "cache-control": "no-store" },
  });
}
