import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Activity } from "lucide-react";
import { BOTAO_COMPACTO, BOTAO_PERIGO, BOTAO_PRIMARIO, FaixaMarca, IconeQuadro, Kpi, Pilula, Selo } from "@/components/ui";
import { Campo, Seletor } from "@/components/Campos";

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

  it("BOTAO_COMPACTO tem o visual do primário em 36 px (área de toque garantida pelo contexto)", () => {
    expect(BOTAO_COMPACTO).toContain("bg-tinta");
    expect(BOTAO_COMPACTO).toContain("h-9");
    expect(BOTAO_COMPACTO).toContain("min-h-9");
  });

  it("Pilula com href tem alvo de toque de 44 px", () => {
    const html = renderToStaticMarkup(createElement(Pilula, { href: "/estoque", children: "4.093 materiais" }));
    expect(html).toContain("min-h-11");
    expect(html).toContain("inline-flex");
    expect(html).toContain("items-center");
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

  it("BOTAO_COMPACTO usa a fonte de destaque, como o primário", () => {
    expect(BOTAO_COMPACTO).toContain("font-display");
  });
});

// Indicador com status (selo) e meta; sem eles, o markup é o de antes.
describe("Kpi com status e meta", () => {
  it("renderiza o selo de status e a meta abaixo do valor", () => {
    const html = renderToStaticMarkup(createElement(Kpi, { rotulo: "Backlog", valor: "120", status: { cor: "vermelho", texto: "Crítico" }, meta: "Meta: 80" }));
    expect(html).toContain("Crítico");
    expect(html).toContain("var(--selo-critico-texto)");
    expect(html).toContain("Meta: 80");
    expect(html).toContain("text-texto-3 text-[12.5px]");
    expect(html.indexOf("Crítico")).toBeGreaterThan(html.indexOf("120"));
  });

  it("sem status e meta, o markup é igual ao de antes (sem a linha extra)", () => {
    const html = renderToStaticMarkup(createElement(Kpi, { rotulo: "R", valor: "1", detalhe: "d" }));
    expect(html).toBe('<div class="rounded-cartao border border-borda bg-superficie p-5 transition hover:border-borda-forte"><div class="text-[13.5px] font-medium text-texto-2">R</div><div class="num mt-1.5 font-display text-[32px] font-medium leading-none tracking-[-0.03em]">1</div><div class="mt-2 text-[12.5px] leading-snug text-texto-3">d</div></div>');
  });
});

// Campos com erro: borda crítica, aria-invalid e o texto do erro ligado ao campo por aria-describedby.
describe("campos com erro", () => {
  it("Campo com erro marca aria-invalid e mostra o texto do erro", () => {
    const html = renderToStaticMarkup(createElement(Campo, { rotulo: "Quantidade", name: "qtd", erro: "Informe um número" }));
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("Informe um número");
    expect(html).toContain("border-[var(--selo-critico-texto)]");
    expect(html).toContain("aria-describedby=");
  });

  it("o span do erro tem o id apontado por aria-describedby", () => {
    const html = renderToStaticMarkup(createElement(Campo, { rotulo: "Quantidade", name: "qtd", erro: "Informe um número" }));
    const id = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
  });

  it("a dica some quando há erro", () => {
    const html = renderToStaticMarkup(createElement(Campo, { rotulo: "Quantidade", name: "qtd", dica: "Só inteiros", erro: "Inválido" }));
    expect(html).not.toContain("Só inteiros");
  });

  it("Seletor com erro marca aria-invalid e mostra o erro", () => {
    const html = renderToStaticMarkup(createElement(Seletor, { rotulo: "Tipo", name: "tipo", opcoes: { a: "A" }, erro: "Escolha um tipo" }));
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("Escolha um tipo");
  });

  it("Campo sem erro não tem aria-invalid nem aria-describedby (markup igual ao de antes)", () => {
    const html = renderToStaticMarkup(createElement(Campo, { rotulo: "Nome do item", dica: "x", name: "nome" }));
    expect(html).toBe('<label class="block"><span class="mb-1.5 block text-[13px] font-semibold text-texto">Nome do item</span><input class="h-11 w-full rounded-xl border border-borda-forte bg-superficie px-3 text-[15px] transition placeholder:text-texto-3 focus:border-[var(--acao)] disabled:opacity-50" name="nome"/><span class="mt-1 block text-[12px] text-texto-3">x</span></label>');
  });
});
