import { beforeEach, describe, expect, it, vi } from "vitest";

// leitura do Machine Ledger sem rede: cadastros e bases do SAP simulados (dados fictícios)
const { cads, lerBase } = vi.hoisted(() => ({ cads: {} as Record<string, Record<string, unknown>>, lerBase: vi.fn(async () => ({ dados: [] })) }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/dados/cadastros", () => ({ lerCadastro: vi.fn(async (n: string) => (cads[n] ??= {})), gravarCadastroLote: vi.fn() }));
vi.mock("@/lib/dados/bases", () => ({ lerBase, catalogo: vi.fn(async () => null), estoque: vi.fn(async () => null) }));
vi.mock("@/lib/dados/fonte", () => ({ fonte: () => ({ versoes: async () => new Map() }), FonteErro: class extends Error {} }));
vi.mock("@/lib/dados/consumo", () => ({ consumoMateriais: vi.fn() }));
vi.mock("@/lib/wcm/dados", () => ({ bases: vi.fn() }));
vi.mock("@/lib/auditoria", () => ({ registrar: vi.fn() }));
vi.mock("@/app/(app)/mro/logica", () => ({ aplicarPecas: vi.fn() }));

import * as D from "@/lib/machineLedger/dados";
import type { Indice } from "@/lib/machineLedger/regras";

const indice = (equipamentos: string[]): Indice => ({ id: "ml-teste", arquivo: "x.xlsx", nome: "PRENSA FICT", tipo: "maquina", revisao: "", capa: { maquina: "", fabricante: "",
  modelo: "", area: "", funcao: "" }, equipamentos, origem: "automatica", sugestoes: [], contagens: { componentes: 0, plano: 0, pecas: 0 }, enviadoEm: "", enviadoPor: "",
  confirmadoEm: "", confirmadoPor: "" });

describe("Machine Ledger: leitura das operações", () => {
  beforeEach(() => { lerBase.mockClear(); for (const k of Object.keys(cads)) delete cads[k]; });

  it("sem equipamento ou sem listas enviadas: não lê IW38/IP19/IH08", async () => {
    const a = await D.operacoesDoLedger(indice([]));
    expect(a).toMatchObject({ ops: [], ligadas: [], temListas: false });
    cads["listas_tarefas.json"] = {};
    await D.operacoesDoLedger(indice(["5000001"]));
    expect(lerBase).not.toHaveBeenCalled();
    cads["listas_tarefas.json"] = { "99001|1": { descricao: "LISTA FICT", operacoes: [] } };
    const b = await D.operacoesDoLedger(indice(["5000001"]));
    expect(b.temListas).toBe(true);
    expect(lerBase).toHaveBeenCalled();
  });

  it("listas do cadastro: validadas uma vez por versão do cadastro", async () => {
    cads["listas_tarefas.json"] = { "99001|1": { descricao: "LISTA FICT", operacoes: [] } };
    const a = await D.lerListas(), b = await D.lerListas();
    expect(a).toBe(b);
    cads["listas_tarefas.json"] = { ...cads["listas_tarefas.json"] };
    expect(await D.lerListas()).not.toBe(a);
  });
});
