import { expect, test } from "@playwright/test";

import { entrarNaDemo, telaAbriu } from "./apoio";

// imagem PNG fictícia de 1×1 ponto (nenhum dado real)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const foto = (nome: string) => ({ name: nome, mimeType: "image/png", buffer: PNG });

test("cadastro material: lançar, aprovar, chegar e validar (demonstração)", async ({ page }) => {
  const erros = await entrarNaDemo(page);
  await telaAbriu(page, "/cadastro_material");
  for (const k of ["Aguardando almoxarifado", "Aguardando chegada", "Aguardando PCM", "Concluídos no mês"])
    await expect(page.getByText(k, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Planilha/ })).toBeVisible();

  // lançar (descrição única: a demonstração guarda os pedidos na memória do servidor)
  const descricao = `Acoplamento de teste ${Date.now()}`;
  await page.getByRole("button", { name: "Novo pedido" }).click();
  const form = page.getByRole("form", { name: "Novo pedido" });
  await form.getByLabel("Descrição do material").fill(descricao);
  await form.getByLabel("Número SAP").fill("9999901");
  await expect(form.getByText(/Código não encontrado no catálogo|Catálogo:/)).toBeVisible();
  await form.getByLabel("Equipamento").fill("PRENSA-01");
  await form.getByLabel(/Foto do material/).setInputFiles(foto("pedido.png"));
  await form.getByRole("button", { name: "Lançar pedido" }).click();
  await expect(page.getByText("Pedido lançado.")).toBeVisible();

  const cartao = page.getByRole("listitem").filter({ has: page.getByText(descricao, { exact: true }) });
  await expect(cartao).toHaveCount(1);
  await expect(cartao.getByText("Aguardando almoxarifado", { exact: true })).toBeVisible();
  await expect(cartao.getByRole("img", { name: descricao }).first()).toBeVisible();

  // almoxarifado aprova
  await cartao.getByRole("button", { name: "Aprovar" }).click();
  await expect(cartao.getByText("Aguardando chegada", { exact: true })).toBeVisible();

  // almoxarifado marca a chegada com a foto do material recebido
  await cartao.getByRole("button", { name: "Chegou" }).click();
  await cartao.getByLabel(/Foto do material recebido/).setInputFiles(foto("chegada.png"));
  await cartao.getByRole("button", { name: "Confirmar chegada" }).click();
  await expect(cartao.getByText("Aguardando PCM", { exact: true })).toBeVisible();
  await expect(cartao.getByRole("img", { name: `${descricao} (chegada)` })).toBeVisible();

  // PCM valida
  await cartao.getByRole("button", { name: "Validar" }).click();
  await expect(cartao.getByText("Concluído", { exact: true })).toBeVisible();
  await expect(cartao.getByRole("button", { name: "Validar" })).toHaveCount(0);

  // celular: a aba abre sem rolagem lateral
  await page.setViewportSize({ width: 390, height: 844 });
  await telaAbriu(page, "/cadastro_material");
  const largura = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(largura).toBeLessThanOrEqual(1);
  expect(erros).toEqual([]);
});
