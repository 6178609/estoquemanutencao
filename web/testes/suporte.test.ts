import { describe, expect, it } from "vitest";

import { GRUPOS } from "@/lib/navegacao";
import { AREAS, GUIAS, buscarEm, buscarGuias, guiaPorId } from "@/lib/suporte/guias";
import type { Guia } from "@/lib/suporte/guias";
import { TIPOS_EQUIPAMENTO, diagnosticar } from "@/lib/suporte/diagnostico";

const ROTAS = new Set(GRUPOS.flatMap((g) => g.abas.map((a) => a.rota)));
const IDS_AREA = new Set<string>(AREAS.map((a) => a.id));
const SECOES = ["sintomas", "causas", "verificar", "acoes", "praticas", "texto", "links"] as const;

describe("guias técnicos: conteúdo", () => {
  it("têm id único, área válida, título e resumo", () => {
    const ids = GUIAS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GUIAS) {
      expect(IDS_AREA.has(g.area), `área inválida em ${g.id}`).toBe(true);
      expect(g.titulo.trim(), `título vazio em ${g.id}`).not.toBe("");
      expect(g.resumo.trim(), `resumo vazio em ${g.id}`).not.toBe("");
    }
  });

  it("têm ao menos uma seção com conteúdo", () => {
    for (const g of GUIAS) {
      const comConteudo = SECOES.some((s) => {
        const valor = g[s];
        return Array.isArray(valor) ? valor.length > 0 : false;
      });
      expect(comConteudo, `sem seção em ${g.id}`).toBe(true);
    }
  });

  it("há ao menos 32 guias e pelo menos 3 por área", () => {
    expect(GUIAS.length).toBeGreaterThanOrEqual(32);
    for (const a of AREAS) {
      const n = GUIAS.filter((g) => g.area === a.id).length;
      expect(n, `área ${a.id} com poucos guias`).toBeGreaterThanOrEqual(3);
    }
  });

  it("as áreas são as oito da especificação, com título e descrição", () => {
    expect(AREAS.map((a) => a.titulo)).toEqual([
      "Mecânica", "Lubrificação", "Elétrica", "Pneumática e hidráulica",
      "Segurança", "Métodos e ferramentas", "PCM e SAP", "Indicadores",
    ]);
    for (const a of AREAS) expect(a.descricao.trim()).not.toBe("");
  });

  it("todo link interno aponta para uma rota existente em lib/navegacao.ts", () => {
    for (const g of GUIAS) {
      for (const l of g.links ?? []) {
        expect(ROTAS.has(l.rota), `rota inexistente "${l.rota}" em ${g.id}`).toBe(true);
        expect(l.rotulo.trim()).not.toBe("");
      }
    }
  });
});

describe("busca de guias", () => {
  it('"ROLAMENTO" acha o guia de rolamentos em primeiro', () => {
    const r = buscarGuias("ROLAMENTO");
    expect(r[0].guia.id).toBe("rolamentos");
  });

  it("sem acento e sem caixa: \"rolamento\" e \"ROLAMENTOS\" acham o mesmo guia", () => {
    expect(buscarGuias("rolamento")[0].guia.id).toBe("rolamentos");
    expect(buscarGuias("ROLAMENTOS")[0].guia.id).toBe("rolamentos");
    expect(buscarGuias("LUBRIFICAÇÃO")[0].guia.area).toBe("lubrificacao");
    expect(buscarGuias("lubrificacao")[0].guia.area).toBe("lubrificacao");
  });

  it("vazio devolve todos os guias, na ordem de GUIAS, com nota 0", () => {
    const r = buscarGuias("");
    expect(r.map((x) => x.guia.id)).toEqual(GUIAS.map((g) => g.id));
    expect(r.every((x) => x.nota === 0)).toBe(true);
  });

  it("filtra pela área quando informada", () => {
    const r = buscarGuias("", "eletrica");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.guia.area === "eletrica")).toBe(true);
  });

  it("prioriza o título sobre o corpo do texto", () => {
    const todos = buscarGuias("");
    const titulo = todos.find((x) => x.guia.titulo.toLowerCase().includes("rolamento"));
    expect(titulo).toBeDefined();
    const r = buscarGuias("rolamento");
    const posTitulo = r.findIndex((x) => x.guia.id === titulo!.guia.id);
    expect(posTitulo).toBe(0);
    expect(r[0].nota).toBeGreaterThan(0);
  });

  it("plural na consulta acha o singular do texto (CADEIAS × cadeia)", () => {
    const ficticio: Guia[] = [
      { id: "ficticio", area: "mecanica", titulo: "Lubrificador de cadeia", resumo: "Cuidados com a cadeia.",
        palavras: ["cadeia"], texto: ["Verificar a cadeia de transmissão."] },
    ];
    expect(buscarEm(ficticio, "CADEIAS")[0]?.guia.id).toBe("ficticio");
    expect(buscarEm(ficticio, "cadeias transmissao")[0]?.guia.id).toBe("ficticio");
  });

  it("consulta sem resultado devolve lista vazia", () => {
    expect(buscarGuias("xyzzyqwerty")).toEqual([]);
  });

  it("guiaPorId acha o guia ou devolve undefined", () => {
    expect(guiaPorId("rolamentos")?.id).toBe("rolamentos");
    expect(guiaPorId("nao-existe")).toBeUndefined();
  });
});

describe("diagnóstico guiado: conteúdo", () => {
  const TIPOS_ESPERADOS = [
    "motor_eletrico", "rolamento_mancal", "redutor", "correia_polia", "bomba",
    "cilindro_pneumatico", "valvula_solenoide", "unidade_hidraulica", "inversor_frequencia",
    "painel_comando", "compressor", "esteira_transportador", "aquecimento_resistencia", "sensor",
  ];
  const IDS_GUIA = new Set(GUIAS.map((g) => g.id));

  it("cobre os 14 tipos de equipamento da especificação, com ids únicos", () => {
    expect(TIPOS_EQUIPAMENTO.map((t) => t.id).sort()).toEqual([...TIPOS_ESPERADOS].sort());
  });

  it("cada tipo tem área válida, título e ao menos 3 sintomas", () => {
    for (const t of TIPOS_EQUIPAMENTO) {
      expect(IDS_AREA.has(t.area), `área inválida em ${t.id}`).toBe(true);
      expect(t.titulo.trim()).not.toBe("");
      expect(t.sintomas.length, `${t.id} com menos de 3 sintomas`).toBeGreaterThanOrEqual(3);
      const ids = t.sintomas.map((s) => s.id);
      expect(new Set(ids).size, `sintoma repetido em ${t.id}`).toBe(ids.length);
    }
  });

  it("todo sintoma de tipo elétrico ou de fluidos tem segurança (seguranca)", () => {
    for (const t of TIPOS_EQUIPAMENTO.filter((x) => x.area === "eletrica" || x.area === "fluidos")) {
      for (const s of t.sintomas) {
        expect(s.seguranca?.trim(), `sem segurança em ${t.id}/${s.id}`).toBeTruthy();
      }
    }
  });

  it("cada sintoma tem ao menos 2 causas, 2 verificações e um guia existente", () => {
    for (const t of TIPOS_EQUIPAMENTO) {
      for (const s of t.sintomas) {
        const onde = `${t.id}/${s.id}`;
        expect(s.titulo.trim(), `título vazio em ${onde}`).not.toBe("");
        expect(s.causas.length, `causas em ${onde}`).toBeGreaterThanOrEqual(2);
        expect(s.verificar.length, `verificações em ${onde}`).toBeGreaterThanOrEqual(2);
        expect(s.guias.length, `sem guias em ${onde}`).toBeGreaterThanOrEqual(1);
        for (const g of s.guias) {
          expect(IDS_GUIA.has(g), `guia inexistente "${g}" em ${onde}`).toBe(true);
        }
      }
    }
  });
});

describe("diagnóstico guiado: consulta", () => {
  it("devolve o sintoma quando o tipo e o sintoma existem", () => {
    const tipo = TIPOS_EQUIPAMENTO[0];
    const s = tipo.sintomas[0];
    expect(diagnosticar(tipo.id, s.id)).toEqual(s);
  });

  it("devolve null para tipo ou sintoma desconhecidos", () => {
    expect(diagnosticar("xyz", "a")).toBeNull();
    expect(diagnosticar(TIPOS_EQUIPAMENTO[0].id, "xyz")).toBeNull();
  });
});
