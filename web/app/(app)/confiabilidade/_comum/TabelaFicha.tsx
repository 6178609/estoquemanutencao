"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { TabelaDados, type Celula, type Coluna } from "./TabelaDados";

/**
 * Tabela em que a 1ª coluna é o código do equipamento: clicar numa linha mostra o atalho para a ficha dele
 * (aba Equipamentos), como o link_ficha do app Streamlit.
 */
export function TabelaFicha({ colunas, linhas, busca, baixar, limite, alturaMax, colunaNome = 1, colunaCodigo = 0 }: {
  colunas: Coluna[]; linhas: Celula[][]; busca?: string; baixar?: string; limite?: number; alturaMax?: number; colunaNome?: number;
  colunaCodigo?: number;
}) {
  const [sel, setSel] = useState<Celula[] | null>(null);
  return (
    <TabelaDados colunas={colunas} linhas={linhas} busca={busca} baixar={baixar} limite={limite} alturaMax={alturaMax}
      aoSelecionar={setSel} selecionada={sel?.[colunaCodigo]} colunaChave={colunaCodigo}
      rodape={sel ? (
        <Link prefetch={false} href={`/equipamentos?eq=${encodeURIComponent(String(sel[colunaCodigo]))}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-texto-2 hover:text-texto">
          Abrir ficha de {String(sel[colunaCodigo])}{sel[colunaNome] ? ` · ${String(sel[colunaNome]).slice(0, 40)}` : ""} <ArrowRight className="size-4" />
        </Link>
      ) : undefined} />
  );
}
