import { describe, expect, it } from "vitest";

import { TIPOS_EQUIPAMENTO } from "@/lib/suporte/diagnostico";
import { GUIAS } from "@/lib/suporte/guias";
import {
  MARCADORES,
  MODELOS,
  MODELOS_COM_CENA,
  MODELO_DO_GUIA,
  MODELO_DO_TIPO,
  marcadoresDe,
  pecasComoMarcadores,
  temCena,
} from "@/lib/suporte/modelos3d";
import { PECAS_ROLAMENTO } from "@/app/(app)/suporte/_ui/3d/Rolamento";
import { PECAS_MOTOR } from "@/app/(app)/suporte/_ui/3d/Motor";
import { PECAS_REDUTOR } from "@/app/(app)/suporte/_ui/3d/Redutor";
import { PECAS_CORREIA } from "@/app/(app)/suporte/_ui/3d/Correia";
import { PECAS_BOMBA } from "@/app/(app)/suporte/_ui/3d/Bomba";
import { PECAS_CILINDRO } from "@/app/(app)/suporte/_ui/3d/Cilindro";
import { PECAS_VALVULA } from "@/app/(app)/suporte/_ui/3d/Valvula";
import { PECAS_ESTEIRA } from "@/app/(app)/suporte/_ui/3d/Esteira";
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

describe("modelos 3D: cenas", () => {
  const PECAS_DAS_CENAS: Record<IdModelo, readonly string[]> = {
    rolamento: PECAS_ROLAMENTO,
    motor: PECAS_MOTOR,
    redutor: PECAS_REDUTOR,
    correia: PECAS_CORREIA,
    bomba: PECAS_BOMBA,
    cilindro: PECAS_CILINDRO,
    valvula: PECAS_VALVULA,
    esteira: PECAS_ESTEIRA,
  };

  it("as peças desenhadas em cada cena são exatamente as de MODELOS", () => {
    const ids = (lista: readonly string[]) => [...lista].sort();
    for (const id of MODELOS_ESPERADOS) {
      expect(ids(PECAS_DAS_CENAS[id]), `peças da cena de ${id} fora de MODELOS`).toEqual(
        ids(MODELOS[id].pecas.map((p) => p.id)),
      );
    }
  });

  it("MODELOS_COM_CENA lista só modelos existentes, e temCena confere a lista", () => {
    for (const m of MODELOS_COM_CENA) expect(MODELOS[m]).toBeDefined();
    expect([...MODELOS_COM_CENA].sort()).toEqual([...MODELOS_ESPERADOS].sort());
    for (const id of MODELOS_ESPERADOS) expect(temCena(id), `sem cena: ${id}`).toBe(true);
  });
});

describe("modelos 3D: guias", () => {
  it("todo guia mapeado existe em GUIAS, e aponta para um modelo com cena", () => {
    const ids = new Set(GUIAS.map((g) => g.id));
    for (const [guia, modelo] of Object.entries(MODELO_DO_GUIA)) {
      expect(ids.has(guia), `guia inexistente no mapa 3D: ${guia}`).toBe(true);
      expect(temCena(modelo!), `modelo sem cena para o guia ${guia}`).toBe(true);
    }
  });

  it("as peças de um modelo viram marcadores que apontam para peças existentes", () => {
    for (const id of MODELOS_ESPERADOS) {
      const marcadores = pecasComoMarcadores(id);
      expect(marcadores.map((m) => m.peca)).toEqual(MODELOS[id].pecas.map((p) => p.id));
      for (const m of marcadores) expect(m.explicacao.trim()).not.toBe("");
    }
  });
});

