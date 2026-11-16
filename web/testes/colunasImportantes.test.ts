import { describe, expect, it } from "vitest";

import { avisosDeColunas } from "@/lib/leitura/colunasImportantes";
import { processar } from "@/lib/leitura/processar";

/** Tabelas fictícias: só cabeçalhos e valores inventados. */
const tab = (colunas: string[], linhas: string[][] = [["1"]]) => ({ colunas, linhas });

describe("avisos de colunas importantes no envio", () => {
  it("MB52 só com material, texto, UM e utilização livre: avisa valor e depósito", () => {
    const a = avisosDeColunas("mb52", tab(["Material", "Texto breve material", "UM básica", "Utilização livre"]));
    expect(a).toHaveLength(2);
    expect(a[0]).toMatch(/Valor/);
    expect(a[1]).toMatch(/Depósito/);
  });

  it("MB52 completo: nada a avisar", () => {
    expect(avisosDeColunas("mb52", tab(["Material", "Depósito", "Utilização livre", "Valor utiliz.livre"]))).toEqual([]);
  });

  it("IH08 com 5 colunas: avisa Código ABC, equipamento superior e centro de custo", () => {
    const a = avisosDeColunas("ih08", tab(["Equipamento", "Denominação do objeto técnico", "Localização", "Local de instalação", "Status do sistema"]));
    expect(a.map((x) => x.match(/“([^”]+)”/)?.[1])).toEqual(["Código ABC", "Equipamento superior", "Centro de custo"]);
    expect(avisosDeColunas("ih08", tab(["Equipamento", "Denominação", "Código ABC", "Equipamento superior", "Centro custo"]))).toEqual([]);
  });

  it("IW38 sem prioridade e IW47 sem unidade", () => {
    expect(avisosDeColunas("iw38", tab(["Ordem", "Tipo de ordem", "Status do sistema"]))[0]).toMatch(/Prioridade/);
    expect(avisosDeColunas("iw38", tab(["Ordem", "Tipo de ordem", "Prioridade"]))).toEqual([]);
    expect(avisosDeColunas("iw47", tab(["Ordem", "Nº pessoal", "Trabalho real"]))[0]).toMatch(/minutos/);
    expect(avisosDeColunas("iw47", tab(["Ordem", "Nº pessoal", "Trabalho real", "Unid.trabalho real"]))).toEqual([]);
  });

  it("IW28: sem a coluna de tipo de nota, ou sem nenhuma nota Y1", () => {
    expect(avisosDeColunas("iw28", tab(["Nota", "Data da nota"]))[0]).toMatch(/Tipo de nota/);
    const semY1 = avisosDeColunas("iw28", tab(["Nota", "Tipo de nota"], [["100", "Y2"], ["101", "Y3"]]));
    expect(semY1).toHaveLength(1);
    expect(semY1[0]).toMatch(/Nenhuma nota Y1/);
    expect(avisosDeColunas("iw28", tab(["Nota", "Tipo de nota"], [["100", "Y2"], ["101", " y1 "]]))).toEqual([]);
  });

  it("bases sem lista de colunas importantes não geram aviso", () => {
    expect(avisosDeColunas("requisicoes", tab(["Número da requisição", "Total"]))).toEqual([]);
  });

  it("processar devolve os avisos junto da base lida (o envio segue)", () => {
    const csv = "Material;Texto breve material;UM;Utilização livre\n900001;ROLAMENTO FICTICIO;UN;3\n";
    const r = processar("MB52.csv", new TextEncoder().encode(csv));
    expect(r.erro).toBeUndefined();
    expect(r.bases).toHaveLength(1);
    expect(r.bases[0].tipo).toBe("mb52");
    expect(r.bases[0].avisos).toHaveLength(2);
    expect(r.bases[0].partes.length).toBeGreaterThan(0);
  });
});
