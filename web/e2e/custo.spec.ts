import { expect, test } from "@playwright/test";

import { entrarNaDemo, telaAbriu } from "./apoio";

// Custo dos materiais na demonstração: preços fictícios (lib/dados/demo.ts → custoDemo); o visitante (analista) vê a aba Custos
test("custo dos materiais: preço e valor no Estoque, na UBM e no Machine Ledger (demonstração)", async ({ page }) => {
  const erros = await entrarNaDemo(page);

  // Estoque: total do valor em estoque da lista, preço na linha e no detalhe
  await telaAbriu(page, "/estoque");
  await expect(page.locator("[data-valor-total]")).toContainText("R$");
  await expect(page.locator("[data-preco]").first()).toBeVisible();
  await page.locator("[data-preco]").filter({ hasText: "R$" }).first().click();
  const gaveta = page.getByRole("dialog");
  await expect(gaveta.getByText("Preço médio", { exact: true })).toBeVisible();
  await expect(gaveta.getByText("Valor em estoque", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // UBM: valor do kit por armário e valor das retiradas na Análise
  await telaAbriu(page, "/ubm");
  await expect(page.locator("[data-valor-kit]").first()).toContainText("R$");
  await telaAbriu(page, "/ubm?visao=An%C3%A1lise");
  await expect(page.getByText("Valor das retiradas")).toBeVisible();

  // Machine Ledger: preço médio e valor do estoque de segurança nas peças
  await telaAbriu(page, "/machine_ledger?visao=M%C3%A1quinas&m=ml-demo0001");
  await expect(page.getByRole("columnheader", { name: "Preço médio" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Valor est. seg." })).toBeVisible();

  // Fontes de dados: a base nova aparece com o texto de onde exportar
  await telaAbriu(page, "/dados");
  await expect(page.getByText("Custo dos materiais (preço médio)")).toBeVisible();
  expect(erros).toEqual([]);
});
