import { describe, expect, it } from "vitest";

import { normalizarImportacao, SugestaoErro } from "@/lib/dados/fotosSugestao";

describe("importação das fotos sugeridas", () => {
  it("aproveita só material válido e endereços https públicos, até 3 por material", () => {
    const r = normalizarImportacao({
      "100200": {
        sugestoes: [
          { url: "https://exemplo.com.br/a.jpg", pagina: "https://exemplo.com.br/p", titulo: "Peça A" },
          { url: "http://exemplo.com.br/b.jpg", pagina: "", titulo: "sem https" },
          { url: "https://127.0.0.1/c.jpg", pagina: "", titulo: "interno" },
          { url: "https://exemplo.com.br/d.png", titulo: "D" },
          { url: "https://exemplo.com.br/e.webp", titulo: "E" },
          { url: "https://exemplo.com.br/f.webp", titulo: "F" },
        ],
        buscado_em: "2026-01-02T03:04:05Z",
      },
      "../fora": { sugestoes: [{ url: "https://exemplo.com.br/x.jpg" }] },
      "100201": { sugestoes: [{ url: "https://localhost/x.jpg" }] },
    });
    expect(Object.keys(r)).toEqual(["100200"]);
    expect(r["100200"].sugestoes.map((s) => s.titulo)).toEqual(["Peça A", "D", "E"]);
    expect(r["100200"].buscado_em).toBe("2026-01-02T03:04:05.000Z");
  });

  it("recusa arquivo fora do formato", () => {
    expect(() => normalizarImportacao([1, 2])).toThrow(SugestaoErro);
    expect(() => normalizarImportacao("texto")).toThrow(SugestaoErro);
  });
});
