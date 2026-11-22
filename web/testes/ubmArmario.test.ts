import { expect, it } from "vitest";
import { gavetasDe } from "@/app/(app)/ubm/ArmarioVisual";
const l = (d: string, c: string) => ({ codigo: c, descricao: d, um: "PC", saldo: 1, minimo: 1, maximo: 1, repor: false });
it("gavetas", () => {
  const muitas = Array.from({ length: 12 }, (_, i) => [l(`FAM${String.fromCharCode(65 + i)} X`, `${i}a`), l(`FAM${String.fromCharCode(65 + i)} Y`, `${i}b`)]).flat();
  const g = gavetasDe([...muitas, l("DIVERSOS Z", "z1"), l("DIVERSOS W", "z2")]);
  expect(g.length).toBe(9); expect(new Set(g.map((x) => x.nome)).size).toBe(9); expect(g.every((x) => x.itens.length > 0)).toBe(true);
  expect(g.reduce((s, x) => s + x.itens.length, 0)).toBe(26);
  expect(gavetasDe([l("RELE A", "1"), l("RELE B", "2"), l("TUBING", "3")]).map((x) => x.nome)).toEqual(["Relés", "Tubos"]);
});
