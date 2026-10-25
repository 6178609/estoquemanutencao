import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  concluirManualEmPartes,
  documentoEmPartes,
  documentosDe,
  enviarParteManual,
  iniciarManualEmPartes,
  removerDocumento,
} from "@/lib/dados/documentos";
import { _definirFonte } from "@/lib/dados/fonte";
import {
  _limparDemoPartes,
  envioExpirado,
  envioIdValido,
  fluxoDoEnvio,
  indiceValido,
  LIMITE_MANUAL_GRANDE,
  MAX_PARTES,
  numeroDePartes,
  parteValida,
  tamanhoDaParte,
  partesFaltando,
  PASTA_PARTES,
  podeIniciarEnvio,
  TAMANHO_PARTE,
} from "@/lib/dados/manuaisPartes";
import { _definirSupabase } from "@/lib/dados/supabase";

// tudo fictício; sem repositório de dados = modo demonstração (memória)
const PDF_INICIO = new TextEncoder().encode("%PDF-1.7\n");

/** Um PDF fictício de `tamanho` bytes (cabeçalho + zeros). */
function pdf(tamanho: number): Uint8Array {
  const b = new Uint8Array(tamanho);
  b.set(PDF_INICIO, 0);
  return b;
}

/** Junta os bytes de um fluxo (como o download faria). */
async function juntar(fluxo: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const pedacos: Uint8Array[] = [];
  const leitor = fluxo.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    pedacos.push(value);
  }
  const todo = new Uint8Array(pedacos.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of pedacos) {
    todo.set(p, pos);
    pos += p.length;
  }
  return todo;
}

describe("manuais em partes: regras", () => {
  it("1 parte por 3,5 MB, até 29 partes para 100 MB", () => {
    expect(TAMANHO_PARTE).toBe(3_500_000);
    expect(numeroDePartes(4_000_001)).toBe(2);
    expect(numeroDePartes(TAMANHO_PARTE)).toBe(1);
    expect(numeroDePartes(TAMANHO_PARTE + 1)).toBe(2);
    expect(numeroDePartes(LIMITE_MANUAL_GRANDE)).toBe(MAX_PARTES);
    expect(MAX_PARTES).toBe(29);
  });

  it("índice dentro do total e parte de 1 byte a 3,5 MB", () => {
    expect(indiceValido(0, 2)).toBe(true);
    expect(indiceValido(1, 2)).toBe(true);
    expect(indiceValido(2, 2)).toBe(false);
    expect(indiceValido(-1, 2)).toBe(false);
    expect(indiceValido(0.5, 2)).toBe(false);
    expect(parteValida(0)).toBe(false);
    expect(parteValida(1)).toBe(true);
    expect(parteValida(TAMANHO_PARTE)).toBe(true);
    expect(parteValida(TAMANHO_PARTE + 1)).toBe(false);
    // todas as partes têm o tamanho cheio, menos a última (o resto)
    expect(tamanhoDaParte(0, TAMANHO_PARTE * 2 + 10)).toBe(TAMANHO_PARTE);
    expect(tamanhoDaParte(1, TAMANHO_PARTE * 2 + 10)).toBe(TAMANHO_PARTE);
    expect(tamanhoDaParte(2, TAMANHO_PARTE * 2 + 10)).toBe(10);
  });

  it("id de envio: 24 hexadecimais (nada de caminho)", () => {
    expect(envioIdValido("0123456789abcdef01234567")).toBe(true);
    expect(envioIdValido("../0123456789abcdef0123")).toBe(false);
    expect(envioIdValido("0123456789ABCDEF01234567")).toBe(false);
    expect(envioIdValido(undefined)).toBe(false);
  });

  it("envio expira 2 h depois de começar; data inválida conta como expirado", () => {
    const inicio = Date.parse("2026-01-01T10:00:00Z");
    const e = { expiraEm: new Date(inicio + 2 * 60 * 60_000).toISOString() };
    expect(envioExpirado(e, inicio + 60 * 60_000)).toBe(false);
    expect(envioExpirado(e, inicio + 2 * 60 * 60_000)).toBe(true);
    expect(envioExpirado({ expiraEm: "não é data" }, inicio)).toBe(true);
  });

  it("até 10 inícios de envio por pessoa a cada hora", () => {
    const agora = Date.parse("2026-01-01T10:00:00Z");
    for (let i = 0; i < 10; i++) expect(podeIniciarEnvio("pessoa-x", agora + i)).toBe(true);
    expect(podeIniciarEnvio("pessoa-x", agora + 11)).toBe(false);
    expect(podeIniciarEnvio("pessoa-y", agora + 11)).toBe(true);
    expect(podeIniciarEnvio("pessoa-x", agora + 60 * 60_000 + 20)).toBe(true);
  });

  it("a pasta das partes é fixa na fonte", () => {
    expect(PASTA_PARTES).toBe("app/documentos/partes");
  });
});

describe("manuais em partes: envio completo (demonstração)", () => {
  beforeAll(() => { _definirFonte(null); _definirSupabase(null); _limparDemoPartes(); });
  afterAll(() => { _definirFonte(undefined); _definirSupabase(undefined); _limparDemoPartes(); });

  const TAMANHO = 4_100_000; // 2 partes: 3,5 MB e 0,6 MB
  const original = pdf(TAMANHO);

  it("inicia, envia as partes, conclui, baixa e remove (vários equipamentos)", async () => {
    const ini = await iniciarManualEmPartes(["PRE-01", "PRE-02"], { titulo: "Manual da prensa", nome: "prensa.pdf", tamanho: TAMANHO }, "usuario-x", "Usuário X");
    expect(ini.total).toBe(2);
    expect(envioIdValido(ini.envio)).toBe(true);

    // quem não começou o envio não manda parte nem conclui
    await expect(enviarParteManual(ini.envio, 0, original.slice(0, 10), "outra-pessoa")).rejects.toThrow(/Só quem começou/);
    await expect(concluirManualEmPartes(ini.envio, "outra-pessoa")).rejects.toThrow(/Só quem começou/);

    // índice fora do total e parte grande demais são recusados
    await expect(enviarParteManual(ini.envio, 2, original.slice(0, 10), "usuario-x")).rejects.toThrow(/fora do envio/);
    await expect(enviarParteManual(ini.envio, 0, pdf(TAMANHO_PARTE + 1), "usuario-x")).rejects.toThrow(/tamanho inválido/);
    // parte com tamanho diferente do esperado (a 1ª precisa ser cheia; a última, o resto exato)
    await expect(enviarParteManual(ini.envio, 0, original.slice(0, 1000), "usuario-x")).rejects.toThrow(/tamanho inválido/);
    await expect(enviarParteManual(ini.envio, 1, original.slice(TAMANHO_PARTE, TAMANHO_PARTE + 10), "usuario-x")).rejects.toThrow(/tamanho inválido/);

    // concluir antes de todas as partes: faltam
    await enviarParteManual(ini.envio, 0, original.slice(0, TAMANHO_PARTE), "usuario-x");
    expect(await partesFaltando(ini.envio, 2)).toEqual([1]);
    await expect(concluirManualEmPartes(ini.envio, "usuario-x")).rejects.toThrow(/Faltam 1 parte/);

    // a parte 0 pode ser reenviada (tentativa anterior pode ter chegado pela metade)
    await enviarParteManual(ini.envio, 0, original.slice(0, TAMANHO_PARTE), "usuario-x");
    await enviarParteManual(ini.envio, 1, original.slice(TAMANHO_PARTE), "usuario-x");
    expect(await partesFaltando(ini.envio, 2)).toEqual([]);

    const vinculos = await concluirManualEmPartes(ini.envio, "usuario-x");
    expect(vinculos.map((v) => v.tag)).toEqual(["PRE-01", "PRE-02"]);
    const origem = vinculos[0].doc;
    expect(origem).toMatchObject({ titulo: "Manual da prensa", tipo: "application/pdf", tamanho: TAMANHO, nome: "prensa.pdf", por: "Usuário X" });
    expect(origem.partes).toEqual({ envio: ini.envio, total: 2 });
    expect(vinculos[1].doc.origem).toEqual({ tag: "PRE-01", id: origem.id });
    // conclui uma vez só: o estado do envio já saiu
    await expect(concluirManualEmPartes(ini.envio, "usuario-x")).rejects.toThrow(/não encontrado/);

    // a lista de cada equipamento mostra o manual (com as partes na origem e a referência)
    expect((await documentosDe("PRE-02")).map((d) => d.origem?.tag)).toEqual(["PRE-01"]);

    // o download lê as partes na ordem (a referência também)
    expect(await documentoEmPartes("PRE-01", origem.id)).toMatchObject({ nome: "prensa.pdf", tipo: "application/pdf", tamanho: TAMANHO });
    const direto = await juntar(fluxoDoEnvio(ini.envio, 2));
    expect(direto.length).toBe(TAMANHO);
    expect(Array.from(direto)).toEqual(Array.from(original));
    const pelaReferencia = await documentoEmPartes("PRE-02", vinculos[1].doc.id);
    expect(pelaReferencia?.partes.envio).toBe(ini.envio);

    // enquanto houver referência, a origem não sai; depois, as partes saem com o último vínculo
    await expect(removerDocumento("PRE-01", origem.id, "Teste")).rejects.toThrow(/vinculado a 1 outro/);
    await removerDocumento("PRE-02", vinculos[1].doc.id, "Teste");
    await removerDocumento("PRE-01", origem.id, "Teste");
    expect(await documentosDe("PRE-01")).toEqual([]);
    expect(await partesFaltando(ini.envio, 2)).toEqual([0, 1]);
  });

  it("arquivo que não é PDF nem imagem não entra; as partes saem junto", async () => {
    const texto = new TextEncoder().encode("texto simples ".repeat(400_000));
    const ini = await iniciarManualEmPartes(["PRE-03"], { titulo: "Não é manual", nome: "x.txt", tamanho: texto.length }, "usuario-z", "Z");
    await enviarParteManual(ini.envio, 0, texto.slice(0, TAMANHO_PARTE), "usuario-z");
    await enviarParteManual(ini.envio, 1, texto.slice(TAMANHO_PARTE), "usuario-z");
    await expect(concluirManualEmPartes(ini.envio, "usuario-z")).rejects.toThrow(/PDF ou uma imagem/);
    expect(await partesFaltando(ini.envio, 2)).toEqual([0, 1]);
    expect(await documentosDe("PRE-03")).toEqual([]);
  });

  it("tamanho do manual fora de 4 MB a 100 MB é recusado antes de começar", async () => {
    await expect(iniciarManualEmPartes(["PRE-04"], { titulo: "Pequeno", nome: "p.pdf", tamanho: 1_000 }, "u", "U")).rejects.toThrow(/entre 4 MB e 100 MB/);
    await expect(iniciarManualEmPartes(["PRE-04"], { titulo: "Grande", nome: "g.pdf", tamanho: LIMITE_MANUAL_GRANDE + 1 }, "u", "U")).rejects.toThrow(/entre 4 MB e 100 MB/);
  });
});
