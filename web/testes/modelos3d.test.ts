import { describe, expect, it } from "vitest";

import { TIPOS_EQUIPAMENTO } from "@/lib/suporte/diagnostico";
import { MARCADORES, MODELOS, MODELO_DO_TIPO, marcadoresDe } from "@/lib/suporte/modelos3d";
import type { IdModelo } from "@/lib/suporte/modelos3d";

const TIPOS_COM_MODELO = [
  "rolamento_mancal",
  "motor_eletrico",
  "redutor",
  "correia_polia",
  "bomba",
  "cilindro_pneumatico",
  "valvula_solenoide",
  "esteira_transportador",
];

const MODELOS_ESPERADOS: IdModelo[] = ["rolamento", "motor", "redutor", "correia", "bomba", "cilindro", "valvula", "esteira"];

describe("modelos 3D: estrutura", () => {
  it("há os 8 modelos esperados, cada um com título e peças", () => {
    expect(Object.keys(MODELOS).sort()).toEqual([...MODELOS_ESPERADOS].sort());
    for (const id of MODELOS_ESPERADOS) {
      expect(MODELOS[id].titulo.trim(), `título vazio em ${id}`).not.toBe("");
      expect(MODELOS[id].pecas.length, `sem peças em ${id}`).toBeGreaterThan(0);
    }
  });

  it("ids de peça são únicos dentro de cada modelo e têm nome", () => {
    for (const id of MODELOS_ESPERADOS) {
      const ids = MODELOS[id].pecas.map((p) => p.id);
      expect(new Set(ids).size, `peça repetida em ${id}`).toBe(ids.length);
      for (const p of MODELOS[id].pecas) {
        expect(p.id).toMatch(/^[a-z_]+$/);
        expect(p.nome.trim(), `nome vazio em ${id}.${p.id}`).not.toBe("");
      }
    }
  });

  it("MODELO_DO_TIPO liga exatamente os 8 tipos a um modelo, todos ids reais do diagnóstico", () => {
    const tiposReais = new Set(TIPOS_EQUIPAMENTO.map((t) => t.id));
    expect(Object.keys(MODELO_DO_TIPO).sort()).toEqual([...TIPOS_COM_MODELO].sort());
    for (const tipo of Object.keys(MODELO_DO_TIPO)) {
      expect(tiposReais.has(tipo), `tipo ${tipo} não existe em TIPOS_EQUIPAMENTO`).toBe(true);
      expect(MODELOS[MODELO_DO_TIPO[tipo]!]).toBeDefined();
    }
  });

  it("marcadoresDe devolve lista vazia para tipo ou sintoma inexistente", () => {
    expect(marcadoresDe("tipo_que_nao_existe", "ruido")).toEqual([]);
    expect(marcadoresDe("rolamento_mancal", "sintoma_que_nao_existe")).toEqual([]);
    expect(marcadoresDe("unidade_hidraulica", "aquecimento")).toEqual([]);
  });
});

describe("modelos 3D: marcadores", () => {
  it("todo sintoma dos 8 tipos com modelo tem de 1 a 4 marcadores", () => {
    for (const tipo of TIPOS_COM_MODELO) {
      const t = TIPOS_EQUIPAMENTO.find((x) => x.id === tipo)!;
      for (const s of t.sintomas) {
        const lista = MARCADORES[tipo]?.[s.id];
        expect(lista, `sem marcadores: ${tipo} / ${s.id}`).toBeDefined();
        expect(lista!.length, `quantidade fora de 1–4: ${tipo} / ${s.id}`).toBeGreaterThanOrEqual(1);
        expect(lista!.length, `quantidade fora de 1–4: ${tipo} / ${s.id}`).toBeLessThanOrEqual(4);
        expect(marcadoresDe(tipo, s.id)).toEqual(lista);
      }
    }
  });

  it("cada marcador aponta para uma peça que existe no modelo do tipo", () => {
    for (const tipo of TIPOS_COM_MODELO) {
      const modelo = MODELOS[MODELO_DO_TIPO[tipo]!];
      const pecas = new Set(modelo.pecas.map((p) => p.id));
      for (const [sintoma, lista] of Object.entries(MARCADORES[tipo] ?? {})) {
        for (const m of lista) {
          expect(pecas.has(m.peca), `peça inexistente "${m.peca}" em ${tipo} / ${sintoma}`).toBe(true);
        }
      }
    }
  });

  it("marcadores só existem para tipos e sintomas reais, com texto preenchido", () => {
    for (const [tipo, porSintoma] of Object.entries(MARCADORES)) {
      expect(TIPOS_COM_MODELO.includes(tipo), `marcador de tipo sem modelo: ${tipo}`).toBe(true);
      const t = TIPOS_EQUIPAMENTO.find((x) => x.id === tipo)!;
      for (const [sintoma, lista] of Object.entries(porSintoma)) {
        expect(t.sintomas.some((s) => s.id === sintoma), `sintoma inexistente: ${tipo} / ${sintoma}`).toBe(true);
        for (const m of lista) {
          expect(m.titulo.trim()).not.toBe("");
          expect(m.explicacao.trim()).not.toBe("");
        }
      }
    }
  });
});
