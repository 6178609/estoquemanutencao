import { describe, expect, it } from "vitest";

import { lerJsonDemo } from "@/lib/dados/demo";
import { basesDemo } from "@/lib/wcm/demo";
import { classeTipo, tiposDe } from "@/lib/wcm/indicadores";
import { hoje } from "@/lib/wcm/util";

describe("demonstração do motor WCM (dados fictícios)", () => {
  it("gera todas as bases no formato do SAP e o preparo reconhece as colunas", () => {
    const b = basesDemo(hoje());
    const n = (x: { dados: unknown[] | null }) => x.dados?.length ?? 0;
    expect(n(b.ordens)).toBeGreaterThan(2000);
    expect(n(b.operacoes)).toBeGreaterThan(n(b.ordens));
    expect(n(b.confirmacoes)).toBeGreaterThan(1000);
    expect(b.notas.dados!.filter((x) => x.quebra).length).toBeGreaterThan(200);
    expect(n(b.equipamentos)).toBe(48);
    expect(n(b.equipe)).toBe(22);
    expect(b.requisicoes.dados!.filter((r) => r.pendente).length).toBe(40);
    const o = b.ordens.dados!;
    expect(new Set(o.map((x) => x.situacao))).toEqual(new Set(["Aberta", "Liberada", "Encerrada sem confirmação", "Concluída"]));
    expect(o.some((x) => x.custoReal > 0 && x.comPlano)).toBe(true);
    expect(o.every((x) => x.setor !== "")).toBe(true);
    expect(n(b.cruas.ip19)).toBeGreaterThan(300);
    expect(n(b.cruas.af)).toBeGreaterThan(20);
  });

  it("usa a classificação real dos tipos de ordem (YM11 a YM20) e cada tipo cai na classe certa", () => {
    const daGestao = Object.fromEntries(Object.entries(lerJsonDemo("tipos_ordem.json") as Record<string, { descricao: string }>)
      .map(([cod, v]) => [cod, v.descricao]));
    const tipos = tiposDe({}, daGestao);
    const classes = Object.fromEntries(Object.keys(tipos).sort().map((cod) => [cod, classeTipo(cod, tipos)]));
    expect(classes).toEqual({
      YM11: "Emergencial", YM12: "Corretiva", YM13: "Preditiva / inspeção", YM14: "Preditiva / inspeção", YM15: "Preventiva",
      YM16: "Melhoria", YM17: "Preditiva / inspeção", YM18: "Lubrificação", YM19: "Preditiva / inspeção", YM20: "Outros",
    });
    const usados = new Set(basesDemo(hoje()).ordens.dados!.map((o) => o.tipo));
    expect([...usados].every((t) => t in tipos)).toBe(true);
    expect(usados.has("YM11") && usados.has("YM13") && usados.has("YM20")).toBe(true);
  });
});
