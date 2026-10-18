import { describe, expect, it } from "vitest";

import { itensAviso, montarEmail, semanaDoAno } from "@/lib/wcm/avisoTreinamentos";
import type { Reciclagem } from "@/lib/wcm/treinamentos";
import { dia } from "@/lib/wcm/util";

// dados fictícios
const HOJE = dia(2026, 10, 19)!;
const r = (np: string, titulo: string, situacao: Reciclagem["situacao"], dias: number | null, agendado: number | null = null): Reciclagem =>
  ({ np, titulo, chaveTitulo: titulo.toLowerCase(), realizado: HOJE - 300, validade: dias == null ? null : HOJE + dias, situacao, dias, agendado });

describe("aviso semanal de treinamentos", () => {
  const pessoas = new Map([["1", { nome: "Pessoa Um", cargo: "Eletricista", turma: "A" }], ["2", { nome: "Pessoa <Dois>" }]]);
  const rec = [
    r("1", "NR-10", "Vence em breve", 20), r("2", "NR-35", "Vencido", -5), r("1", "NR-12", "Em dia", 200),
    r("2", "NR-33", "Vence em breve", 10, HOJE + 5), r("1", "Brigada", "Sem validade", null), r("3", "NR-10", "Vencido", -1),
  ];
  it("lista só vencidos e vencendo sem turma lançada, do mais urgente ao menos", () => {
    const itens = itensAviso(rec, pessoas);
    expect(itens.map((i) => [i.np, i.titulo])).toEqual([["2", "NR-35"], ["3", "NR-10"], ["1", "NR-10"]]);
    expect(itens[1].nome).toBe("3"); // fora do cadastro: fica o NP
  });
  it("e-mail com assunto contado, texto puro e HTML escapado", () => {
    const e = montarEmail(itensAviso(rec, pessoas), HOJE, "https://exemplo.test/treinamentos_ferias?visao=Treinamentos");
    expect(e.assunto).toBe("Treinamentos da manutenção: 2 vencido(s) e 1 vencendo em até 60 dias");
    expect(e.texto).toContain("Pessoa Um (Eletricista) · NR-10 · validade 08/11/2026 · vence em 20 dia(s)");
    expect(e.texto).toContain("vencido há 5 dia(s)");
    expect(e.html).toContain("Pessoa &lt;Dois&gt;");
    expect(e.html).not.toContain("<Dois>");
  });
  it("semana ISO", () => {
    expect(semanaDoAno(dia(2026, 10, 19)!)).toBe("2026-S43"); // segunda
    expect(semanaDoAno(dia(2026, 10, 25)!)).toBe("2026-S43"); // domingo
    expect(semanaDoAno(dia(2027, 1, 1)!)).toBe("2026-S53");
    expect(semanaDoAno(dia(2026, 1, 1)!)).toBe("2026-S01");
  });
});
