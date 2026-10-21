import { expect, test } from "@playwright/test";

import { entrarNaDemo, telaAbriu } from "./apoio";

// as telas mais usadas: cada uma abre, sem erro na página e sem bloqueio da CSP
const TELAS = ["/", "/painel", "/estoque", "/ordens", "/equipamentos", "/mro", "/indicadores_sim", "/indicadores_sim?visao=roadmap", "/indicadores_sim?visao=causas",
  "/confiabilidade", "/mao_de_obra?visao=Apontamentos (IW47)", "/saude", "/planos", "/semanal", "/custos", "/custos?cmes=2026-01", "/dados", "/metas"];

test("telas principais abrem sem erro", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  for (const t of TELAS) await telaAbriu(page, t);
  expect(erros).toEqual([]);
});

test("orçamento do mês na aba Custos: cartão e editor (a demo pode editar)", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/custos");
  await expect(page.getByRole("heading", { name: "Orçamento do mês" })).toBeVisible();
  await expect(page.getByText("Lançar valor disponível")).toBeVisible();
  expect(erros).toEqual([]);
});

test("termômetro do custo: a seta de mês anterior troca o mês", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/custos");
  const mesDoTermometro = page.getByText(/^[A-ZÇ][a-zç]+ de \d{4}$/).first();
  const antes = await mesDoTermometro.textContent();
  await page.getByRole("link", { name: "Mês anterior" }).click();
  await expect(mesDoTermometro).not.toHaveText(antes ?? "");
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

test("modos de causa: a nuvem de palavras abre os apontamentos da palavra clicada", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/indicadores_sim?visao=causas&atalho=Tudo");
  await page.getByRole("link", { name: /^rolamento:/i }).click();
  await expect(page.getByRole("heading", { name: /Apontamentos com/ })).toBeVisible();
  expect(erros).toEqual([]);
});

test("sem login, as telas mandam para a entrada", async ({ page }) => {
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/entrar/);
});

test("a página de privacidade abre sem login e a entrada aponta para ela", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByRole("link", { name: "Privacidade" }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Privacidade/);
});

test("baixar meus dados exige login", async ({ request }) => {
  expect((await request.get("/api/conta/meus-dados")).status()).toBe(401);
});

test("a rota de aquecimento responde sem dados", async ({ request }) => {
  const r = await request.get("/api/aquecer");
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(Object.keys(j)).toEqual(["ok", "etapas", "bases"]);
  // por base, só tamanho, linhas, tempos e a hora da leitura — nenhum dado
  for (const t of Object.values(j.bases as Record<string, Record<string, unknown>>))
    expect(Object.keys(t).sort()).toEqual(["baixar_ms", "em", "kb", "ler_ms", "linhas", "preparar_ms"]);
});

test("custos: o filtro Pessoas (requisições) marca quem entra e põe o endereço", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/custos");
  await page.getByRole("button", { name: /^Pessoas \(requisições\)/ }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/[?&]pes=/);
  expect(erros).toEqual([]);
});

// Suporte Técnico: guias com busca, diagnóstico guiado e biblioteca (dados fictícios da demonstração)
test("suporte técnico: guias, diagnóstico e biblioteca abrem; a busca acha o guia de rolamentos", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/suporte");
  await telaAbriu(page, "/suporte?visao=diagnostico&tipo=motor_eletrico&sintoma=aquecimento");
  await expect(page.getByRole("heading", { name: "Causas prováveis" })).toBeVisible();
  await telaAbriu(page, "/suporte?visao=biblioteca");
  await telaAbriu(page, "/suporte?q=rolamento");
  await expect(page.getByRole("heading", { name: "Rolamentos e mancais" }).first()).toBeVisible();
  expect(erros).toEqual([]);
});

test("suporte técnico no celular: diagnóstico com tipo inválido volta à escolha e a tela não rola de lado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/suporte?visao=diagnostico&tipo=xyz");
  await expect(page.getByText("Tipo de equipamento não reconhecido")).toBeVisible();
  await expect(page.getByText("1. Qual é o equipamento?")).toBeVisible();
  const largura = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(largura).toBeLessThanOrEqual(1);
  expect(erros).toEqual([]);
});
