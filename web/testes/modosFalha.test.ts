import { describe, expect, it } from "vitest";

import { analisarModos, comPalavra, palavras, tamanhoNuvem } from "@/lib/wcm/modosFalha";
import type { Confirmacao } from "@/lib/wcm/preparo";
import { dia } from "@/lib/wcm/util";

// apontamentos fictícios
const c = (ordem: string, texto: string, tipo = "YM11", data = dia(2026, 3, 10)): Confirmacao => ({
  np: "1", nome: "Pessoa Fictícia", ordem, operacao: "0010", statusSistema: "CONF", unidade: "H", centroTrabalho: "MEC", atividade: "",
  tipo, equipamento: "100", texto, causaDesvio: "", horas: 1, data, setor: "",
});

describe("modos de causa das quebras (YM11, texto da IW47)", () => {
  it("normaliza: sem acento, maiúsculas, sem números e sem palavras vazias", () => {
    expect(palavras("Realizada a troca do rolamento 6205 – lubrificação ok")).toEqual(["ROLAMENTO", "LUBRIFICACAO"]);
  });

  it("conta por ordem (não por vez), junta plural e ignora as ordens que não são YM11", () => {
    const conf = [
      c("1", "Troca de rolamento travado"), c("1", "Rolamento trocado e lubrificação"), // mesma ordem: ROLAMENTO conta 1
      c("2", "Correia rompida substituída"), c("3", "Correia rompida, troca da polia"),
      c("4", "Rolamentos com folga"),
      c("5", "Troca de rolamento", "YM01"), // preventiva: fora
      c("6", ""), // sem texto
    ];
    const a = analisarModos(conf, new Map());
    expect(a.ordens).toBe(4);
    expect(a.semTexto).toBe(1);
    expect(a.apontamentos).toBe(5);
    expect(a.palavras.find((p) => p.termo === "ROLAMENTO")?.ordens).toBe(2); // ordens 1 e 4 (plural junto)
    expect(a.palavras.some((p) => p.termo === "ROLAMENTOS")).toBe(false);
    expect(a.expressoes[0]).toEqual({ termo: "CORREIA ROMPIDA", rotulo: "correia rompida", ordens: 2 });
    expect(a.palavras.find((p) => p.termo === "LUBRIFICACAO")?.rotulo).toBe("lubrificação"); // com acento, como foi escrito
    const modo = (m: string) => a.modos.find((x) => x.modo.startsWith(m));
    expect(modo("Rolamentos")?.ordens).toBe(2);
    expect(modo("Transmissão")?.ordens).toBe(2);
    expect(modo("Ajuste")?.ordens).toBe(1);
    expect(modo("Desgaste")?.ordens).toBe(3); // travado + rompida (2)
    expect(a.modos[0].pct).toBeGreaterThan(0);
  });

  it("usa o tipo da IW38 quando a IW47 não traz e filtra pelo ano", () => {
    const conf = [c("7", "Sensor indutivo trocado", ""), c("8", "Motor queimado", "YM11", dia(2025, 6, 1))];
    const tipos = new Map([["7", "YM11"]]);
    expect(analisarModos(conf, tipos).ordens).toBe(2);
    const a26 = analisarModos(conf, tipos, "2026");
    expect(a26.ordens).toBe(1);
    expect(a26.modos.map((m) => m.modo)).toEqual(["Sensores e automação"]);
    expect(comPalavra(conf, tipos, "motor").map((x) => x.ordem)).toEqual(["8"]);
    expect(comPalavra(conf, tipos, "motor", "2026")).toEqual([]);
  });

  it("tamanho da nuvem cresce com a frequência, entre 12 e 40 px", () => {
    expect(tamanhoNuvem(1, 100)).toBe(12);
    expect(tamanhoNuvem(100, 100)).toBe(40);
    expect(tamanhoNuvem(25, 100)).toBeGreaterThan(tamanhoNuvem(4, 100));
    expect(tamanhoNuvem(3, 3, 3)).toBe(24);
  });
});
