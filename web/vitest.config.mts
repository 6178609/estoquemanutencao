import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const raiz = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": raiz, "server-only": `${raiz}testes/vazio.ts` } },
  test: { include: ["testes/**/*.test.ts"], environment: "node" },
});
