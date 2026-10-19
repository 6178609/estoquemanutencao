import { expect, type Page } from "@playwright/test";

/** Entra na demonstração e devolve a lista de erros da página (exceções e bloqueios da CSP) para conferir no fim. */
export async function entrarNaDemo(page: Page): Promise<string[]> {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`erro na página: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy|Refused to/i.test(m.text())) erros.push(`CSP: ${m.text()}`);
  });
  await page.goto("/entrar");
  await page.getByRole("button", { name: /demonstração/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"));
  return erros;
}

/** A tela abriu (tem título e não caiu na tela de erro). */
export async function telaAbriu(page: Page, caminho: string) {
  const r = await page.goto(caminho);
  expect(r?.status(), `${caminho} respondeu`).toBeLessThan(400);
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.getByText("Esta tela não carregou")).toHaveCount(0);
}
