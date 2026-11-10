import { describe, expect, it } from "vitest";

import * as R from "@/lib/cadastroMaterial/regras";

/** Só dados fictícios. */
const ALMOX: R.Papel = { login: "almox1", almox: true, pcm: false };
const PCM: R.Papel = { login: "pcm1", almox: false, pcm: true };
const COMUM: R.Papel = { login: "dono1", almox: false, pcm: false };
const TAGS = new Set(["EQ-001", "EQ-002"]);
const foto: R.Foto = { nome: "foto.jpg", tipo: "image/jpeg", tamanho: 1000, arquivo: "abc123def456abc123" };

const ped = (x: Partial<R.Pedido> = {}): R.Pedido => ({
  id: "a1b2c3d4e5f6a1b2c3", descricao: "Rolamento de teste", sap: "123456", equipamento: { tag: "EQ-001", nome: "Equipamento Teste" },
  observacao: "", foto, fotoChegada: null, situacao: R.AG_ALMOX, criadoPor: "dono1", criadoEm: "2026-11-01T10:00:00Z", historico: [], ...x,
});
const entrada = (x: Partial<R.EntradaPedido> = {}): R.EntradaPedido =>
  ({ descricao: "Rolamento de teste", sap: "123456", tag: "EQ-001", observacao: "", ...x });

describe("cadastro de material: regras", () => {
  it("transições permitidas", () => {
    expect(R.proximaSituacao(R.AG_ALMOX, "aprovar")).toBe(R.AG_CHEGADA);
    expect(R.proximaSituacao(R.AG_ALMOX, "recusar")).toBe(R.RECUSADO);
    expect(R.proximaSituacao(R.AG_CHEGADA, "chegou")).toBe(R.AG_PCM);
    expect(R.proximaSituacao(R.AG_PCM, "validar")).toBe(R.CONCLUIDO);
    expect(R.proximaSituacao(R.AG_PCM, "recusar_chegada")).toBe(R.AG_CHEGADA);
  });

  it("transições proibidas", () => {
    expect(R.proximaSituacao(R.CONCLUIDO, "aprovar")).toBeNull();
    expect(R.proximaSituacao(R.AG_ALMOX, "validar")).toBeNull();
    expect(R.proximaSituacao(R.AG_ALMOX, "chegou")).toBeNull();
    expect(R.proximaSituacao(R.AG_CHEGADA, "aprovar")).toBeNull();
    expect(R.proximaSituacao(R.RECUSADO, "aprovar")).toBeNull();
    expect(R.proximaSituacao(R.AG_PCM, "recusar")).toBeNull();
    // e a ação fora de hora é bloqueada mesmo para quem tem o papel
    expect(R.bloqueioDeAcao(ALMOX, { situacao: R.CONCLUIDO }, "aprovar", "")).not.toBe("");
  });

  it("papel", () => {
    expect(R.bloqueioDeAcao({ login: "a", almox: false, pcm: true }, { situacao: R.AG_ALMOX }, "aprovar", "")).not.toBe("");
    expect(R.bloqueioDeAcao(ALMOX, { situacao: R.AG_ALMOX }, "aprovar", "")).toBe("");
    expect(R.bloqueioDeAcao(ALMOX, { situacao: R.AG_CHEGADA }, "chegou", "")).toBe("");
    expect(R.bloqueioDeAcao(PCM, { situacao: R.AG_PCM }, "validar", "")).toBe("");
    expect(R.bloqueioDeAcao(ALMOX, { situacao: R.AG_PCM }, "validar", "")).not.toBe("");
    expect(R.bloqueioDeAcao(PCM, { situacao: R.AG_CHEGADA }, "chegou", "")).not.toBe("");
    expect(R.bloqueioDeAcao(COMUM, { situacao: R.AG_ALMOX }, "aprovar", "")).not.toBe("");
  });

  it("motivo obrigatório", () => {
    expect(R.bloqueioDeAcao(ALMOX, { situacao: R.AG_ALMOX }, "recusar", "  ")).not.toBe("");
    expect(R.bloqueioDeAcao(ALMOX, { situacao: R.AG_ALMOX }, "recusar", "Foto errada")).toBe("");
    expect(R.bloqueioDeAcao(PCM, { situacao: R.AG_PCM }, "recusar_chegada", "ab")).not.toBe("");
    expect(R.bloqueioDeAcao(PCM, { situacao: R.AG_PCM }, "recusar_chegada", "Foto errada")).toBe("");
  });

  it("validação", () => {
    expect("erro" in R.validarEntrada(entrada({ descricao: "abcd" }), TAGS)).toBe(true);
    expect("erro" in R.validarEntrada(entrada({ sap: "12345a" }), TAGS)).toBe(true);
    expect("erro" in R.validarEntrada(entrada({ sap: "1234567890123" }), TAGS)).toBe(true);
    expect("erro" in R.validarEntrada(entrada({ sap: "1234" }), TAGS)).toBe(true);
    expect("erro" in R.validarEntrada(entrada({ tag: "EQ-999" }), TAGS)).toBe(true);
    expect("erro" in R.validarEntrada(entrada({ descricao: "x".repeat(201) }), TAGS)).toBe(true);
    expect("erro" in R.validarEntrada(entrada({ observacao: "x".repeat(501) }), TAGS)).toBe(true);
    const ok = R.validarEntrada(entrada({ descricao: "  Rolamento 6205  ", sap: " 123456 ", tag: " EQ-002 ", observacao: " urgente " }), TAGS);
    expect(ok).toEqual({ campos: { descricao: "Rolamento 6205", sap: "123456", tag: "EQ-002", observacao: "urgente" } });
    expect("campos" in R.validarEntrada(entrada({ observacao: "x".repeat(500) }), TAGS)).toBe(true);
  });

  it("edição só do dono e antes da aprovação", () => {
    expect(R.podeEditar(COMUM, { situacao: R.AG_ALMOX, criadoPor: "dono1" })).toBe(true);
    expect(R.podeEditar({ ...COMUM, login: "DONO1" }, { situacao: R.AG_ALMOX, criadoPor: "dono1" })).toBe(true);
    expect(R.podeEditar(ALMOX, { situacao: R.AG_ALMOX, criadoPor: "dono1" })).toBe(false);
    expect(R.podeEditar(COMUM, { situacao: R.AG_CHEGADA, criadoPor: "dono1" })).toBe(false);
    expect(R.podeEditar(COMUM, { situacao: R.RECUSADO, criadoPor: "dono1" })).toBe(false);
  });

  it("pedidoDe tolera lixo", () => {
    expect(R.pedidoDe("x", 5)).toBeNull();
    expect(R.pedidoDe("a1b2c3d4e5f6a1b2c3", null)).toBeNull();
    const base = R.paraGravar(ped());
    expect(R.pedidoDe("a1b2c3d4e5f6a1b2c3", { ...base, situacao: "Inventada" })).toBeNull();
    // ida e volta
    const p = ped({ historico: [{ em: "2026-11-01T10:00:00Z", por: "dono1", acao: "lancar" }], fotoChegada: foto });
    expect(R.pedidoDe(p.id, R.paraGravar(p))).toEqual(p);
    // campos estranhos são ignorados; foto inválida vira null; evento inválido some
    const lido = R.pedidoDe(p.id, { ...R.paraGravar(p), foto: "lixo", historico: [5, { em: "x", por: "y", acao: "hackear" }], extra: 1 });
    expect(lido?.foto).toBeNull();
    expect(lido?.historico).toEqual([]);
    // pedidosDe: só os válidos, mais novo primeiro
    const cad = { [p.id]: R.paraGravar(p), bbbbbbbbbbbbbbbbbb: R.paraGravar(ped({ id: "bbbbbbbbbbbbbbbbbb", criadoEm: "2026-11-05T10:00:00Z" })), lixo: 3 };
    expect(R.pedidosDe(cad).map((x) => x.id)).toEqual(["bbbbbbbbbbbbbbbbbb", p.id]);
  });

  it("resumo e ordem", () => {
    const valida = (em: string) => [{ em, por: "pcm1", acao: "validar" as const }];
    const ps = [
      ped({ id: "p1", situacao: R.CONCLUIDO, criadoEm: "2026-11-09T10:00:00Z", historico: valida("2026-11-09T12:00:00Z") }),
      ped({ id: "p2", situacao: R.AG_ALMOX, criadoEm: "2026-11-02T10:00:00Z" }),
      ped({ id: "p3", situacao: R.AG_PCM, criadoEm: "2026-11-08T10:00:00Z" }),
      ped({ id: "p4", situacao: R.AG_CHEGADA, criadoEm: "2026-11-01T10:00:00Z" }),
      ped({ id: "p5", situacao: R.CONCLUIDO, criadoEm: "2026-10-01T10:00:00Z", historico: valida("2026-10-20T12:00:00Z") }),
    ];
    expect(R.resumo(ps, "2026-11")).toEqual({ agAlmox: 1, agChegada: 1, agPcm: 1, concluidosMes: 1 });
    expect(R.ordenarPara(ALMOX, ps).map((p) => p.id)).toEqual(["p2", "p4", "p1", "p3", "p5"]);
    expect(R.ordenarPara(PCM, ps).map((p) => p.id)).toEqual(["p3", "p1", "p2", "p4", "p5"]);
    expect(R.ordenarPara(COMUM, ps).map((p) => p.id)).toEqual(["p1", "p3", "p2", "p4", "p5"]);
    expect(R.ordenarPara({ login: "x", almox: true, pcm: true }, ps).map((p) => p.id)).toEqual(["p2", "p4", "p3", "p1", "p5"]);
  });

  it("planilha com ; e BOM, sem fórmula", () => {
    const csv = R.csvPedidos([ped({ descricao: "=CMD()" })]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain(";");
    expect(csv).toContain(`"'=CMD()"`);
  });
});
