"use client";

import { useMemo, useState } from "react";

import { MultiEscolha } from "@/components/Filtros";

import { TabelaDados, type Celula, type Coluna } from "../confiabilidade/_comum/TabelaDados";

/** Horas por pessoa com busca e filtros de especialidade e área (colunas 3 e 4). */
const COLUNAS_PESSOAS: Coluna[] = [
  { rotulo: "Nº pessoal", formato: "codigo" }, { rotulo: "Nome", largo: true }, { rotulo: "Cargo" }, { rotulo: "Especialidade" },
  { rotulo: "Área" }, { rotulo: "Turma" }, { rotulo: "Centro (mais apontado)" }, { rotulo: "HH apontadas", formato: "num1" },
  { rotulo: "Utilização", formato: "%", barra: 100, dica: "HH apontadas ÷ horas disponíveis da pessoa no período (Gerenciador de HH: jornada × % disponível, menos férias e ausências)" },
  { rotulo: "HH por dia", formato: "num1" }, { rotulo: "Dias com apontamento", formato: "inteiro" }, { rotulo: "Ordens", formato: "inteiro" },
  { rotulo: "% em plano", formato: "%", dica: "Sobre as horas de ordens que estão no IW38" },
  { rotulo: "% emergencial", formato: "%", dica: "Sobre as horas de ordens que estão no IW38" }, { rotulo: "% fora do IW38", formato: "%" },
];

export function Pessoas({ linhas }: { linhas: Celula[][] }) {
  const [esp, setEsp] = useState<string[]>([]);
  const [area, setArea] = useState<string[]>([]);
  const opcoes = (j: number) => {
    const m = new Map<string, number>();
    for (const l of linhas) if (l[j]) m.set(String(l[j]), (m.get(String(l[j])) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([valor, n]) => ({ valor, n }));
  };
  const vis = useMemo(() => linhas.filter((l) => (!esp.length || esp.includes(String(l[3]))) && (!area.length || area.includes(String(l[4])))),
    [linhas, esp, area]);
  return (
    <TabelaDados colunas={COLUNAS_PESSOAS} linhas={vis} busca="Buscar pessoa: nome, matrícula, cargo, centro…" baixar="hh_por_pessoa"
      ordemInicial={{ coluna: 7, desc: true }} limite={600}
      filtroExterno={(
        <>
          <MultiEscolha rotulo="Especialidade" opcoes={opcoes(3)} valor={esp} aoMudar={setEsp} />
          <MultiEscolha rotulo="Área (equipe)" opcoes={opcoes(4)} valor={area} aoMudar={setArea} />
        </>
      )} />
  );
}
