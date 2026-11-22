import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { caminhoDeVolta } from "@/lib/auth/volta";
import type { Quem } from "@/lib/ubm/dados";
import * as R from "@/lib/ubm/regras";

/** Só dados fictícios. */
const KIT: R.ItemKit[] = [
  { codigo: "111", descricao: "Peça fictícia", um: "PC", minimo: 2, maximo: 4 },
  { codigo: "222", descricao: "Cabo fictício", um: "M", minimo: 10, maximo: 10 },
];
const ARM: R.Armario = { id: "UBM-01", nome: "Armário teste", local: "Linha teste", ativo: true, itens: KIT, criadoEm: "2026-01-01T00:00:00Z" };
const base: Omit<R.Movimento, "id" | "tipo" | "em" | "codigo" | "quantidade"> = { armario: "UBM-01", por: "p1", porNome: "Pessoa Teste",
  ordem: "", turno: "", uso: "", observacao: "", tipoSolicitacao: "", foto: null, fechadaEm: "", fechadaPor: "", origem: "" };
let seq = 0;
const mov = (tipo: R.TipoMovimento, em: string, codigo: string, quantidade: number, x: Partial<R.Movimento> = {}): R.Movimento =>
  ({ ...base, id: `mov${String(++seq).padStart(6, "0")}`, tipo, em, codigo, quantidade, ...x });

describe("UBM: validação", () => {
  it("quantidade: inteira para PC, decimal (2 casas) para M e para código fora do kit", () => {
    const q = (codigo: string, quantidade: string) => R.validarQuantidade(quantidade, R.itemDoKit(ARM, codigo)?.um ?? "");
    expect(q("111", "2")).toBe(2);
    expect(q("111", "1,5")).toMatch(/inteiro/);
    expect(q("222", "1,5")).toBe(1.5);
    expect(q("222", "2.25")).toBe(2.25);
    expect(q("222", "0,005")).toMatch(/2 casas/);
    expect(q("FORA1", "0,5")).toBe(0.5);
    expect(q("111", "0")).toMatch(/de 1 a 999/);
    expect(q("111", "1000")).toMatch(/999/);
    expect(q("111", "abc")).toMatch(/número/);
    expect(R.validarQuantidade("0", "PC", true)).toBe(0);
  });

  it("solicitação: código opcional só em 'faltando' (com observação)", () => {
    expect(R.validarSolicitacao({ tipo: "acabou", codigo: "111", quantidade: "", observacao: "" }, ARM))
      .toEqual({ campos: { tipo: "acabou", codigo: "111", quantidade: 1, observacao: "" } });
    expect("erro" in R.validarSolicitacao({ tipo: "acabou", codigo: "", quantidade: "1", observacao: "" }, ARM)).toBe(true);
    expect("erro" in R.validarSolicitacao({ tipo: "faltando", codigo: "", quantidade: "1", observacao: "" }, ARM)).toBe(true);
    expect("campos" in R.validarSolicitacao({ tipo: "faltando", codigo: "", quantidade: "1", observacao: "Chave fictícia" }, ARM)).toBe(true);
    expect("erro" in R.validarSolicitacao({ tipo: "outro", codigo: "111", quantidade: "1", observacao: "" }, ARM)).toBe(true);
  });

  it("armário e kit (mínimo opcional = padrão)", () => {
    const v = R.validarArmario({ id: " ubm-7 ", nome: "Armário", local: "", ativo: true, itens: [] });
    expect("erro" in v).toBe(true);
    const ok = R.validarArmario({ id: "ubm-07", nome: "Armário teste", local: "L1", ativo: true,
      itens: [{ codigo: "0123", um: "pc", quantidade: "3" }, { codigo: "456", um: "M", quantidade: "2,5", minimo: "1" }] });
    expect(ok).toEqual({ campos: { id: "UBM-07", nome: "Armário teste", local: "L1", ativo: true, itens: [
      { codigo: "123", descricao: "", um: "PC", minimo: 3, maximo: 3 }, { codigo: "456", descricao: "", um: "M", minimo: 1, maximo: 2.5 }] } });
    const ruim = R.prepararKit([{ codigo: "1", um: "PC", quantidade: "2" }, { codigo: "1", um: "PC", quantidade: "2" },
      { codigo: "2", um: "PECAS1", quantidade: "1" }, { codigo: "3", um: "PC", quantidade: "1", minimo: "5" }]);
    expect(ruim.itens).toEqual([]);
    expect(ruim.erros).toEqual(["Linha 2: código 1 repetido.", "Linha 3: UM inválida (sigla de até 4 letras, ex.: PC, M).",
      "Linha 4: o mínimo passa da quantidade padrão."]);
  });

  it("kit colado (tab, ponto e vírgula, espaços) e planilha", () => {
    const linhas = R.linhasDoTexto("Código\tDescrição\tUM\tQuantidade\n111\tPeça fictícia\tPC\t4\n222;M;10\n333    Item com espaço    PC    2\n444  5");
    expect(R.prepararKit(linhas).itens).toEqual([
      { codigo: "111", descricao: "Peça fictícia", um: "PC", minimo: 4, maximo: 4 },
      { codigo: "222", descricao: "", um: "M", minimo: 10, maximo: 10 },
      { codigo: "333", descricao: "Item com espaço", um: "PC", minimo: 2, maximo: 2 },
      { codigo: "444", descricao: "", um: "PC", minimo: 5, maximo: 5 },
    ]);
    const p = R.linhasDaPlanilha([["código", "Descricao", "UM", "Quantidade padrão", "Mínimo"], ["111", "x", "PC", 4, ""], [], ["222", "", "M", 2.5, 1]]);
    expect(p.erro).toBe("");
    expect(R.prepararKit(p.linhas, 2).itens.map((i) => [i.codigo, i.minimo, i.maximo])).toEqual([["111", 4, 4], ["222", 1, 2.5]]);
    expect(R.linhasDaPlanilha([["Outra"]]).erro).toMatch(/Código/);
    // "Linha N" é a linha real da planilha, mesmo com linhas vazias no meio
    const vazias = R.linhasDaPlanilha([["Código", "UM", "Quantidade padrão"], ["111", "PC", 1], [], ["", null, ""], ["222", "PC", "x"]]);
    expect(R.prepararKit(vazias.linhas, 2).erros).toEqual(["Linha 5: quantidade padrão: um número de 1 a 999."]);
    // 3 colunas: a 2ª é UM (sigla) ou descrição (texto com minúsculas)
    expect(R.linhasDoTexto("555;Cabo de aço;3\n666;M;2,5")).toEqual([
      { codigo: "555", descricao: "Cabo de aço", quantidade: "3" }, { codigo: "666", um: "M", quantidade: "2,5" }]);
    expect(R.linhasKitPlanilha(KIT)).toEqual([["111", "Peça fictícia", "PC", 4, 2], ["222", "Cabo fictício", "M", 10, null]]);
  });

  it("caminho de volta do login: só interno", () => {
    expect(caminhoDeVolta("/ubm/solicitacao?u=UBM-01")).toBe("/ubm/solicitacao?u=UBM-01");
    // inclusive os que só viram "//host" depois da normalização do caminho
    for (const ruim of ["https://exemplo.invalid", "//exemplo.invalid", "/\\exemplo.invalid", "javascript:alert(1)", "/entrar", "/api/ubm", "", 5, "ubm",
      "/.//evil.com", "/%2e//evil.com", "/a/..//evil.com", "/./\\evil.com"])
      expect(caminhoDeVolta(ruim)).toBe("");
  });
});

describe("UBM: saldo, reposição e análise", () => {
  const movs = [
    mov("reposicao", "2026-01-01T10:00:00Z", "111", 10), // antes da contagem: some
    mov("contagem", "2026-01-02T10:00:00Z", "111", 4),
    mov("retirada", "2026-01-03T10:00:00Z", "111", 3, { ordem: "4100003", turno: "1º turno", origem: "qr" }),
    mov("reposicao", "2026-01-04T10:00:00Z", "111", 1),
    mov("retirada", "2026-01-05T10:00:00Z", "111", 1, { ordem: "777", turno: "2º turno" }),
    mov("retirada", "2026-01-05T11:00:00Z", "222", 2.5, { ordem: "4100003", turno: "2º turno" }),
    mov("retirada", "2026-01-06T11:00:00Z", "FORA1", 1, { ordem: "4100003", turno: "1º turno" }),
    mov("solicitacao", "2026-01-06T12:00:00Z", "111", 5, { tipoSolicitacao: "acabou" }),
    mov("solicitacao", "2026-01-06T13:00:00Z", "222", 1, { tipoSolicitacao: "acabou", fechadaEm: "2026-01-07T00:00:00Z" }),
  ];

  it("contagem fixa o saldo; reposição soma; retirada subtrai; solicitação não mexe", () => {
    const s = R.saldos(movs);
    expect(R.saldoDe(s, "UBM-01", "111")).toBe(1); // 4 − 3 + 1 − 1
    expect(R.saldoDe(s, "UBM-01", "222")).toBe(-2.5);
    expect(R.saldoDe(s, "UBM-01", "FORA1")).toBe(-1);
    expect(R.saldoDe(s, "UBM-02", "111")).toBe(0);
  });

  it("lista de reposição: abaixo do mínimo, separar padrão − saldo", () => {
    const l = R.listaReposicao([ARM], movs);
    expect(l.map((x) => [x.codigo, x.saldo, x.separar])).toEqual([["111", 1, 3], ["222", -2.5, 12.5]]);
    const cheio = R.listaReposicao([ARM], [...movs, mov("contagem", "2026-02-01T00:00:00Z", "111", 2), mov("contagem", "2026-02-01T00:00:00Z", "222", 10)]);
    expect(cheio).toEqual([]); // 2 não está abaixo do mínimo 2
    expect(R.listaReposicao([{ ...ARM, ativo: false }], movs)).toEqual([]);
  });

  it("análise: por material, líder, ordem/equipamento, semana, fora do kit, abertas, sem ordem na IW38", () => {
    const ordens = new Map([["4100003", { texto: "Troca fictícia", equipamento: "EQ-1", denominacao: "Equipamento fictício" }]]);
    const a = R.analisar([ARM], movs, { armario: "UBM-01" }, ordens, "2026-01-10");
    expect(a.retiradas).toBe(4);
    expect(a.quantidade).toBe(7.5);
    expect(a.porMaterial[0]).toMatchObject({ chave: "111", retiradas: 2, quantidade: 4 });
    expect(a.porLider).toEqual([expect.objectContaining({ chave: "Pessoa Teste", retiradas: 4 })]);
    expect(a.porEquipamento[0]).toMatchObject({ chave: "EQ-1", rotulo: "EQ-1 · Equipamento fictício", retiradas: 3 });
    expect(a.porEquipamento.find((g) => g.chave === "")?.rotulo).toBe("Ordem não encontrada na IW38");
    expect(a.porOrdem[0].rotulo).toBe("4100003 · Troca fictícia");
    expect(a.porSemana.map((g) => g.chave)).toEqual(["2025-12-29", "2026-01-05"]);
    expect(a.foraDoKit).toEqual([expect.objectContaining({ armario: "UBM-01", codigo: "FORA1", quantidade: 1 })]);
    expect(a.solicitacoesAbertas.map((m) => m.codigo)).toEqual(["111"]);
    expect(a.semOrdemNaIw38?.map((m) => m.ordem)).toEqual(["777"]);
    expect(a.parados).toEqual([]);
    // 90 dias depois sem saída: os dois itens do kit ficam parados; sem IW38 não dá para conferir a ordem
    const depois = R.analisar([ARM], movs, {}, null, "2026-06-01");
    expect(depois.parados.map((i) => i.codigo)).toEqual(["111", "222"]);
    expect(depois.semOrdemNaIw38).toBeNull();
    // filtro de período
    expect(R.analisar([ARM], movs, { de: "2026-01-05", ate: "2026-01-05" }, ordens, "2026-01-10").retiradas).toBe(2);
    expect(R.analisar([ARM], movs, { de: "lixo" }, ordens, "2026-01-10").retiradas).toBe(4);
  });

  it("datas pelo dia de Brasília (retirada às 21h30 é do próprio dia)", () => {
    // 05/01/2026 21:30 em Brasília = 06/01 00:30 UTC
    const noite = mov("retirada", "2026-01-06T00:30:00Z", "111", 1);
    expect(R.diaBr(noite.em)).toBe("2026-01-05");
    expect(R.filtrar([noite], { de: "2026-01-05", ate: "2026-01-05" })).toHaveLength(1);
    expect(R.filtrar([noite], { de: "2026-01-06" })).toHaveLength(0);
    // domingo 04/01 21:30 em Brasília: semana que começa na segunda 29/12
    expect(R.semanaDe("2026-01-05T00:30:00Z")).toBe("2025-12-29");
    expect(R.arquivoMovimentos("2026-02-01T01:00:00Z")).toBe("ubm_movimentos_2026-01.json");
    expect(R.ehArquivoMovimentos("ubm_movimentos_2026-01.json")).toBe(true);
    expect(R.ehArquivoMovimentos("ubm_movimentos.json")).toBe(false);
  });

  it("leitura segura do cadastro tolera lixo", () => {
    expect(R.movimentoDe("x", {})).toBeNull();
    expect(R.movimentoDe("abc123", { tipo: "furto", armario: "UBM-01", quantidade: 1 })).toBeNull();
    expect(R.movimentoDe("abc123", { tipo: "retirada", armario: "ARM", quantidade: 1 })).toBeNull();
    expect(R.armarioDe("UBM-01", { nome: "A", itens: [{ codigo: "1", um: "PC", maximo: 2 }, { codigo: "", maximo: 1 }, 5] })?.itens)
      .toEqual([{ codigo: "1", descricao: "", um: "PC", minimo: 2, maximo: 2 }]);
    const m = mov("solicitacao", "2026-01-01T00:00:00Z", "1", 1);
    expect(R.movimentoParaGravar(m)).not.toHaveProperty("origem");
    expect(R.movimentoDe(m.id, R.movimentoParaGravar(m))).toEqual(m);
    // retirada antiga (QR, sem origem gravada, com os campos do SAP Mobile de antes): lida como "qr", campos antigos ignorados
    const antiga = R.movimentoDe("abc123", { tipo: "retirada", armario: "UBM-01", quantidade: 1, codigo: "111", lancadoNaOrdem: true, turno: "1º turno" });
    expect(antiga).toMatchObject({ origem: "qr", turno: "1º turno" });
    expect(antiga).not.toHaveProperty("lancadoNaOrdem");
    expect(R.movimentoDe("abc124", { tipo: "retirada", armario: "UBM-01", quantidade: 1, codigo: "111", origem: "validacao" })?.origem).toBe("validacao");
  });
});

describe("UBM: gravação (fonte na memória)", async () => {
  const { afterAll, beforeAll } = await import("vitest");
  const { _definirFonte } = await import("@/lib/dados/fonte");
  const D = await import("@/lib/ubm/dados");
  beforeAll(() => { _definirFonte(null); });
  afterAll(() => { _definirFonte(undefined); });

  const GESTOR: Quem = { login: "gestor1", nome: "Gestor Teste", gerir: true, validar: true };
  const MANUT: Quem = { login: "manut1", nome: "Manutentor Teste", gerir: false, validar: false };
  const kit = [{ codigo: "8880001", um: "PC", quantidade: "3", minimo: "2" }, { codigo: "8880002", um: "M", quantidade: "5" }];

  it("quem gere: perfil de edição, fora de Terceiro e Manutentor", () => {
    expect(D.podeGerir({ login: "a", perfil: "editor", funcao: "analista" })).toBe(true);
    expect(D.podeGerir({ login: "a", perfil: "admin", funcao: "lider" })).toBe(true);
    expect(D.podeGerir({ login: "a", perfil: "leitor", funcao: "lider" })).toBe(false);
    expect(D.podeGerir({ login: "a", perfil: "editor", funcao: "manutentor" })).toBe(false);
    expect(D.podeGerir({ login: "a", perfil: "editor", funcao: "terceiro" })).toBe(false);
  });

  it("armário: só quem gere cadastra; id não repete", async () => {
    await expect(D.salvarArmario(MANUT, { id: "UBM-90", nome: "Armário teste", local: "", ativo: true, itens: kit }, true)).rejects.toThrow(/Só editores/);
    expect(await D.salvarArmario(GESTOR, { id: "ubm-90", nome: "Armário teste", local: "Linha T", ativo: true, itens: kit }, true)).toBe("UBM-90");
    await expect(D.salvarArmario(GESTOR, { id: "UBM-90", nome: "Outro", local: "", ativo: true, itens: [] }, true)).rejects.toThrow(/Já existe/);
    await expect(D.salvarArmario(GESTOR, { id: "UBM-91", nome: "Outro", local: "", ativo: true, itens: [] }, false)).rejects.toThrow(/não encontrado/);
    const a = await D.armario("UBM-90", true);
    expect(a?.itens.map((i) => [i.codigo, i.um, i.minimo, i.maximo])).toEqual([["8880001", "PC", 2, 3], ["8880002", "M", 5, 5]]);
  });

  it("reposição e contagem: só quem gere; saldo e lista de reposição", async () => {
    await expect(D.lancar(MANUT, "UBM-90", "reposicao", [{ codigo: "8880001", quantidade: "3" }])).rejects.toThrow(/Só editores/);
    await expect(D.lancar(MANUT, "UBM-90", "contagem", [{ codigo: "8880001", quantidade: "3" }])).rejects.toThrow(/Só editores/);
    expect(await D.lancar(GESTOR, "UBM-90", "contagem", [{ codigo: "8880001", quantidade: "3" }, { codigo: "8880002", quantidade: "0" }])).toBe(2);
    await expect(D.lancar(GESTOR, "UBM-90", "reposicao", [{ codigo: "8880001", quantidade: "0" }])).rejects.toThrow(/Quantidade/);
    const movs = (await D.lerMovimentos(true)).filter((m) => m.armario === "UBM-90");
    const lista = R.listaReposicao([(await D.armario("UBM-90", true))!], movs);
    expect(lista.map((l) => [l.codigo, l.separar])).toEqual([["8880002", 5]]);
  });

  it("solicitação: quem vê a aba registra; só quem gere fecha", async () => {
    const id = await D.registrarSolicitacao(MANUT, "UBM-90", { tipo: "faltando", codigo: "", quantidade: "", observacao: "Chave fictícia" }, null);
    await expect(D.fecharSolicitacao(MANUT, id)).rejects.toThrow(/Só editores/);
    await D.fecharSolicitacao(GESTOR, id);
    expect((await D.lerMovimentos(true)).find((x) => x.id === id)?.fechadaPor).toBe("Gestor Teste");
    await expect(D.fecharSolicitacao(GESTOR, id)).rejects.toThrow(/já foi fechada/);
  });

  it("movimentos em cadastros mensais (mês de Brasília); a leitura junta todos os meses", async () => {
    const { listarCadastros, lerCadastro } = await import("@/lib/dados/cadastros");
    const meses = await listarCadastros(R.ehArquivoMovimentos);
    expect(meses.length).toBeGreaterThan(1); // a demonstração tem movimentos de vários meses
    const doMes = await lerCadastro(R.arquivoMovimentos(new Date().toISOString()));
    const ultimo = (await D.lerMovimentos(true)).find((m) => m.armario === "UBM-90" && m.tipo === "solicitacao");
    expect(ultimo && doMes[ultimo.id]).toBeTruthy();
    expect((await D.lerMovimentos()).some((m) => m.id === "demo0ubm0cont10")).toBe(true);
  });

  it("demonstração: armários e movimentos fictícios, com fotos legíveis", async () => {
    const [arms, movs] = await Promise.all([D.lerArmarios(true), D.lerMovimentos(true)]);
    expect(arms.map((a) => a.id)).toEqual(expect.arrayContaining(["UBM-01", "UBM-02"]));
    // retirada antiga do QR: continua lida, com a foto
    const r = movs.find((m) => m.id === "demo0ubm0ret01")!;
    expect(r.origem).toBe("qr");
    expect((await D.lerFoto(r.id))?.tipo).toBe("image/png");
    expect(movs.some((m) => m.tipo === "solicitacao" && !m.fechadaEm)).toBe(true);
  });
});

// ---------------------------------------------------------------------------- rota /api/ubm (QR para baixar)
let quemRota: { login: string; nome: string; funcao: string; perfil: string; abas?: string[] } | null = null;
vi.mock("@/lib/auth/sessao", () => ({
  autorizar: async (aba: string) => (quemRota && (!quemRota.abas || quemRota.abas.includes(aba)) ? quemRota : null),
}));

describe("UBM: rota de QR", async () => {
  const { afterAll, beforeAll } = await import("vitest");
  const { NextRequest } = await import("next/server");
  const { _definirFonte } = await import("@/lib/dados/fonte");
  const rota = await import("@/app/api/ubm/route");
  beforeAll(() => { _definirFonte(null); });
  afterAll(() => { _definirFonte(undefined); quemRota = null; });
  const pedir = (q: Record<string, string>) => rota.GET(new NextRequest(`http://localhost/api/ubm?${new URLSearchParams(q)}`));

  it("SVG e PNG para quem vê a aba; etiqueta em SVG; QR de retirada desativado (404); 403 sem a aba", async () => {
    quemRota = { login: "l1", nome: "Líder Teste", funcao: "lider", perfil: "editor" };
    const svg = await pedir({ qr: "solicitacao", u: "UBM-01", formato: "svg" });
    expect(svg.status).toBe(200);
    expect(svg.headers.get("content-disposition")).toContain('attachment; filename="UBM-01_solicitacao_qr.svg"');
    const texto = await svg.text();
    expect(texto).toMatch(/^<\?xml[^>]*>\n<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(texto).toContain("</svg>");
    const png = await pedir({ qr: "solicitacao", u: "UBM-01", formato: "png" });
    expect(png.headers.get("content-disposition")).toContain("UBM-01_solicitacao_qr.png");
    const bytes = new Uint8Array(await png.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // ~1200 px de largura (cabeçalho IHDR)
    expect(new DataView(bytes.buffer).getUint32(16)).toBeGreaterThanOrEqual(1100);
    const et = await (await pedir({ qr: "solicitacao", u: "UBM-01", formato: "etiqueta" })).text();
    expect(et).toContain("SOLICITAÇÃO");
    expect(et).toContain("UBM-01");
    expect(et).toContain("/ubm/solicitacao?u=UBM-01");
    expect(et).not.toContain("RETIRADA");
    expect((await pedir({ qr: "retirada", u: "UBM-01", formato: "svg" })).status).toBe(404);
    expect((await pedir({ qr: "outro", u: "UBM-01" })).status).toBe(400);
    expect((await pedir({ qr: "solicitacao", u: "UBM-77" })).status).toBe(404);
    // a retirada pelo QR acabou: o POST antigo responde 410 com a orientação
    const f = new FormData();
    f.set("acao", "retirada");
    const pos = await rota.POST(new NextRequest("http://localhost/api/ubm", { method: "POST", body: f }));
    expect(pos.status).toBe(410);
    expect((await pos.json()).erro).toMatch(/confirmada pelo líder na validação/);
    quemRota = { login: "m1", nome: "Manutentor Teste", funcao: "manutentor", perfil: "leitor", abas: ["estoque"] };
    expect((await pedir({ qr: "solicitacao", u: "UBM-01", formato: "svg" })).status).toBe(403);
    quemRota = null;
    expect((await pedir({ qr: "solicitacao", u: "UBM-01", formato: "png" })).status).toBe(403);
  });
});
