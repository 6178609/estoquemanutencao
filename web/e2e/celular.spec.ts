import { expect, test } from "@playwright/test";

import { entrarNaDemo, telaAbriu } from "./apoio";

// no celular: o Estoque (única tela de Terceiro e Manutentor) abre e não rola para o lado
test("estoque no celular", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/estoque");
  const largura = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(largura).toBeLessThanOrEqual(1);
  expect(erros).toEqual([]);
});
