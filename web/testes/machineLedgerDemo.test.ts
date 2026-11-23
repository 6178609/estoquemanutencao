import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { dadosDemo } from "@/lib/dados/demo";
import { cadastrosLedgerDemo } from "@/lib/machineLedger/demo";

describe("Machine Ledger: demonstração", () => {
  it("listas de tarefas fictícias usam estratégia de teste (nada que pareça real)", () => {
    const { cadastros } = cadastrosLedgerDemo(dadosDemo().catalogo, dadosDemo().estoque);
    const s = JSON.stringify(cadastros);
    expect(s).toMatch(/YPMTST/);
    expect(s).not.toMatch(/YPM\d/);
  });
});
