import { expect, test } from "@playwright/test";

import { entrarNaDemo, telaAbriu } from "./apoio";

const semRolagemLateral = async (page: import("@playwright/test").Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

// Programação de paradas (modo demonstração): as visões abrem, a verificação tem as 11 conferências e nada rola de lado no celular
test("programação de paradas", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/programacao_paradas");
  await expect(page.locator("h1").first()).toContainText("Programação de paradas");
  await page.getByRole("link", { name: "Verificação" }).click();
  await expect(page.locator("[data-conferencia]")).toHaveCount(11);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator("[data-conferencia]")).toHaveCount(11);
  await semRolagemLateral(page);
  expect(erros).toEqual([]);
});

test("programação de paradas: calendário, saldo de HH, campos por dia e ativos sem HH (390 px)", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const erros = await entrarNaDemo(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await telaAbriu(page, "/programacao_paradas?visao=Calend%C3%A1rio");
  await expect(page.locator("[data-dia]").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Imprimir/ })).toBeVisible();
  await semRolagemLateral(page);
  await telaAbriu(page, "/programacao_paradas?visao=Saldo%20HH");
  await expect(page.getByRole("table", { name: /Saldo de HH/ })).toBeVisible();
  await semRolagemLateral(page);
  await telaAbriu(page, "/programacao_paradas?visao=Campos%20por%20dia");
  await page.getByRole("button", { name: /Copiar lista do mês/ }).click();
  await expect(page.getByText("Copiado").first()).toBeVisible();
  await semRolagemLateral(page);
  await telaAbriu(page, "/programacao_paradas?visao=Ativos%20sem%20HH");
  await expect(page.getByRole("link", { name: /Baixar Excel/ })).toBeVisible();
  await semRolagemLateral(page);
  const [baixa] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Baixar Excel/ }).click()]);
  expect(baixa.suggestedFilename()).toMatch(/^programacao_paradas_.*\.xlsx$/);
  expect(erros).toEqual([]);
});
