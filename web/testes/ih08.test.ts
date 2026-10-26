import { describe, expect, it } from "vitest";

import { inventario } from "@/lib/wcm/ativos";
import { prepararEquipamentos } from "@/lib/wcm/preparo";
import { dia } from "@/lib/wcm/util";

/** Só dados fictícios. */
const COLS = ["Equipamento", "Denominação do objeto técnico", "Campo de ordenação", "Código ABC", "Denominação do loc.instalação",
  "Local de instalação", "Localização", "Centro custo", "Centro trab.respons.", "Status do sistema", "Status usuário", "Nº inventário",
  "Equipamento superior"];
const cru = [
  ["41000001", "PRENSA TESTE", "PRE-01", "A", "LINHA TESTE", "ALPA-X-1", "GAL1", "CC001", "COMPONEN", "AEQS", "PROD", "123", ""],
  ["41000002", "MOTOR TESTE", "XX", "B", "LINHA TESTE", "ALPA-X-1", "GAL1", "CC001", "COMPONEN", "INAT LIDI MREL", "PROD", "", "41000001"],
  ["41000003", "BOMBA TESTE", "", "C", "", "", "GAL2", "CC002", "UTILIDAD", "AEQS INAT", "", "", ""],
  ["41000004", "ESTEIRA TESTE", "", "C", "", "", "GAL2", "CC002", "MONTAGEM", "MONT", "PVEX", "", "41000001"],
].map((l) => Object.fromEntries(COLS.map((c, i) => [c, l[i]])));

describe("IH08 completo", () => {
  const eq = prepararEquipamentos(cru, false);

  it("lê as colunas novas", () => {
    expect(eq[0]).toMatchObject({ equipamento: "41000001", local: "ALPA-X-1", codigoAbc: "A", campo: "PRE-01", centroCusto: "CC001",
      centroTrabalho: "COMPONEN", statusSistema: "AEQS", statusUsuario: "PROD", inventario: "123", inativo: false, desativado: false });
    expect(eq[3].superior).toBe("41000001");
  });

  it("INAT ou MREL no status do sistema = inativo (e desativado)", () => {
    expect(eq.map((e) => e.inativo)).toEqual([false, true, true, false]);
    expect(eq[1].desativado).toBe(true);
  });

  it("o inventário de ativos tira os inativos, mesmo com ordem antiga", () => {
    const ordens = [{ equipChave: "041000002", situacao: "Concluída" as const, objeto: "MOTOR TESTE", localizacao: "GAL1", local: "", centroTrabalho: "X",
      data: dia(2026, 1, 10), custoReal: 100, comPlano: false, plano: "" }];
    const inv = inventario(dia(2026, 10, 1)!, { equip: eq, ordens });
    expect(inv.map((x) => x.codigo).sort()).toEqual(["41000001", "41000004"]);
    expect(inv.find((x) => x.codigo === "41000004")).toMatchObject({ centro: "MONTAGEM", centroCusto: "CC002", statusUsuario: "PVEX", superior: "41000001" });
  });

  it("denominação do objeto, mesmo com o local antes no arquivo", () => {
    const x = prepararEquipamentos([{ "Denominação do loc.instalação": "LINHA", Equipamento: "1", "Denominação do objeto técnico": "PRENSA",
      "Local de instalação": "ALPA-1" }], false);
    expect(x[0]).toMatchObject({ denominacao: "PRENSA", local: "ALPA-1" });
  });

  it("posição vazia (VAGO) também sai", () => {
    const x = prepararEquipamentos([{ Equipamento: "7", "Denominação do objeto técnico": "VAGO", "Status do sistema": "AEQS" },
      { Equipamento: "8", "Denominação do objeto técnico": "Vago 02", "Status do sistema": "AEQS" },
      { Equipamento: "9", "Denominação do objeto técnico": "VAGONETA", "Status do sistema": "AEQS" }], false);
    expect(x.map((e) => e.inativo)).toEqual([true, true, false]);
  });

  it("export antigo (sem as colunas novas) continua funcionando", () => {
    const antigo = prepararEquipamentos([{ Equipamento: "41000009", "Denominação do objeto técnico": "MAQUINA X (DESATIVADA)" }], false);
    expect(antigo[0]).toMatchObject({ inativo: false, desativado: true, campo: "", centroCusto: "" });
  });
});
