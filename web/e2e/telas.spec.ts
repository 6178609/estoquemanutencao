import { expect, test } from "@playwright/test";

import { entrarNaDemo, telaAbriu } from "./apoio";

// as telas mais usadas: cada uma abre, sem erro na página e sem bloqueio da CSP
const TELAS = ["/", "/painel", "/estoque", "/ordens", "/equipamentos", "/mro", "/indicadores_sim", "/indicadores_sim?visao=roadmap", "/indicadores_sim?visao=causas",
  "/confiabilidade", "/mao_de_obra?visao=Apontamentos (IW47)", "/saude", "/planos", "/planos?vista=mapa", "/mapa52", "/confiabilidade_tipos", "/confiabilidade?visao=Por tipo de ordem", "/cartao", "/cadastro_material", "/custos", "/custos?cmes=2026-01", "/dados", "/metas"];

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

test("estoque: sem foto genérica do tipo nem pílulas de sugestão e de ilustrativa (o selo Ilustrativa é só da foto equivalente)", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/estoque");
  const grupo = page.getByRole("group", { name: "Situação do material" });
  await expect(grupo.getByRole("button", { name: /^Com foto · \d/ })).toBeVisible();
  // "Sem foto": para a equipe fotografar no almoxarifado o que a internet não resolveu
  await grupo.getByRole("button", { name: /^Sem foto · \d/ }).click();
  await expect(page.getByText("Nenhum material com esses filtros.")).toHaveCount(0);
  await expect(grupo.getByRole("button", { name: /^Foto sugerida/ })).toHaveCount(0);
  await expect(grupo.getByRole("button", { name: /^Foto ilustrativa/ })).toHaveCount(0);
  await expect(page.getByText("Foto ilustrativa", { exact: true })).toHaveCount(0);
  // a lista padrão ("Com saldo") não traz material zerado; a pílula "Zerados" mostra as faltas (a demonstração tem itens com saldo zero)
  await grupo.getByRole("button", { name: /^Com saldo · \d/ }).click();
  await expect(page.getByText("Zerado", { exact: true })).toHaveCount(0);
  await grupo.getByRole("button", { name: /^Zerados · [1-9]/ }).click();
  await expect(page.getByText("Zerado", { exact: true }).first()).toBeVisible();
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

test("requisições: o filtro Pessoas (requisições) também vale na aba e põe o endereço", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/requisicoes");
  await page.getByRole("button", { name: /^Pessoas \(requisições\)/ }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/[?&]pes=/);
  await expect(page.getByText(/Requisições de: pessoas da manutenção \(1\)/)).toBeVisible();
  expect(erros).toEqual([]);
});

test("fontes de dados e menu: sem rolagem lateral em 390 px; Qualidade dos dados no menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/dados");
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("link", { name: "Qualidade dos dados" }).first()).toBeAttached();
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

test("MRO: incluir no SAP (IA06) pela Gestão de MRO e pelo atalho da biblioteca do ativo", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/mro");
  const eq = new URL(await page.locator('a[href*="at="]').first().getAttribute("href") ?? "", "http://x").searchParams.get("at")!;
  await telaAbriu(page, `/mro?${new URLSearchParams({ at: eq })}#abas`);
  await page.getByRole("button", { name: "Vincular peças" }).click();
  await page.getByPlaceholder("Buscar código, descrição, Sysmat ou fabricante…").fill("ROLAMENTO");
  await page.getByRole("button", { name: "Vincular", exact: true }).first().click();
  await expect(page.getByText("Vinculada").first()).toBeVisible();
  await page.reload();
  await page.getByText("Incluir no SAP (IA06) — peças do ativo nas listas de tarefas").click();
  await expect(page.getByText("Incluir na lista de tarefas do SAP (IA06)")).toBeVisible();
  // a biblioteca do ativo leva direto à inclusão da IA06, já aberta
  await telaAbriu(page, `/equipamentos/biblioteca?${new URLSearchParams({ eq })}`);
  await page.getByRole("link", { name: "Incluir no SAP (IA06)" }).click();
  await expect(page).toHaveURL(/\/mro\?.*ia06=1/);
  expect(erros).toEqual([]);
});

test("UBM (demonstração): abas, validação do líder no celular (Veio da UBM baixa o saldo) e etiqueta só de solicitação", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  for (const v of ["Visão geral", "Validação do líder", "Retiradas", "Solicitações", "Análise", "Armários", "Como funciona"]) await telaAbriu(page, `/ubm?visao=${v}`);
  await telaAbriu(page, "/ubm");
  await expect(page.getByRole("heading", { name: "Lista de reposição" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Retiradas não lançadas na ordem" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^A validar/ })).toBeVisible();
  // o armário desenhado: gavetas e só o QR de SOLICITAÇÃO na porta (o de retirada saiu)
  const arm = page.getByRole("figure", { name: "Armário UBM-01" });
  await expect(arm).toBeVisible();
  await expect(arm.getByRole("link", { name: /SOLICITAÇÃO/ })).toBeVisible();
  await expect(arm.getByRole("link", { name: /RETIRADA/ })).toHaveCount(0);
  // saldo do 900028 (M) na lista de reposição, antes da validação
  const linhaRepor = page.getByRole("row").filter({ hasText: "900028" }).first();
  const saldoDe = async () => Number((await linhaRepor.locator("td").nth(4).innerText()).replace(/\./g, "").replace(",", "."));
  const antes = await saldoDe();

  // etiquetas antigas de retirada: o endereço leva à validação do líder
  await page.goto("/ubm/retirada?u=UBM-01");
  await expect(page).toHaveURL(/visao=Valida.*u=UBM-01/);

  // celular (390 px): a validação cabe na largura; "Veio da UBM" com a quantidade da IW13 grava e a linha some
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ubm?visao=Validação do líder");
  await expect(page.getByRole("heading", { name: "A validar" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  const item = page.getByRole("listitem", { name: /^Material 900028/ });
  await expect(item).toContainText("2,5 M");
  await item.getByRole("button", { name: "Veio da UBM" }).click();
  const form = page.getByRole("form", { name: "Veio da UBM · 900028" });
  await expect(form.getByLabel(/Quantidade que saiu da UBM/)).toHaveValue("2,5");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await form.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("listitem", { name: /^Material 900028/ })).toHaveCount(0);
  await expect(page.getByText("Veio da UBM").filter({ hasText: /^Veio da UBM$/ }).first()).toBeVisible();

  await page.goto("/ubm/solicitacao?u=UBM-01");
  await expect(page.getByRole("form", { name: "Solicitação de material" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

  // o saldo baixou 2,5 M e a retirada aparece como confirmada na validação
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/ubm");
  await expect.poll(saldoDe).toBeCloseTo(antes - 2.5, 2);
  await page.goto("/ubm?visao=Retiradas");
  await expect(page.getByText("Validação do líder (IW13)").first()).toBeVisible();

  // etiquetas: só a de solicitação de cada armário, com o QR em SVG
  await page.goto("/ubm/qr");
  await expect(page.getByRole("region", { name: "Etiqueta SOLICITAÇÃO · UBM-01" }).locator(".qr-ubm svg")).toBeVisible();
  await expect(page.getByRole("region", { name: /Etiqueta RETIRADA/ })).toHaveCount(0);
  expect(await page.locator(".qr-ubm svg").count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("button", { name: "Imprimir todas (A4)" })).toBeVisible();
  const grupo = page.getByRole("group", { name: "Baixar solicitação · UBM-01" }).first();
  await expect(grupo.getByRole("link", { name: "Baixar QR (PNG)" })).toBeVisible();
  const [svg] = await Promise.all([page.waitForEvent("download"), grupo.getByRole("link", { name: "Baixar QR (SVG)" }).click()]);
  expect(svg.suggestedFilename()).toBe("UBM-01_solicitacao_qr.svg");
  const [etiqueta] = await Promise.all([page.waitForEvent("download"), grupo.getByRole("button", { name: "Baixar etiqueta (PNG)" }).click()]);
  expect(etiqueta.suggestedFilename()).toBe("UBM-01_solicitacao_etiqueta.png");
  // os botões também ficam no cadastro dos armários
  await page.goto("/ubm?visao=Armários");
  await expect(page.getByRole("group", { name: "Baixar solicitação · UBM-01" }).getByRole("link", { name: "Baixar QR (SVG)" })).toBeVisible();
  expect(erros).toEqual([]);
});
