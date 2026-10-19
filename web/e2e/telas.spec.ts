import { expect, test } from "@playwright/test";

import { entrarNaDemo, telaAbriu } from "./apoio";

// as telas mais usadas: cada uma abre, sem erro na página e sem bloqueio da CSP
const TELAS = ["/", "/painel", "/estoque", "/ordens", "/equipamentos", "/mro", "/indicadores_sim", "/indicadores_sim?visao=roadmap",
  "/confiabilidade", "/saude", "/planos", "/semanal", "/custos", "/dados", "/metas"];

test("telas principais abrem sem erro", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  for (const t of TELAS) await telaAbriu(page, t);
  expect(erros).toEqual([]);
});

test("busca no estoque filtra a lista", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/estoque");
  const busca = page.getByPlaceholder(/Buscar por código/i);
  await busca.fill("ROLAMENTO");
  await expect(page.getByText(/ROLAMENTO/i).first()).toBeVisible();
  expect(erros).toEqual([]);
});

test("sem login, as telas mandam para a entrada", async ({ page }) => {
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/entrar/);
});

test("a rota de aquecimento responde sem dados", async ({ request }) => {
  const r = await request.get("/api/aquecer");
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(Object.keys(j)).toEqual(["ok", "etapas"]);
});
