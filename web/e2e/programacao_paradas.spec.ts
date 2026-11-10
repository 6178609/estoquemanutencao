import { expect, test } from "@playwright/test";

import { entrarNaDemo, telaAbriu } from "./apoio";

// Programação de paradas (modo demonstração): programação em lista, verificação com as 11 conferências e sem rolagem lateral no celular
test("programação de paradas", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/programacao_paradas");
  await expect(page.locator("h1").first()).toContainText("Programação de paradas");
  await page.getByRole("link", { name: "Verificação" }).click();
  await expect(page.locator("[data-conferencia]")).toHaveCount(11);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("[data-conferencia]")).toHaveCount(11);
  const largura = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(largura).toBeLessThanOrEqual(1);
  expect(erros).toEqual([]);
});
