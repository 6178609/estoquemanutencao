import { chave } from "../dados/texto";
import type { Tabela } from "./leitura";

/**
 * Recorte da base mensal do Dashboard de Indicadores SIM (aba "BASE MENSAL - PREENCHER AQUI") antes do envio: só as
 * linhas do pilar MP (Manutenção Profissional) e só as colunas de indicador (sem responsável, backup e afins).
 * Feito no navegador: o que não é do MP nem sai do computador. Testado em testes/indicadoresSim.test.ts.
 */
export const PILAR = "MP";
/** Só as colunas que a tela usa (lista de inclusão: uma coluna nova com nomes de pessoas nunca sai do computador). */
const USADAS = /^(PILAR|AREA|TIPO|KPIS? INDUSTRIA\w*|MES ANO|META MES|FCST MES|REAL MES|YTD META|YTD REAL|FY META|FY ESTIMATIVA|FY \d{4}|SEMANA [1-5])$/;

export function recortarPilarMp(t: Tabela): Tabela {
  const ks = t.colunas.map(chave);
  const iPilar = ks.indexOf("PILAR"), iKpi = ks.findIndex((k) => /^KPIS? INDUSTRIA/.test(k));
  const manter = ks.map((k, i) => (USADAS.test(k) ? i : -1)).filter((i) => i >= 0);
  const linhas = t.linhas.filter((l) => chave(l[iPilar]) === PILAR && String(l[iKpi] ?? "").trim());
  return { colunas: manter.map((i) => t.colunas[i]), linhas: linhas.map((l) => manter.map((i) => l[i] ?? "")) };
}

/**
 * Roadmap (export do Power BI): uma linha por máquina, com o passo previsto e o realizado de cada mês. Fica só o que é
 * máquina (sai o rodapé "Filtros aplicados" e as linhas vazias) e só as colunas do roadmap.
 */
const COLUNAS_ROADMAP = /^(FABRICA|MAQUINA|(PREV|REL) (JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)|COMENTARIOS?)$/;

export function recortarRoadmap(t: Tabela): Tabela {
  const ks = t.colunas.map(chave);
  const iMaq = ks.indexOf("MAQUINA");
  const manter = ks.map((k, i) => (COLUNAS_ROADMAP.test(k) ? i : -1)).filter((i) => i >= 0);
  const linhas = t.linhas.filter((l) => {
    const m = String(l[iMaq] ?? "").trim();
    return m && !/^FILTROS APLICADOS/.test(chave(m));
  });
  return { colunas: manter.map((i) => t.colunas[i]), linhas: linhas.map((l) => manter.map((i) => l[i] ?? "")) };
}
