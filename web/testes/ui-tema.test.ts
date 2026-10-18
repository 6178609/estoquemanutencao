import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Activity } from "lucide-react";
import { BOTAO_PERIGO, BOTAO_PRIMARIO, FaixaMarca, IconeQuadro, Selo } from "@/components/ui";

// Os componentes compartilhados levam o tema da marca: cores pelos tokens (não pela escala antiga) e botões de 44 px.
describe("componentes compartilhados com o tema da marca", () => {
  it("Selo usa os tokens de status, com texto", () => {
    const html = renderToStaticMarkup(createElement(Selo, { cor: "vermelho", children: "Crítico" }));
    expect(html).toContain("var(--selo-critico-texto)");
    expect(html).toContain("Crítico");
  });

  it("Selo cinza usa o neutro", () => {
    const html = renderToStaticMarkup(createElement(Selo, { cor: "cinza", children: "Sem dados" }));
    expect(html).toContain("var(--selo-neutro-fundo)");
  });

  it("botão principal usa a cor de ação e 44 px", () => {
    expect(BOTAO_PRIMARIO).toContain("bg-tinta");
    expect(BOTAO_PRIMARIO).toContain("h-11");
    expect(BOTAO_PRIMARIO).not.toContain("bg-marca-500");
  });

  it("BOTAO_PERIGO existe com 44 px", () => {
    expect(BOTAO_PERIGO).toContain("h-11");
  });

  it("IconeQuadro com tom tem fundo tingido e ícone com token de cor (com versão escura)", () => {
    const html = renderToStaticMarkup(createElement(IconeQuadro, { icone: Activity, tom: "vermelho" }));
    expect(html).toContain("color-mix");
    expect(html).toContain("var(--icone-vermelho)");
  });

  it("FaixaMarca tem as 7 cores na ordem e é decorativa", () => {
    const html = renderToStaticMarkup(createElement(FaixaMarca));
    const cores = ["#E41824", "#F07818", "#FCB40C", "#A8C024", "#009C48", "#009CD8", "#006CB4"];
    const posicoes = cores.map((c) => html.indexOf(c));
    expect(posicoes.every((p) => p >= 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("nao-imprimir");
  });
});
