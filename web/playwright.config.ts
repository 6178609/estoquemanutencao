import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de ponta a ponta no navegador, em modo demonstração (sem repositório de dados: dados fictícios).
 * Sobem o site já compilado (`next build` antes) e passam pelas telas principais. No CI: .github/workflows/web.yml.
 * Localmente, com o Chromium já instalado em outro lugar: PW_CHROMIUM=/caminho/do/chromium npm run e2e
 */
const porta = Number(process.env.PORTA_E2E || 3100);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${porta}`,
    trace: "retain-on-failure",
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM } } : {}),
  },
  projects: [
    { name: "computador", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /celular/ },
    { name: "celular", use: { ...devices["Pixel 7"] }, testMatch: /celular/ },
  ],
  webServer: {
    command: `npx next start -p ${porta}`,
    url: `http://localhost:${porta}/entrar`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    // demonstração: sem as variáveis do repositório de dados e do Supabase
    env: { DADOS_GH_REPO: "", DADOS_GH_TOKEN: "", DADOS_PASTA: "", SUPABASE_URL: "", SUPABASE_SECRET_KEY: "" },
  },
});
