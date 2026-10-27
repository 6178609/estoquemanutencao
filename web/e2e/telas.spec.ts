import { expect, test } from "@playwright/test";

import { entrarNaDemo, telaAbriu } from "./apoio";

// as telas mais usadas: cada uma abre, sem erro na página e sem bloqueio da CSP
const TELAS = ["/", "/painel", "/estoque", "/ordens", "/equipamentos", "/mro", "/indicadores_sim", "/indicadores_sim?visao=roadmap", "/indicadores_sim?visao=causas",
  "/confiabilidade", "/mao_de_obra?visao=Apontamentos (IW47)", "/saude", "/planos", "/listas_tarefas", "/mapa52", "/semanal", "/cartao", "/custos", "/custos?cmes=2026-01", "/dados", "/metas"];

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

test("estoque: sem foto genérica do tipo; as pílulas de sugestão e de ilustrativa saíram da tela", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/estoque");
  const grupo = page.getByRole("group", { name: "Situação do material" });
  await expect(grupo.getByRole("button", { name: /^Com foto · \d/ })).toBeVisible();
  // "Sem foto": para a equipe fotografar no almoxarifado o que a internet não resolveu
  await grupo.getByRole("button", { name: /^Sem foto · \d/ }).click();
  await expect(page.getByText("Nenhum material com esses filtros.")).toHaveCount(0);
  await expect(grupo.getByRole("button", { name: /^Foto sugerida/ })).toHaveCount(0);
  await expect(grupo.getByRole("button", { name: /^Foto ilustrativa/ })).toHaveCount(0);
  // material zerado não aparece na aba (a demonstração tem itens com saldo zero)
  await expect(grupo.getByRole("button", { name: /^Zerados/ })).toHaveCount(0);
  await expect(page.getByText("Zerado", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Foto ilustrativa", { exact: true })).toHaveCount(0);
  expect(erros).toEqual([]);
});

test("material cadastrado: foto do fabricante que não carrega não fica quebrada, sem erro", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/estoque?aba=cadastrado");
  // a demonstração tem foto do fabricante para o material 900000 com endereço que não existe: em vez de quadro quebrado,
  // a miniatura some depois da falha
  await page.getByPlaceholder(/Buscar no catálogo/).fill("900000");
  await expect(page.getByText(/^900000$|900000/).first()).toBeVisible();
  await expect(page.getByText("Foto do fabricante", { exact: true })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByText("Não foi possível carregar esta foto.")).toHaveCount(0);
  await page.getByPlaceholder(/Buscar no catálogo/).fill("ROLAMENTO");
  await expect(page.getByText("Foto ilustrativa", { exact: true })).toHaveCount(0);
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

test("suporte técnico: a biblioteca mostra o envio de documento para o editor da demonstração", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/suporte?visao=biblioteca");
  await expect(page.getByRole("button", { name: "Adicionar à biblioteca" })).toBeVisible();
  expect(erros).toEqual([]);
});

// visualização 3D de falhas (spec "Testes"): o diagnóstico mostra o bloco, a lista de causas e a explicação do marcador
test("visualização 3D no diagnóstico: rolamento + ruído mostra o bloco, a lista de causas e a explicação ao clicar", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/suporte?visao=diagnostico&tipo=rolamento_mancal&sintoma=ruido");
  const secao = page.locator("section[aria-labelledby=visualizador-3d-titulo]");
  await expect(secao.getByRole("heading", { name: "Visualização 3D" })).toBeVisible();
  await expect(secao.getByRole("button", { name: "Gaiola quebrada ou desgastada" })).toBeVisible();
  await secao.getByRole("button", { name: "Lascamento (spalling) da pista externa" }).click();
  await expect(secao.getByText("Fadiga do material ou sobrecarga soltam lascas", { exact: false })).toBeVisible();
  expect(erros).toEqual([]);
});

test("visualização 3D no guia: o guia de rolamentos mostra o modelo e a lista de peças", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/suporte?guia=rolamentos");
  const secao = page.locator("section[aria-labelledby=visualizador-3d-titulo]");
  await expect(secao.getByRole("heading", { name: "Visualização 3D" })).toBeVisible();
  await expect(secao.getByRole("button", { name: "Gaiola" })).toBeVisible();
  expect(erros).toEqual([]);
});

test("visualização 3D no celular (390 px): o bloco cabe na tela e a página não rola de lado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrarNaDemo(page);
  await telaAbriu(page, "/suporte?visao=diagnostico&tipo=rolamento_mancal&sintoma=ruido");
  const secao = page.locator("section[aria-labelledby=visualizador-3d-titulo]");
  await secao.scrollIntoViewIfNeeded();
  await expect(secao.getByRole("button", { name: "Gaiola quebrada ou desgastada" })).toBeVisible();
  const medidas = await page.evaluate(() => ({ rolagem: document.documentElement.scrollWidth, janela: window.innerWidth }));
  expect(medidas.rolagem).toBeLessThanOrEqual(medidas.janela);
});

test("equipamentos: clicar no ativo abre a biblioteca do ativo (a lista só escolhe o ativo)", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/equipamentos");
  await page.locator('a[href^="/equipamentos/biblioteca?eq="]').first().click();
  await expect(page).toHaveURL(/\/equipamentos\/biblioteca\?eq=/);
  await expect(page.getByRole("heading", { name: "Resumo do ativo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Escolher outro ativo" })).toBeVisible();
  // link antigo com ?at= também abre a biblioteca
  const eq = new URL(page.url()).searchParams.get("eq")!;
  await page.goto(`/equipamentos?at=${encodeURIComponent(eq)}`);
  await expect(page).toHaveURL(/\/equipamentos\/biblioteca\?eq=/);
  expect(erros).toEqual([]);
});

test("listas de tarefas: visão geral, qualidade e ficha com equipamentos, operações e manuais", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/listas_tarefas");
  await expect(page.getByText("Trabalho por ano em cada centro de trabalho")).toBeVisible();
  await page.locator('a[href^="/listas_tarefas/lista?"]').first().click();
  await expect(page).toHaveURL(/\/listas_tarefas\/lista\?g=/);
  await expect(page.getByRole("heading", { name: "Equipamentos que usam a lista" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Operações" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Manuais e guias" })).toBeVisible();
  await telaAbriu(page, "/listas_tarefas?visao=qualidade");
  await expect(page.getByText("Sem equipamento", { exact: false }).first()).toBeVisible();
  expect(erros).toEqual([]);
});

test("MRO: a carga da IA06 vem distribuída por lista e operação (peça de troca na operação que a substitui)", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  // um equipamento que usa uma lista de tarefas (a ficha da lista mostra os equipamentos)
  await telaAbriu(page, "/listas_tarefas");
  await page.locator('a[href^="/listas_tarefas/lista?"]').first().click();
  const eq = new URL(await page.locator('a[href^="/equipamentos/biblioteca?eq="]').first().getAttribute("href") ?? "", "http://x").searchParams.get("eq")!;
  await telaAbriu(page, `/mro?${new URLSearchParams({ at: eq })}#abas`);
  await page.getByRole("button", { name: "Vincular peças" }).click();
  await page.getByPlaceholder("Buscar código, descrição, Sysmat ou fabricante…").fill("ROLAMENTO");
  await page.getByRole("button", { name: "Vincular", exact: true }).first().click();
  await expect(page.getByText("Vinculada").first()).toBeVisible();
  await page.reload();
  await page.getByText("Incluir no SAP (IA06) — peças já distribuídas por lista e operação").click();
  await expect(page.getByText("Troca da peça").first()).toBeVisible();
  await expect(page.getByText(/inclusão\(ões\) em \d+ lista/)).toBeVisible();
  await page.screenshot({ path: "test-results/ia06-distribuicao.png", fullPage: true });
  expect(erros).toEqual([]);
});
