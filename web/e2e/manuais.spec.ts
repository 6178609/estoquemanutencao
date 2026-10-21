import { expect, test } from "@playwright/test";

import { entrarNaDemo, telaAbriu } from "./apoio";

// Aba Manuais em modo demonstração (dados fictícios): abre, mostra o formulário a quem edita e filtra a lista.
test("Manuais abre e, para quem edita (demonstração), mostra o formulário de vincular", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/manuais");
  await expect(page.getByRole("heading", { name: "Vincular manual" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cobertura" })).toBeVisible();
  expect(erros).toEqual([]);
});

test("a escolha de equipamentos filtra pela busca e a lista geral filtra pelo endereço", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/manuais");
  await page.getByLabel("Buscar equipamento").fill("zzz-sem-nada");
  await expect(page.getByText("Nenhum equipamento com esta busca.")).toBeVisible();
  await page.getByLabel("Buscar equipamento").fill("");

  await page.getByPlaceholder("Equipamento, campo ou título").fill("zzz-sem-nada");
  await page.getByRole("button", { name: "Filtrar" }).first().click();
  await expect(page).toHaveURL(/q=zzz-sem-nada/);
  await expect(page.getByText("Nenhum manual com estes filtros.")).toBeVisible();
  expect(erros).toEqual([]);
});

test("sem rolagem horizontal na tela de 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrarNaDemo(page);
  await telaAbriu(page, "/manuais");
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra).toBeLessThanOrEqual(0);
});
