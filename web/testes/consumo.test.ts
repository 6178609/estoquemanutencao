import { describe, expect, it } from "vitest";

import { juntarSugestoes, MAX_ATIVOS_CONSUMO, sugestoesPorConsumo, type Sugestao } from "@/app/(app)/mro/alocacao";
import { identificar } from "@/lib/leitura/tipos";
import { consumoDe, prepararConsumo } from "@/lib/wcm/consumo";
import { dataBr } from "@/lib/wcm/util";

// dados fictícios no formato do export IW13 (as duas colunas UM ganham sufixo na leitura)
const COLS = ["Ordem", "Material", "Reservado", "UM", "Texto breve material", "Centro de trabalho", "Equipamento", "Data de lançamento",
  "Tomados", "UM.1", "Local de instalação"];
const l = (v: string[]) => Object.fromEntries(COLS.map((c, i) => [c, v[i] ?? ""]));
const LINHAS = [
  l(["900001", "000000000000123456", "2", "UN", "ROLAMENTO TESTE 6205", "MEC", "10000101", "10/01/2025", "2", "UN", "LOC-1"]),
  l(["900002", "123456", "1", "UN", "ROLAMENTO TESTE 6205", "MEC", "10000101", "05/03/2025", "1", "UN", "LOC-1"]),
  l(["900002", "123456", "1", "UN", "ROLAMENTO TESTE 6205", "MEC", "10000101", "05/03/2025", "1", "UN", "LOC-1"]), // mesma ordem
  l(["900003", "777", "4", "PÇ", "CORREIA TESTE A40", "MEC", "10000101", "", "0", "", "LOC-1"]), // só reserva
  l(["900004", "888", "1", "L", "OLEO TESTE", "MEC", "10000102", "20/06/2025", "1,5", "L", "LOC-1"]), // subconjunto
  l(["900005", "", "0", "", "", "UTIL", "10000101", "", "0", "UA", "LOC-1"]), // sem material
  l(["900006", "999", "1", "UN", "PECA SEM EQUIP", "MEC", "", "01/01/2025", "1", "UN", "LOC-2"]), // sem equipamento
];

describe("IW13: consumo real de materiais nas ordens", () => {
  it("reconhece o export pelos cabeçalhos", () => {
    expect(identificar(COLS)).toBe("iw13");
    // a IW38 continua IW38
    expect(identificar(["Ordem", "Status do sistema", "Tipo de ordem", "Equipamento"])).toBe("iw38");
  });

  it("agrupa por equipamento e material, conta ordens distintas e separa a reserva", () => {
    const c = prepararConsumo(LINHAS);
    expect(c.linhas).toBe(5); // sem material ou sem equipamento ficam de fora
    const it = c.porEquipamento.get("10000101")!;
    const rol = it.find((x) => x.material === "123456")!;
    expect(rol.ordens).toBe(2);
    expect(rol.quantidade).toBe(4);
    expect(rol.um).toBe("UN");
    expect(dataBr(rol.ultima)).toBe("05/03/2025");
    const cor = it.find((x) => x.material === "777")!;
    expect(cor.ordens).toBe(0);
    expect(cor.reservas).toBe(1);
    expect(it[0].material).toBe("123456"); // mais usado primeiro
    expect(c.porEquipamento.get("10000102")![0].quantidade).toBe(1.5);
    expect(dataBr(c.de)).toBe("10/01/2025");
    expect(dataBr(c.ate)).toBe("20/06/2025");
  });

  it("soma a máquina com os subconjuntos", () => {
    const c = prepararConsumo(LINHAS);
    const tudo = consumoDe(c, ["10000101", "0010000102"]);
    expect(tudo.map((x) => x.material).sort()).toEqual(["123456", "777", "888"]);
    expect(consumoDe(null, ["10000101"])).toEqual([]);
  });

  it("sugere vínculo só do que foi retirado, para ativo válido, material conhecido e ainda não vinculado", () => {
    const c = prepararConsumo(LINHAS);
    const s = sugestoesPorConsumo(c, (k) => k === "10000101", (m) => m !== "999", () => new Set(), dataBr);
    expect(s.map((x) => x.material)).toEqual(["123456"]); // a correia só tem reserva; o 10000102 não é válido
    expect(s[0].nivel).toBe("consumo");
    expect(s[0].motivo).toContain("2 ordens");
    expect(s[0].motivo).toContain("05/03/2025");
    const ja = sugestoesPorConsumo(c, () => true, () => true, () => new Set(["000123456"]));
    expect(ja.map((x) => x.material)).toEqual(["888"]);
  });

  it("material de uso geral (retirado para muitos equipamentos) não vai no lote: vira confiança baixa", () => {
    const linhas = Array.from({ length: MAX_ATIVOS_CONSUMO + 1 }, (_, i) =>
      l([`95${i}`, "555", "1", "UN", "GRAXA TESTE", "MEC", `2000${i}`, "01/02/2025", "1", "UN", "LOC"]));
    const c = prepararConsumo([...linhas, LINHAS[0]]);
    expect(c.ativosPorMaterial.get("555")).toBe(MAX_ATIVOS_CONSUMO + 1);
    const s = sugestoesPorConsumo(c, () => true, () => true);
    expect(s.filter((x) => x.material === "555").every((x) => x.nivel === "baixa" && x.motivo.includes("uso geral"))).toBe(true);
    expect(s.find((x) => x.material === "123456")?.nivel).toBe("consumo");
  });

  it("junta consumo e texto sem repetir o par, com os códigos da lista e da MB52", () => {
    const cons: Sugestao[] = [{ ativo: "10000101", material: "123456", descricao: "ROL", nivel: "consumo", pontos: 100, motivo: "IW13" }];
    const txt: Sugestao[] = [{ ativo: "0010000101", material: "000123456", descricao: "ROL", nivel: "alta", pontos: 90, motivo: "texto" },
      { ativo: "0010000101", material: "777", descricao: "COR", nivel: "media", pontos: 65, motivo: "texto" }];
    const r = juntarSugestoes(cons, txt, (k) => `00${k}`, (m) => `000${m}`);
    expect(r.map((x) => `${x.ativo}|${x.material}|${x.nivel}`)).toEqual(["0010000101|000123456|consumo", "0010000101|777|media"]);
  });
});
