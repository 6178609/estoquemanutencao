import { describe, expect, it } from "vitest";

import { comPecaSemCadastro, pecasSemCadastroDe, semPecaSemCadastro, validarPecaSemCadastro } from "@/lib/dados/pecasSemCadastro";

/** Só dados fictícios. */
describe("peças sem cadastro no Sysmat", () => {
  const p = { descricao: "Vedação U UHS 55x65x6", referencia: "UHS55X65X6", fabricante: "Fictícia", quantidade: "2", origem: "Manual cap. 6" };

  it("valida e limpa o formulário", () => {
    expect(validarPecaSemCadastro({ descricao: "  ab " })).toEqual({ erro: "Descreva a peça (pelo menos 3 letras)." });
    const v = validarPecaSemCadastro({ descricao: "  Anel\n  raspador ", referencia: "x".repeat(200) });
    expect("erro" in v).toBe(false);
    if (!("erro" in v)) { expect(v.descricao).toBe("Anel raspador"); expect(v.referencia).toHaveLength(80); }
  });

  it("soma ao item (cria o item se faltar) e não repete a mesma peça", () => {
    const novo = comPecaSemCadastro(undefined, "Máquina X", p, "a1", "2026-01-01", "Teste")!;
    expect(novo.nome).toBe("Máquina X");
    expect(pecasSemCadastroDe(novo)).toHaveLength(1);
    expect(comPecaSemCadastro(novo, "Máquina X", { ...p, descricao: p.descricao.toLowerCase() }, "a2", "", "")).toBeNull();
    const dois = comPecaSemCadastro({ ...novo, materiais: ["1"] }, "", { ...p, referencia: "OUTRA" }, "a2", "", "")!;
    expect(dois.materiais).toEqual(["1"]);
    expect(pecasSemCadastroDe(dois).map((x) => x.id)).toEqual(["a1", "a2"]);
  });

  it("remove pelo id e tira a chave quando a lista esvazia", () => {
    const item = comPecaSemCadastro({ nome: "M", materiais: ["9"] }, "M", p, "a1", "", "")!;
    expect(semPecaSemCadastro(item, "zz")).toBeNull();
    const r = semPecaSemCadastro(item, "a1")!;
    expect(r).toEqual({ nome: "M", materiais: ["9"] });
  });

  it("ignora entradas inválidas gravadas", () => {
    expect(pecasSemCadastroDe({ pecas_sem_cadastro: [null, { id: "x" }, { id: "y", descricao: "Ok" }] }).map((x) => x.id)).toEqual(["y"]);
  });
});
