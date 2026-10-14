import { afterEach, describe, expect, it, vi } from "vitest";

import { _definirFonte, fonte } from "@/lib/dados/fonte";
import { prepararIw38, type Crua } from "@/lib/wcm/preparo";
import { dia } from "@/lib/wcm/util";

/** Leitura dos dados resistente a falhas do GitHub e campo de ordenação vindo do IW38 já preparado (dados fictícios). */

const resposta = (corpo: unknown, status = 200, cab: Record<string, string> = {}) =>
  new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status, headers: cab });
const ARVORE = { tree: [{ path: "app/x.json", type: "blob", sha: "s1" }] };

function comGitHub(respostas: (() => Response | Promise<Response>)[]) {
  vi.stubEnv("DADOS_GH_REPO", "exemplo/dados");
  vi.stubEnv("DADOS_GH_TOKEN", "fake");
  _definirFonte(undefined);
  const chamadas: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    chamadas.push(url);
    const r = respostas.shift();
    if (!r) throw new Error("sem resposta");
    return r();
  }));
  return { f: fonte()!, chamadas };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  _definirFonte(undefined);
});

describe("fonte GitHub", () => {
  it("repete após erro de rede e 503 e lê o arquivo", async () => {
    const { f, chamadas } = comGitHub([
      () => resposta(ARVORE),
      () => { throw new TypeError("fetch failed"); },
      () => resposta("", 503),
      () => resposta('{"a":1}'),
    ]);
    const lido = await f.ler("app/x.json");
    expect(new TextDecoder().decode(lido!.bytes)).toBe('{"a":1}');
    expect(chamadas).toHaveLength(4);
  }, 15_000);

  it("403 sem ser limite de taxa não repete", async () => {
    const { f, chamadas } = comGitHub([() => resposta(ARVORE), () => resposta("", 403)]);
    await expect(f.ler("app/x.json")).rejects.toThrow(/403/);
    expect(chamadas).toHaveLength(2);
  });

  it("GitHub fora do ar: segue com a última lista de versões depois de uma gravação", async () => {
    const { f } = comGitHub([
      () => resposta(ARVORE),
      () => resposta({}, 200), // gravação aceita (zera o cache da lista)
      () => { throw new TypeError("fetch failed"); },
      () => { throw new TypeError("fetch failed"); },
      () => { throw new TypeError("fetch failed"); },
    ]);
    expect((await f.versoes()).get("app/x.json")).toBe("s1");
    expect(await f.gravarCondicional("app/x.json", new Uint8Array([1]), "s1", "teste")).toBe(true);
    expect((await f.versoes()).get("app/x.json")).toBe("s1");
  }, 15_000);

  it("gravação não repete (resultado incerto)", async () => {
    const { f, chamadas } = comGitHub([() => resposta("", 502)]);
    await expect(f.gravarCondicional("app/x.json", new Uint8Array([1]), null, "teste")).rejects.toThrow(/502/);
    expect(chamadas).toHaveLength(1);
  });
});

describe("campo de ordenação no IW38 preparado", () => {
  const cols = ["Ordem", "Equipamento", "Campo de ordenação", "Centro trab.respons.", "Status do sistema", "Data-base do início"];
  const cru: Crua[] = [["1", "EQ-1", "ext-01 ", "MECA", "ABER", "01/10/2026"], ["2", "EQ-2", "", "MECA", "ABER", "01/10/2026"]]
    .map((l) => Object.fromEntries(cols.map((c, i) => [c, l[i]])));

  it("guarda o campo em maiúsculas, sem tomar a coluna de outro campo", () => {
    const ordens = prepararIw38(cru, dia(2026, 10, 1)!).ordens;
    expect(ordens.map((o) => [o.ordem, o.equipamento, o.campo])).toEqual([["1", "EQ-1", "EXT-01"], ["2", "EQ-2", ""]]);
  });
});
