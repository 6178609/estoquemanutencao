import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Lê o CSS do tema e extrai as variáveis de cada bloco, para testar os valores reais do arquivo.
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function variaveis(corpo: string): Record<string, string> {
  const achados: Record<string, string> = {};
  for (const m of corpo.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) achados[`--${m[1]}`] = m[2].trim();
  return achados;
}

function bloco(padrao: RegExp): Record<string, string> {
  const m = css.match(padrao);
  if (!m) throw new Error(`bloco não encontrado: ${padrao}`);
  return variaveis(m[1]);
}

const claro = bloco(/^:root\s*\{([^}]*)\}/m);
const escuroSistema = bloco(/:root:not\(\[data-tema="claro"\]\)\s*\{([^}]*)\}/);
const escuroManual = bloco(/:root\[data-tema="escuro"\]\s*\{([^}]*)\}/);

const temas = { claro: claro, "escuro (sistema)": escuroSistema, "escuro (manual)": escuroManual };

function canal(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminancia(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function cor(bl: Record<string, string>, nome: string): string {
  const valor = bl[nome];
  if (!valor) throw new Error(`token ausente: ${nome}`);
  return valor;
}

describe("tema da marca", () => {
  it("texto principal e de apoio ≥ 4,5:1 sobre fundo, superfície e superfície-2 (claro e escuro)", () => {
    for (const [nome, bl] of Object.entries(temas)) {
      for (const texto of ["--texto", "--texto-2", "--texto-3"]) {
        for (const fundo of ["--fundo", "--superficie", "--superficie-2"]) {
          const c = contraste(cor(bl, texto), cor(bl, fundo));
          expect(c, `${nome}: ${texto} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("botão principal: --tinta-texto sobre --tinta ≥ 4,5:1", () => {
    for (const [nome, bl] of Object.entries(temas)) {
      const c = contraste(cor(bl, "--tinta-texto"), cor(bl, "--tinta"));
      expect(c, nome).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("menu: --menu-texto e --menu-apoio sobre --menu e --menu-2 ≥ 4,5:1", () => {
    for (const [nome, bl] of Object.entries(temas)) {
      for (const texto of ["--menu-texto", "--menu-apoio"]) {
        for (const fundo of ["--menu", "--menu-2"]) {
          const c = contraste(cor(bl, texto), cor(bl, fundo));
          expect(c, `${nome}: ${texto} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("cada selo: -texto sobre -fundo ≥ 4,5:1", () => {
    for (const [nome, bl] of Object.entries(temas)) {
      for (const selo of ["bom", "atencao", "serio", "critico", "info", "neutro"]) {
        const c = contraste(cor(bl, `--selo-${selo}-texto`), cor(bl, `--selo-${selo}-fundo`));
        expect(c, `${nome}: selo ${selo}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("cor dos ícones de cada tom ≥ 3:1 sobre --superficie (claro e escuro)", () => {
    for (const [nome, bl] of Object.entries(temas)) {
      for (const tom of ["verde", "azul", "ciano", "lima", "amarelo", "laranja", "vermelho", "celeste"]) {
        const c = contraste(cor(bl, `--icone-${tom}`), cor(bl, "--superficie"));
        expect(c, `${nome}: ícone ${tom}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("botão principal deixou de ser preto", () => {
    expect(claro["--tinta"].toLowerCase()).toBe("#007a38");
  });

  it("os dois blocos escuros têm os mesmos valores", () => {
    expect(escuroSistema).toEqual(escuroManual);
  });
});
