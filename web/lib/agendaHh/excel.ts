import { gerarXlsx, type CelulaXlsx } from "@/lib/exportacao/xlsx";
import { Xlsx } from "@/lib/leitura/xlsx";
import {
  COLUNAS_MODELO, MAX_LINHAS_PLANILHA, ROTULO_STATUS, formatarData, type Programacao, type Tecnico,
} from "./regras";

/**
 * Planilhas da Controle de HH, só no navegador: modelo para importar, exportação das programações e leitura de um
 * arquivo escolhido. Usa o gerador (lib/exportacao/xlsx.ts) e o leitor (lib/leitura/xlsx.ts) que o projeto já tem.
 */

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function baixar(nome: string, bytes: Uint8Array) {
  const blob = new Blob([bytes as BlobPart], { type: MIME_XLSX });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Modelo para preencher e importar: cabeçalho das colunas de COLUNAS_MODELO e uma linha de exemplo fictícia. */
export function baixarModelo(): void {
  const colunas = COLUNAS_MODELO.map((titulo) => ({ titulo, largura: titulo === "Descrição" ? 40 : 18 }));
  // só o cabeçalho: uma linha de exemplo com NP fictício faria a importação recusar a planilha inteira
  baixar("modelo_programacao_hh.xlsx", gerarXlsx("Programação", colunas, []));
}

/** Uma linha por programação, com colunas legíveis em pt-BR, datas dd/mm/aaaa e duração em minutos e em horas. */
export function exportarProgramacoes(lista: Programacao[], tecnicos: Tecnico[], nome = "programacao_hh"): void {
  const centroDe = new Map(tecnicos.map((t) => [t.id, t.centro]));
  const colunas = [
    { titulo: "Equipamento", largura: 20 }, { titulo: "Tipo de Ordem", largura: 14 }, { titulo: "Ordem", largura: 12 },
    { titulo: "Descrição", largura: 40 }, { titulo: "Área de Atuação", largura: 18 }, { titulo: "Data Programada", largura: 16 },
    { titulo: "Turno", largura: 12 }, { titulo: "Status", largura: 14 }, { titulo: "Tempo em Min", largura: 14 },
    { titulo: "Tempo em Horas", largura: 15 }, { titulo: "Técnico", largura: 24 }, { titulo: "NP", largura: 12 },
    { titulo: "Centro de Trabalho", largura: 20 }, { titulo: "Reprogramações", largura: 16 },
  ];
  const linhas: CelulaXlsx[][] = lista.map((p) => {
    const minutos = Number(p.minutos) || 0;
    return [p.equipamento, p.tipoOrdem, p.ordem, p.descricao, p.area, formatarData(p.data), p.turno, ROTULO_STATUS[p.status],
      minutos, Math.round((minutos / 60) * 100) / 100, p.tecnicoNome, p.np, centroDe.get(p.tecnicoId) ?? "", p.historico.length];
  });
  baixar(`${nome}.xlsx`, gerarXlsx("Programação", colunas, linhas));
}

/** Linhas cruas da primeira aba (cabeçalho + até MAX_LINHAS_PLANILHA linhas). Datas vêm como objeto de data do leitor. */
export async function lerPlanilha(arquivo: File): Promise<unknown[][]> {
  const x = new Xlsx(new Uint8Array(await arquivo.arrayBuffer()));
  const aba = x.abas[0];
  if (!aba) return [];
  return x.linhas(aba, MAX_LINHAS_PLANILHA + 1);
}
