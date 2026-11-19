import { expect, test } from "@playwright/test";

import { entrarNaDemo, telaAbriu } from "./apoio";

// Controle de HH na demonstração: dados fictícios, só consulta (a demonstração não grava aqui)
const VISOES: [string, RegExp][] = [
  ["Horas disponíveis", /Capacidade por técnico/],
  ["Programação", /Total de registros/],
  ["Comparativo", /HH disponíveis/],
  ["Cobertura", /Folha de rosto|Cobertura/],
  ["Calendário", /Dias no período/],
];

test("controle de HH: abre e troca as sub-abas (demonstração)", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/agenda_hh");
  await expect(page.getByRole("link", { name: "Controle de HH" }).first()).toBeVisible();
  await expect(page.getByText(/dados são fictícios/)).toBeVisible();
  for (const [visao, marca] of VISOES) {
    await page.getByRole("link", { name: visao, exact: true }).click();
    await expect(page.getByRole("link", { name: visao, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(marca).first()).toBeVisible();
  }
  // Horas disponíveis: troca a visão para o mês e filtra pela busca
  await page.getByRole("link", { name: "Horas disponíveis", exact: true }).click();
  await page.getByRole("button", { name: "Mês", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mês", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Exportar backup" })).toBeVisible();

  // celular: sem rolagem lateral em nenhuma sub-aba
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [visao] of VISOES) {
    await telaAbriu(page, `/agenda_hh?visao=${encodeURIComponent(visao)}`);
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sobra, `${visao} sem rolagem lateral`).toBeLessThanOrEqual(1);
  }
  expect(erros).toEqual([]);
});
