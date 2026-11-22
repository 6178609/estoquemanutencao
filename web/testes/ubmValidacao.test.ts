import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as R from "@/lib/ubm/regras";
import * as V from "@/lib/ubm/validacao";
import { dia } from "@/lib/wcm/util";

/** Validação do líder (IW13 × ordens de quebra). Só dados fictícios. */
const KIT: R.ItemKit[] = [
  { codigo: "111", descricao: "Peça fictícia", um: "PC", minimo: 2, maximo: 4 },
  { codigo: "222", descricao: "Cabo fictício", um: "M", minimo: 5, maximo: 10 },
];
const A1: R.Armario = { id: "UBM-01", nome: "Armário um", local: "", ativo: true, itens: KIT, criadoEm: "" };
const A2: R.Armario = { id: "UBM-02", nome: "Armário dois", local: "", ativo: true, itens: [KIT[0]], criadoEm: "" };
const A3: R.Armario = { id: "UBM-03", nome: "Armário desativado", local: "", ativo: false, itens: [{ ...KIT[0], codigo: "333" }], criadoEm: "" };
const D = (iso: string) => dia(...(iso.split("-").map(Number) as [number, number, number]))!;
const linha = (ordem: string, material: string, quantidade: number, data = "2026-01-10", um = "PC"): V.LinhaIw13 =>
  ({ ordem, material, quantidade, um, descricao: "", equipamento: "EQ-1", data: D(data) });
const ORDENS = V.mapaOrdens(
  [{ ordem: "004100001", tipo: "YM11", texto: "Quebra fictícia", equipamento: "EQ-1" }, { ordem: "4100002", tipo: "YM13", texto: "Preventiva", equipamento: "EQ-1" },
    { ordem: "4100003", tipo: "YM12", texto: "Corretiva com nota de quebra", equipamento: "EQ-2" }],
  [{ ordem: "4100003", quebra: true, nota: "N1", descricao: "Nota de quebra fictícia" }, { ordem: "4100002", quebra: false, nota: "N2", descricao: "Y2" },
    { ordem: "4100009", quebra: true, nota: "N9", descricao: "Só na IW28", equipamento: "EQ-9" }]);
const contagem = (armario: string, codigo: string, q: number, em = "2026-01-01T10:00:00Z"): R.Movimento => ({ id: `c${armario}${codigo}`.toLowerCase().replace(/-/g, ""),
  tipo: "contagem", armario, em, por: "p", porNome: "P", codigo, quantidade: q, ordem: "", turno: "", uso: "", observacao: "", tipoSolicitacao: "",
  foto: null, fechadaEm: "", fechadaPor: "", origem: "" });
const FILTRO = { de: "2026-01-01", ate: "2026-01-31" };

describe("UBM: validação do líder (regras)", () => {
  it("quebra pela regra do site: 'y1' só com nota de quebra; 'ym11' pelo tipo YM11 ou nota", () => {
    const y1 = V.mapaOrdens([{ ordem: "4100001", tipo: "YM11", texto: "", equipamento: "" }, { ordem: "4100003", tipo: "YM12", texto: "", equipamento: "" }],
      [{ ordem: "4100003", quebra: true, nota: "N1", descricao: "" }], new Map(), "y1");
    expect(y1.get("4100001")?.quebra).toBe(false);
    expect(y1.get("4100003")?.quebra).toBe(true);
    expect(ORDENS.get("4100001")?.quebra).toBe(true);
    expect(ORDENS.get("4100002")?.quebra).toBe(false);
    expect(ORDENS.get("4100003")).toMatchObject({ quebra: true, nota: "N1" });
    expect(ORDENS.get("4100009")).toMatchObject({ quebra: true, equipamento: "EQ-9" });
  });

  it("lista: soma as linhas repetidas, só Tomados > 0, só itens do kit de armário ativo, só ordem de quebra, no período", () => {
    const l = [linha("4100001", "000000000000000111", 1), linha("4100001", "111", 1, "2026-01-12"), linha("4100001", "222", 1.25, "2026-01-10", "M"),
      linha("4100001", "999", 3), linha("4100001", "333", 1), linha("4100002", "111", 1), linha("4100003", "222", 0.5, "2026-01-05", "M"),
      linha("4100001", "222", 0), linha("4100003", "111", 2, "2025-12-20")];
    const p = V.pendencias(l, ORDENS, [A1, A2, A3], [], [], FILTRO);
    expect(p.map((o) => o.ordem)).toEqual(["4100001", "4100003"]);
    expect(p[0].data).toBe("2026-01-12");
    expect(p[0].itens.map((i) => [i.codigo, i.tomada])).toEqual([["111", 2], ["222", 1.25]]);
    // o 111 está em dois armários: o líder escolhe
    expect(p[0].itens[0].armarios.map((a) => a.id)).toEqual(["UBM-01", "UBM-02"]);
    expect(p[1].itens.map((i) => i.codigo)).toEqual(["222"]); // o 111 dessa ordem é de dezembro (fora do período)
    expect(V.totalPendente(p)).toBe(3);
    // filtro de armário: só o kit dele
    expect(V.totalPendente(V.pendencias(l, ORDENS, [A1, A2], [], [], { ...FILTRO, armario: "UBM-02" }))).toBe(1);
  });

  it("exclusões: retirada já registrada (QR antigo ou validação) e linha já validada (inclusive Almox)", () => {
    const l = [linha("4100001", "111", 1), linha("4100001", "222", 2, "2026-01-10", "M"), linha("4100003", "111", 1)];
    const qr: R.Movimento = { ...contagem("UBM-01", "111", 1), id: "qr0001", tipo: "retirada", ordem: "0004100001", origem: "qr" };
    const almox: V.Validacao = { chave: "4100003|111#1", linha: "4100003|111", ordem: "4100003", codigo: "111", decisao: "almox", armario: "", quantidade: 1,
      um: "PC", tomada: 1, umIw13: "PC", dataIw13: "2026-01-10", equipamento: "", em: "2026-01-11T10:00:00Z", por: "l", porNome: "Líder", movimento: "" };
    const p = V.pendencias(l, ORDENS, [A1], [qr], [almox], FILTRO);
    expect(p.flatMap((o) => o.itens.map((i) => i.chave))).toEqual(["4100001|222"]);
    // consumo novo na mesma ordem (IW13 atualizada): volta pendente só a diferença, em um lote novo
    const mais = V.pendencias([...l, linha("4100003", "111", 2, "2026-01-15"), linha("4100001", "111", 0.5)], ORDENS, [A1], [qr], [almox], FILTRO)
      .flatMap((o) => o.itens);
    expect(mais.find((i) => i.chave === "4100003|111")).toMatchObject({ tomada: 2, tomadaTotal: 3, jaCoberta: 1 });
    expect(mais.find((i) => i.chave === "4100001|111")).toMatchObject({ tomada: 0.5, jaCoberta: 1 });
    expect(V.proximaChave("4100003|111", [almox])).toBe("4100003|111#2");
    expect(V.proximaChave("4100009|111", [almox])).toBe("4100009|111#1");
  });

  it("decisão: Almox sem mais nada; UBM com armário (obrigatório se mais de um) e quantidade (2 casas conforme a UM do kit)", () => {
    const [o] = V.pendencias([linha("4100001", "111", 2), linha("4100001", "222", 1.5, "2026-01-10", "M")], ORDENS, [A1, A2], [contagem("UBM-01", "111", 4)], [], FILTRO);
    const [pc, m] = o.itens;
    expect(V.validarDecisao({ decisao: "almox", armario: "", quantidade: "" }, pc)).toMatchObject({ decisao: "almox", armario: "", quantidade: 2 });
    expect(V.validarDecisao({ decisao: "ubm", armario: "", quantidade: "" }, pc)).toEqual({ erro: "Escolha de qual armário saiu o material." });
    expect(V.validarDecisao({ decisao: "ubm", armario: "UBM-02", quantidade: "" }, pc)).toMatchObject({ armario: "UBM-02", quantidade: 2, um: "PC" });
    expect(V.validarDecisao({ decisao: "ubm", armario: "UBM-01", quantidade: "1,5" }, pc)).toEqual({ erro: "Quantidade em PC: só número inteiro." });
    // um armário só: vale ele; M aceita 2 casas
    expect(V.validarDecisao({ decisao: "ubm", armario: "", quantidade: "1,25" }, m)).toMatchObject({ armario: "UBM-01", quantidade: 1.25, um: "M" });
    expect("erro" in V.validarDecisao({ decisao: "ubm", armario: "", quantidade: "1,255" }, m)).toBe(true);
    expect("erro" in V.validarDecisao({ decisao: "ubm", armario: "UBM-09", quantidade: "1" }, m)).toBe(true);
    expect("erro" in V.validarDecisao({ decisao: "outra", armario: "", quantidade: "" }, m)).toBe(true);
    expect(pc.armarios.find((a) => a.id === "UBM-01")?.saldo).toBe(4);
    // UM da IW13 diferente da do kit: sem padrão, a quantidade tem de vir na UM do kit
    const [o2] = V.pendencias([linha("4100001", "222", 3, "2026-01-10", "PC")], ORDENS, [A1], [], [], FILTRO);
    expect(V.validarDecisao({ decisao: "ubm", armario: "", quantidade: "" }, o2.itens[0])).toEqual({ erro: "UM diferente (IW13: PC, kit: M): informe a quantidade em M." });
    expect(V.validarDecisao({ decisao: "ubm", armario: "", quantidade: "4,5" }, o2.itens[0])).toMatchObject({ quantidade: 4.5, um: "M" });
    expect(V.umIgual("PÇ", "PC")).toBe(true);
  });

  it("a retirada da validação leva a data da IW13: contagem depois do consumo e antes da validação não baixa duas vezes", () => {
    const ret: R.Movimento = { ...contagem("UBM-01", "111", 1), id: "val0001", tipo: "retirada", em: V.emDaRetirada("2026-01-01", "2026-01-05T10:00:00Z"), origem: "validacao" };
    expect(ret.em).toBe("2026-01-01T15:00:00.000Z");
    expect(R.diaBr(ret.em)).toBe("2026-01-01");
    const movs = [contagem("UBM-01", "111", 5, "2025-12-20T10:00:00Z"), { ...contagem("UBM-01", "111", 3, "2026-01-03T10:00:00Z"), id: "cont0003" }, ret];
    expect(R.saldoDe(R.saldos(movs), "UBM-01", "111")).toBe(3); // = a contagem do dia 3 (a retirada do dia 1 já estava fora)
    expect(V.emDaRetirada("", "2026-01-05T10:00:00Z")).toBe("2026-01-05T10:00:00Z");
  });

  it("permissões: desfazer só quem gere; validar quem vê a aba e não é Terceiro/Manutentor", async () => {
    expect(V.podeDesfazer({ gerir: true })).toBe(true);
    expect(V.podeDesfazer({ gerir: false })).toBe(false);
    const Dd = await import("@/lib/ubm/dados");
    expect(Dd.podeValidar({ login: "a", perfil: "leitor", funcao: "lider" })).toBe(true);
    expect(Dd.podeValidar({ login: "a", perfil: "editor", funcao: "analista" })).toBe(true);
    expect(Dd.podeValidar({ login: "a", perfil: "editor", funcao: "manutentor" })).toBe(false);
    expect(Dd.podeValidar({ login: "a", perfil: "editor", funcao: "terceiro" })).toBe(false);
    expect(Dd.quemDe({ login: "a", perfil: "leitor", funcao: "lider" })).toMatchObject({ validar: true, gerir: false });
  });

  it("análise: Almox com o saldo da UBM no dia e o tempo até a validação", () => {
    const v = (codigo: string, decisao: V.Decisao, dataIw13: string, em: string, tomada = 1, umIw13 = "PC"): V.Validacao => {
      const linha = V.chaveValidacao(`41${codigo}${dataIw13.slice(-2)}`, codigo);
      return { chave: `${linha}#1`, linha, ordem: "4100001", codigo, decisao, armario: decisao === "ubm" ? "UBM-01" : "", quantidade: tomada, um: umIw13, tomada, umIw13,
        dataIw13, equipamento: "", em, por: "l", porNome: "Líder", movimento: "" };
    };
    const movs = [contagem("UBM-01", "111", 0, "2026-01-01T10:00:00Z"), contagem("UBM-01", "222", 3, "2026-01-01T10:00:00Z")];
    const vs = [v("111", "almox", "2026-01-10", "2026-01-12T12:00:00Z"), v("222", "almox", "2026-01-10", "2026-01-11T12:00:00Z", 5, "M"),
      v("222", "almox", "2026-01-11", "2026-01-11T12:00:00Z", 2, "M"), v("111", "ubm", "2026-01-09", "2026-01-15T12:00:00Z"), v("999", "almox", "2026-01-10", "2026-01-10T12:00:00Z")];
    const a = V.analisarValidacoes(vs, [A1], movs, FILTRO);
    expect([a.validacoes, a.ubm, a.almox, a.pctUbm]).toEqual([5, 1, 4, 20]);
    expect(a.doAlmox.map((x) => [x.codigo, x.motivo])).toEqual([["111", "sem_saldo"], ["222", "saldo_insuficiente"], ["222", "nao_usada"]]);
    expect([a.diasMedia, a.diasMediana, a.diasMax]).toEqual([1.8, 1, 6]);
    // UMs diferentes (IW13 em PC, kit em M): não compara as quantidades, só se havia saldo
    expect(V.analisarValidacoes([v("222", "almox", "2026-01-10", "2026-01-11T12:00:00Z", 5, "PC")], [A1], movs, FILTRO).doAlmox[0].motivo).toBe("nao_usada");
  });

  it("leitura segura do cadastro", () => {
    expect(V.validacaoDe("4100001|111", { decisao: "talvez", quantidade: 1 })).toBeNull();
    expect(V.validacaoDe("4100001|111", { decisao: "ubm", quantidade: 1, armario: "lixo" })).toBeNull();
    expect(V.validacaoDe("sem-barra", { decisao: "almox", quantidade: 1 })).toBeNull();
    const ok: V.Validacao = { chave: "4100001|111#2", linha: "4100001|111", ordem: "4100001", codigo: "111", decisao: "ubm", armario: "UBM-01", quantidade: 1, um: "PC", tomada: 1, umIw13: "PC",
      dataIw13: "2026-01-10", equipamento: "EQ-1", em: "2026-01-11T12:00:00Z", por: "l", porNome: "Líder", movimento: "abc123" };
    expect(V.validacaoDe(ok.chave, V.validacaoParaGravar(ok))).toEqual(ok);
    expect(V.filtrarValidacoes([ok], { decisao: "almox" })).toEqual([]);
    expect(V.filtrarValidacoes([ok], { decisao: "ubm", de: "2026-01-11" })).toHaveLength(1);
  });
});

describe("UBM: validação do líder (gravação, demonstração)", async () => {
  const { _definirFonte } = await import("@/lib/dados/fonte");
  const Dd = await import("@/lib/ubm/dados");
  beforeAll(() => { _definirFonte(null); });
  afterAll(() => { _definirFonte(undefined); });
  const LIDER = { login: "lider1", nome: "Líder Teste", gerir: false, validar: true };
  const OUTRO = { login: "lider2", nome: "Outro Líder", gerir: false, validar: true };
  const GESTOR = { login: "gestor1", nome: "Gestor Teste", gerir: true, validar: true };
  const MANUT = { login: "manut1", nome: "Manutentor Teste", gerir: false, validar: false };
  const pend = async () => {
    const [iw13, ordens, arms, movs, vs] = await Promise.all([Dd.linhasIw13(), Dd.ordensDeQuebra(), Dd.lerArmarios(true), Dd.lerMovimentos(true), Dd.lerValidacoes(true)]);
    return { itens: V.pendencias(iw13.dados ?? [], ordens ?? new Map(), arms, movs, vs, {}).flatMap((p) => p.itens), movs };
  };

  it("a demonstração tem pendências na UBM-01 (IW13 fictícia em ordens YM11), sem a ordem que não é de quebra nem o item fora do kit", async () => {
    const { itens } = await pend();
    expect(itens.length).toBeGreaterThanOrEqual(5);
    expect(itens.every((i) => i.armarios.some((a) => a.id === "UBM-01"))).toBe(true);
    expect(itens.some((i) => i.codigo === "900063")).toBe(false);
    expect(itens.find((i) => i.codigo === "900028")?.tomada).toBe(2.5); // 1,5 + 1 somadas
  });

  it("Veio da UBM: cria a retirada (origem validação, data da IW13) que baixa o saldo; a linha some; a segunda é recusada; Manutentor não valida", async () => {
    const { itens, movs } = await pend();
    const it = itens.find((i) => i.codigo === "900021")!;
    await expect(Dd.validar(MANUT, it.chave, { decisao: "almox", armario: "", quantidade: "" })).rejects.toThrow(/validação é do líder/);
    const antes = R.saldoDe(R.saldos(movs), "UBM-01", "900021");
    const v = await Dd.validar(LIDER, it.chave, { decisao: "ubm", armario: "UBM-01", quantidade: "1" });
    expect(v.chave).toBe(`${it.chave}#1`);
    const depois = await pend();
    expect(R.saldoDe(R.saldos(depois.movs), "UBM-01", "900021")).toBe(antes - 1);
    const m = depois.movs.find((x) => x.id === v.movimento)!;
    expect(m).toMatchObject({ tipo: "retirada", origem: "validacao", quantidade: 1, uso: R.USO_VALIDACAO, turno: "", foto: null, por: "lider1" });
    expect(R.diaBr(m.em)).toBe(it.data);
    expect(depois.itens.some((i) => i.chave === it.chave)).toBe(false);
    await expect(Dd.validar(OUTRO, it.chave, { decisao: "almox", armario: "", quantidade: "" })).rejects.toThrow(/Já validado por Líder Teste/);
  });

  it("contagem depois do consumo e antes da validação: o saldo fica = contagem (a retirada leva a data da IW13)", async () => {
    const it = (await pend()).itens.find((i) => i.codigo === "900028")!;
    await Dd.lancar(GESTOR, "UBM-01", "contagem", [{ codigo: "900028", quantidade: "7" }]);
    await Dd.validar(LIDER, it.chave, { decisao: "ubm", armario: "UBM-01", quantidade: "2,5" });
    expect(R.saldoDe(R.saldos(await Dd.lerMovimentos(true)), "UBM-01", "900028")).toBe(7);
  });

  it("Veio do Almox: só registra (saldo não muda); desfazer só para quem gere, e o desfazer da UBM apaga a retirada", async () => {
    const { itens, movs } = await pend();
    const it = itens.find((i) => i.codigo === "900014")!;
    const saldo = () => R.saldoDe(R.saldos(movs), "UBM-01", "900014");
    const s0 = saldo();
    const v = await Dd.validar(LIDER, it.chave, { decisao: "almox", armario: "", quantidade: "" });
    const depois = await pend();
    expect(R.saldoDe(R.saldos(depois.movs), "UBM-01", "900014")).toBe(s0);
    await expect(Dd.desfazerValidacao(LIDER, v.chave)).rejects.toThrow(/Só editores/);
    await Dd.desfazerValidacao(GESTOR, v.chave);
    expect((await pend()).itens.some((i) => i.chave === it.chave)).toBe(true);
    // desfazer a "Veio da UBM": a retirada sai e o saldo volta
    const ubm = (await Dd.lerValidacoes(true)).find((x) => x.decisao === "ubm" && x.codigo === "900028")!;
    await Dd.desfazerValidacao(GESTOR, ubm.chave);
    expect((await Dd.lerMovimentos(true)).some((x) => x.id === ubm.movimento)).toBe(false);
    await expect(Dd.desfazerValidacao(GESTOR, ubm.chave)).rejects.toThrow(/não encontrada/);
  });

  it("linha que não está pendente é recusada (chave inventada)", async () => {
    await expect(Dd.validar(LIDER, "123|900007", { decisao: "almox", armario: "", quantidade: "" })).rejects.toThrow(/não está mais pendente/);
  });
});
