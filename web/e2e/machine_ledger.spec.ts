import { expect, test } from "@playwright/test";

import { entrarNaDemo, telaAbriu } from "./apoio";

// Machine Ledger na demonstração: ledgers fictícios (lib/machineLedger/demo.ts); o visitante é editor e grava na memória
const VISOES: [string, RegExp][] = [
  ["Visão geral", /Máquinas com ledger/],
  ["Máquinas", /PRENSA HIDRAULICA 01/],
  ["Pente fino do MRO", /Peças do ledger × peças vinculadas/],
  ["Cruzamentos", /IW13 × ledger/],
  ["Correspondência", /Correspondência ledger/],
  ["Enviar ledger", /Escolher o \.xlsx/],
];

test("machine ledger: sub-abas, detalhe, pente fino com vincular e 390 px (demonstração)", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/machine_ledger");
  for (const [visao, marca] of VISOES) {
    await page.getByRole("link", { name: visao, exact: true }).click();
    await expect(page.getByRole("link", { name: visao, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(marca).first()).toBeVisible();
  }

  // detalhe da máquina: capa, calendário de quebras e RCM
  await telaAbriu(page, "/machine_ledger?visao=M%C3%A1quinas&m=ml-demo0001");
  await expect(page.getByRole("heading", { name: /Calendário de quebras/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /RCM por índice H/ })).toBeVisible();
  await expect(page.getByText("FICTPRESS").first()).toBeVisible();

  // operações e IA06: confirma a operação sugerida da correia e baixa a carga com o número da operação
  await expect(page.getByRole("heading", { name: /Operações e IA06/ })).toBeVisible();
  const correia = page.getByRole("list", { name: "Operações por componente" }).locator("li").filter({ hasText: "CORREIA EM V DO ACIONAMENTO" });
  await expect(correia.getByText(/sugestão alta/)).toBeVisible();
  await correia.getByRole("button", { name: "Confirmar" }).click();
  await expect(correia.getByText("confirmada", { exact: true })).toBeVisible();
  await expect(correia.getByText("vai na IA06")).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Baixar CSV da IA06" }).click()]);
  expect(download.suggestedFilename()).toBe("SAP_IA06_INCLUIR_materiais.csv");
  const csv = await (await import("node:fs/promises")).readFile((await download.path())!, "latin1");
  expect(csv).toMatch(/^X;90000;1;0020;\d+;1;/m);

  // pente fino: os achados aparecem e "Vincular" tira o achado da lista
  await telaAbriu(page, "/machine_ledger?visao=Pente+fino+do+MRO&tipo=faltando");
  const achados = page.getByRole("list", { name: "Achados" }).locator("li");
  const antes = await achados.count();
  expect(antes).toBeGreaterThan(0);
  const primeiro = achados.first();
  const codigo = (await primeiro.locator("b.num").first().textContent())?.trim() ?? "";
  await primeiro.getByRole("button", { name: "Vincular" }).click();
  await expect(achados).toHaveCount(antes - 1);
  await expect(page.getByRole("list", { name: "Achados" }).getByText(codigo, { exact: true })).toHaveCount(0);

  // celular: sem rolagem lateral em nenhuma sub-aba nem no detalhe
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [visao] of VISOES) {
    await telaAbriu(page, `/machine_ledger?visao=${encodeURIComponent(visao)}`);
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sobra, `${visao} sem rolagem lateral`).toBeLessThanOrEqual(1);
  }
  await telaAbriu(page, "/machine_ledger?visao=M%C3%A1quinas&m=ml-demo0001");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  expect(erros).toEqual([]);
});
