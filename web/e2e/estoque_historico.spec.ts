import { expect, test } from "@playwright/test";

import { entrarNaDemo, telaAbriu } from "./apoio";

// Histórico de retiradas (IW13) na aba Estoque, com a IW13 fictícia (lib/estoque/demo.ts); o visitante vê a aba Custos
test("estoque: consumo 12 m na lista e histórico de retiradas da IW13 no detalhamento (demonstração)", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/estoque");
  await page.locator("#ordem").selectOption("consumo");
  const primeiro = page.locator("[data-consumo]").first();
  await expect(primeiro).toBeVisible();
  await primeiro.click();

  const gaveta = page.getByRole("dialog");
  const hist = gaveta.locator("[data-historico]");
  await expect(hist.getByRole("heading", { name: "Histórico de retiradas (IW13)" })).toBeVisible();
  await expect(hist.getByText("Retirado em 12 meses")).toBeVisible();
  await expect(hist.getByText("Último consumo")).toBeVisible();
  await expect(hist.getByRole("list", { name: /Retirado por mês/ }).getByRole("listitem")).toHaveCount(12);
  await expect(hist.getByText("Valor em 12 meses")).toBeVisible();
  await expect(hist.getByRole("columnheader", { name: "Valor" })).toBeVisible();
  await expect(hist.getByText("Devolução").first()).toBeVisible();
  await expect(hist.locator("tbody tr")).toHaveCount(50);
  await hist.getByRole("button", { name: /Ver mais/ }).click();
  await expect(hist.getByRole("button", { name: /Ver mais/ })).toHaveCount(0);
  expect(await hist.locator("tbody tr").count()).toBeGreaterThan(50);

  const download = page.waitForEvent("download");
  await hist.getByRole("button", { name: /Excel \(CSV\)/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^retiradas_iw13_\d+\.csv$/);
  expect(erros).toEqual([]);
});
