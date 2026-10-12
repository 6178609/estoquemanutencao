import { describe, expect, it } from "vitest";

import { basesDemo } from "@/lib/wcm/demo";
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
});
