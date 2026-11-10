import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

  it("SAP sem zeros à esquerda (mesma chave do catálogo)", () => {
    const sapDe = (sap: string) => { const r = R.validarEntrada(entrada({ sap }), TAGS); return "campos" in r ? r.campos.sap : r.erro; };
    expect(sapDe("000123456")).toBe("123456");
    expect(sapDe("00000")).toBe("0");
    expect(sapDe("1020304")).toBe("1020304");
    // a contagem de 5 a 12 dígitos vale para o que foi digitado
    expect(sapDe("000000001234")).toBe("1234");
    expect("erro" in R.validarEntrada(entrada({ sap: "0001234567890" }), TAGS)).toBe(true);
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

  it("filtro por situação, mês do lançamento e busca (descrição, SAP ou equipamento, sem acento)", () => {
    const ps = [
      ped({ id: "f1", descricao: "Rolamento de esferas", sap: "111111", equipamento: { tag: "EQ-001", nome: "Bomba de água" }, criadoEm: "2026-11-03T10:00:00Z" }),
      ped({ id: "f2", descricao: "Correia dentada", sap: "222222", equipamento: { tag: "EQ-002", nome: "Ventilação" }, situacao: R.AG_PCM, criadoEm: "2026-10-03T10:00:00Z" }),
    ];
    const ids = (f: Parameters<typeof R.filtrarPedidos>[1]) => R.filtrarPedidos(ps, f).map((p) => p.id);
    expect(ids({})).toEqual(["f1", "f2"]);
    expect(ids({ situacao: R.AG_PCM })).toEqual(["f2"]);
    expect(ids({ situacao: "Qualquer coisa" })).toEqual(["f1", "f2"]);
    expect(ids({ mes: "2026-11" })).toEqual(["f1"]);
    expect(ids({ mes: "11/2026" })).toEqual(["f1", "f2"]);
    expect(ids({ q: "correia" })).toEqual(["f2"]);
    expect(ids({ q: "222" })).toEqual(["f2"]);
    expect(ids({ q: "eq-001" })).toEqual(["f1"]);
    expect(ids({ q: "agua" })).toEqual(["f1"]);
    expect(ids({ q: "ventilacao", mes: "2026-11" })).toEqual([]);
  });

  it("planilha com ; e BOM, sem fórmula", () => {
    const csv = R.csvPedidos([ped({ descricao: "=CMD()" })]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain(";");
    expect(csv).toContain(`"'=CMD()"`);
  });
});

describe("cadastro de material: gravação (demonstração, na memória)", async () => {
  const { afterAll, beforeAll } = await import("vitest");
  const { _definirFonte } = await import("@/lib/dados/fonte");
  const { _definirSupabase } = await import("@/lib/dados/supabase");
  const { gravarCadastroLote, lerCadastro } = await import("@/lib/dados/cadastros");
  const D = await import("@/lib/cadastroMaterial/dados");
  beforeAll(async () => {
    _definirFonte(null); _definirSupabase(null);
    await gravarCadastroLote("cadastro_equipamentos.json", {
      "EQ-TESTE": { nome: "Equipamento Teste", materiais: ["1111111"] },
      "EQ-TESTE2": { nome: "Equipamento Teste 2" },
    }, "teste");
  });
  afterAll(() => { _definirFonte(undefined); _definirSupabase(undefined); });

  /** JPEG fictício (só o cabeçalho conta para o tipo). */
  const JPG = (marca = 1) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, marca, 2, 3, 4, 5, 6]);
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 1]);
  const DONO: R.Papel = { login: "dono1", almox: false, pcm: false };
  const ALM: R.Papel = { login: "almox1", almox: true, pcm: false };
  const PC: R.Papel = { login: "pcm1", almox: false, pcm: true };
  const ent = (x: Partial<R.EntradaPedido> = {}): R.EntradaPedido =>
    ({ descricao: "Rolamento fictício 6205", sap: "9999901", tag: "EQ-TESTE", observacao: "", ...x });
  const pedido = async (id: string) => (await D.lerPedidos(true)).find((p) => p.id === id);
  const materiais = async (tag: string) => (await lerCadastro("cadastro_equipamentos.json", { fresco: true }))[tag]?.materiais;

  it("papel: só quem vê a aba e está marcado; Terceiro nunca; administrador não ganha nada", () => {
    expect(D.papelDe({ login: "a", aprova_almox: true, funcao: "lider" }, true)).toEqual({ login: "a", almox: true, pcm: false });
    expect(D.papelDe({ login: "a", aprova_almox: true, aprova_pcm: true }, false)).toEqual({ login: "a", almox: false, pcm: false });
    expect(D.papelDe({ login: "a", aprova_almox: true, aprova_pcm: true, funcao: "terceiro" }, true)).toEqual({ login: "a", almox: false, pcm: false });
    expect(D.papelDe({ login: "a", aprova_pcm: "true", funcao: "manutentor" }, true).pcm).toBe(false);
    expect(D.papelDe({ login: "a", aprova_pcm: true, funcao: "manutentor" }, true).pcm).toBe(true);
  });

  it("lista de equipamentos inclui o cadastro do site", async () => {
    const tags = await D.tagsEquipamentos();
    expect(tags.get("EQ-TESTE")).toBe("Equipamento Teste");
  });

  it("fluxo completo", async () => {
    const id = await D.lancarPedido(DONO, ent(), { nome: "foto.jpg", bytes: JPG() }, "Dono Teste");
    let p = (await pedido(id))!;
    expect(p).toMatchObject({ situacao: R.AG_ALMOX, criadoPor: "dono1", sap: "9999901",
      equipamento: { tag: "EQ-TESTE", nome: "Equipamento Teste" }, foto: { tipo: "image/jpeg" } });
    expect((await D.lerFoto(id, "pedido"))?.tipo).toBe("image/jpeg");
    expect(await D.lerFoto(id, "chegada")).toBeNull();

    await expect(D.agir(DONO, id, "aprovar", "", null, "x")).rejects.toThrow(/Almoxarifado/);
    await D.agir(ALM, id, "aprovar", "", null, "Almox Teste");
    await expect(D.agir(ALM, id, "chegou", "", null, "Almox Teste")).rejects.toThrow(/foto/);
    await D.agir(ALM, id, "chegou", "", { nome: "chegada.png", bytes: PNG }, "Almox Teste");
    expect((await D.lerFoto(id, "chegada"))?.tipo).toBe("image/png");

    // PCM recusa a chegada: volta para o almoxarifado, que manda outra foto (a antiga sai)
    await expect(D.agir(PC, id, "recusar_chegada", "", null, "x")).rejects.toThrow(/motivo/);
    await D.agir(PC, id, "recusar_chegada", "Foto não confere", null, "PCM Teste");
    p = (await pedido(id))!;
    expect(p.situacao).toBe(R.AG_CHEGADA);
    const antiga = p.fotoChegada!.arquivo;
    await D.agir(ALM, id, "chegou", "", { nome: "chegada2.jpg", bytes: JPG(9) }, "Almox Teste");
    p = (await pedido(id))!;
    expect(p.fotoChegada?.arquivo).not.toBe(antiga);
    expect(D._fotosGuardadas().some((c) => c.endsWith(`/${antiga}`))).toBe(false);

    expect(await D.agir(PC, id, "validar", "", null, "PCM Teste")).toEqual({});
    p = (await pedido(id))!;
    expect(p.situacao).toBe(R.CONCLUIDO);
    expect(p.historico.map((e) => e.acao)).toEqual(["lancar", "aprovar", "chegou", "recusar_chegada", "chegou", "validar"]);
    expect(await materiais("EQ-TESTE")).toEqual(["1111111", "9999901"]);
    await expect(D.agir(PC, id, "validar", "", null, "x")).rejects.toThrow(/não vale agora/);
  });

  it("corrida", async () => {
    const id = await D.lancarPedido(DONO, ent({ sap: "9999902" }), { nome: "f.jpg", bytes: JPG() }, "Dono Teste");
    const [a, b] = await Promise.allSettled([D.agir(ALM, id, "aprovar", "", null, "A"), D.agir(ALM, id, "aprovar", "", null, "B")]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("rejected");
    expect((b as PromiseRejectedResult).reason.message).toMatch(/já mudou de situação/);
    expect((await pedido(id))!.historico.filter((e) => e.acao === "aprovar")).toHaveLength(1);
  });

  it("foto inválida", async () => {
    const antes = D._fotosGuardadas().length;
    const PDF = new TextEncoder().encode("%PDF-1.4\n% teste\n");
    await expect(D.lancarPedido(DONO, ent(), { nome: "x.pdf", bytes: PDF }, "x")).rejects.toThrow(/JPEG, PNG ou WebP/);
    await expect(D.lancarPedido(DONO, ent(), { nome: "x.bin", bytes: new Uint8Array([7, 3, 1, 9, 4, 4, 2, 8]) }, "x")).rejects.toThrow(/JPEG, PNG ou WebP/);
    await expect(D.lancarPedido(DONO, ent(), { nome: "vazio.jpg", bytes: new Uint8Array() }, "x")).rejects.toThrow(/JPEG, PNG ou WebP/);
    const grande = new Uint8Array(4_000_001); grande.set(JPG());
    await expect(D.lancarPedido(DONO, ent(), { nome: "g.jpg", bytes: grande }, "x")).rejects.toThrow(/MB/);
    await expect(D.lancarPedido(DONO, ent({ tag: "EQ-NAO-EXISTE" }), { nome: "f.jpg", bytes: JPG() }, "x")).rejects.toThrow(/equipamento/);
    expect(D._fotosGuardadas().length).toBe(antes);
  });

  it("validar não duplica e tolera equipamento ausente", async () => {
    // mesmo SAP já vinculado: não duplica
    const id1 = await D.lancarPedido(DONO, ent({ sap: "1111111" }), { nome: "f.jpg", bytes: JPG() }, "Dono Teste");
    await D.agir(ALM, id1, "aprovar", "", null, "A");
    await D.agir(ALM, id1, "chegou", "", { nome: "c.jpg", bytes: JPG(2) }, "A");
    expect(await D.agir(PC, id1, "validar", "", null, "P")).toEqual({});
    expect((await materiais("EQ-TESTE") as string[]).filter((m) => m === "1111111")).toHaveLength(1);
    // equipamento removido do cadastro no meio do caminho: conclui e avisa
    const id2 = await D.lancarPedido(DONO, ent({ sap: "9999903", tag: "EQ-TESTE2" }), { nome: "f.jpg", bytes: JPG() }, "Dono Teste");
    await D.agir(ALM, id2, "aprovar", "", null, "A");
    await D.agir(ALM, id2, "chegou", "", { nome: "c.jpg", bytes: JPG(3) }, "A");
    await gravarCadastroLote("cadastro_equipamentos.json", { "EQ-TESTE2": null }, "teste");
    expect(await D.agir(PC, id2, "validar", "", null, "P")).toEqual({ aviso: "Equipamento não encontrado no cadastro: vincule à mão." });
    expect((await pedido(id2))!.situacao).toBe(R.CONCLUIDO);
    expect((await lerCadastro("cadastro_equipamentos.json", { fresco: true }))["EQ-TESTE2"]).toBeUndefined();
  });

  it("equipamento só no IH08 (demonstração fictícia) ganha item no cadastro com o SAP", async () => {
    const { bases } = await import("@/lib/wcm/dados");
    const cad = await lerCadastro("cadastro_equipamentos.json", { fresco: true });
    const eq = (await bases()).equipamentos.dados!.find((e) => !e.inativo && !(e.equipamento in cad))!;
    expect(eq).toBeTruthy();
    const id = await D.lancarPedido(DONO, ent({ sap: "9999906", tag: eq.equipamento }), { nome: "f.jpg", bytes: JPG() }, "Dono Teste");
    await D.agir(ALM, id, "aprovar", "", null, "A");
    await D.agir(ALM, id, "chegou", "", { nome: "c.jpg", bytes: JPG(4) }, "A");
    expect(await D.agir(PC, id, "validar", "", null, "P")).toEqual({});
    const item = (await lerCadastro("cadastro_equipamentos.json", { fresco: true }))[eq.equipamento];
    expect(item).toMatchObject({ nome: eq.denominacao, materiais: ["9999906"] });
  });

  it("excluir só o dono, antes da aprovação, e apaga as fotos", async () => {
    const id = await D.lancarPedido(DONO, ent({ sap: "9999904" }), { nome: "f.jpg", bytes: JPG() }, "Dono Teste");
    // editar troca a foto num arquivo novo e apaga a antiga
    const f1 = (await pedido(id))!.foto!.arquivo;
    await expect(D.editarPedido(ALM, id, ent({ descricao: "Outra descrição" }), null, "x")).rejects.toThrow(/Só quem lançou/);
    await D.editarPedido(DONO, id, ent({ descricao: "Rolamento fictício editado" }), { nome: "g.jpg", bytes: JPG(5) }, "Dono Teste");
    const p = (await pedido(id))!;
    expect(p.descricao).toBe("Rolamento fictício editado");
    expect(p.foto!.arquivo).not.toBe(f1);
    expect(D._fotosGuardadas().some((c) => c.endsWith(`/${f1}`))).toBe(false);

    await expect(D.excluirPedido(ALM, id, "x")).rejects.toThrow(/Só quem lançou/);
    await D.excluirPedido(DONO, id, "Dono Teste");
    expect(await pedido(id)).toBeUndefined();
    expect(D._fotosGuardadas().some((c) => c.includes(`/${id}/`))).toBe(false);

    // depois da aprovação, nem o dono exclui
    const id2 = await D.lancarPedido(DONO, ent({ sap: "9999905" }), { nome: "f.jpg", bytes: JPG() }, "Dono Teste");
    await D.agir(ALM, id2, "aprovar", "", null, "A");
    await expect(D.excluirPedido(DONO, id2, "x")).rejects.toThrow(/Só quem lançou/);
    await expect(D.editarPedido(DONO, id2, ent(), null, "x")).rejects.toThrow(/Só quem lançou/);
    expect(D._fotosGuardadas().some((c) => c.includes(`/${id2}/`))).toBe(true);
  });
});

describe("cadastro de material: demonstração", async () => {
  const { afterAll, beforeAll } = await import("vitest");
  const { _definirFonte } = await import("@/lib/dados/fonte");
  const { _definirSupabase } = await import("@/lib/dados/supabase");
  const D = await import("@/lib/cadastroMaterial/dados");
  beforeAll(() => { _definirFonte(null); _definirSupabase(null); });
  afterAll(() => { _definirFonte(undefined); _definirSupabase(undefined); });

  it("traz pedidos fictícios aguardando o almoxarifado, aguardando o PCM e concluído, com fotos legíveis", async () => {
    // (só os da demonstração: os testes acima também gravam pedidos)
    const ps = (await D.lerPedidos(true)).filter((p) => p.id.startsWith("demo0"));
    expect(ps).toHaveLength(3);
    const sit = new Set<string>(ps.map((p) => p.situacao));
    for (const s of [R.AG_ALMOX, R.AG_PCM, R.CONCLUIDO]) expect(sit.has(s)).toBe(true);
    const pcm = ps.find((p) => p.situacao === R.AG_PCM)!;
    expect((await D.lerFoto(pcm.id, "pedido"))?.tipo).toBe("image/png");
    expect((await D.lerFoto(pcm.id, "chegada"))?.tipo).toBe("image/png");
    // o equipamento existe na lista da demonstração
    const tags = await D.tagsEquipamentos();
    expect(ps.every((p) => tags.has(p.equipamento.tag))).toBe(true);
  });
});
