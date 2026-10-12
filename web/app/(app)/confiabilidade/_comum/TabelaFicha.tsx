"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { TabelaDados, type Celula, type Coluna } from "./TabelaDados";

/**
 * Tabela em que a 1ª coluna é o código do equipamento: clicar numa linha mostra o atalho para a ficha dele
 * (aba Equipamentos), como o link_ficha do app Streamlit.
 */
export function TabelaFicha({ colunas, linhas, busca, baixar, limite, alturaMax, colunaNome = 1 }: {
  colunas: Coluna[]; linhas: Celula[][]; busca?: string; baixar?: string; limite?: number; alturaMax?: number; colunaNome?: number;
}) {
  const [sel, setSel] = useState<Celula[] | null>(null);
  return (
    <TabelaDados colunas={colunas} linhas={linhas} busca={busca} baixar={baixar} limite={limite} alturaMax={alturaMax}
      aoSelecionar={setSel} selecionada={sel?.[0]}
      rodape={sel ? (
        <Link href={`/equipamentos?eq=${encodeURIComponent(String(sel[0]))}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-texto-2 hover:text-texto">
          Abrir ficha de {String(sel[0])}{sel[colunaNome] ? ` · ${String(sel[colunaNome]).slice(0, 40)}` : ""} <ArrowRight className="size-4" />
        </Link>
      ) : undefined} />
  );
}
