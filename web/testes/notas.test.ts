import { describe, expect, it } from "vitest";

import { filtrar, lerFiltro } from "@/app/(app)/notas/dados";
import type { Nota } from "@/lib/wcm/preparo";

// dados fictícios
const n = (x: Partial<Nota>) => ({ nota: "1", ordem: "", tipoNota: "Y2", descricao: "", equipamento: "", objeto: "", local: "",
  notificador: "", codigoAbc: "", comOrdem: false, quebra: false, ...x }) as Nota;

describe("filtro de notas", () => {
  const xs = [n({ nota: "1", descricao: "Vazamento de óleo", codigoAbc: "A" }), n({ nota: "2", tipoNota: "Y1", ordem: "9", comOrdem: true, quebra: true }),
    n({ nota: "3", notificador: "Operador Exemplo" })];
  const ids = (p: Record<string, string>) => filtrar(xs, lerFiltro(p)).map((x) => x.nota);
  it("busca sem acento, tipo, ABC, sem ordem e quebras", () => {
    expect(ids({ q: "oleo" })).toEqual(["1"]);
    expect(ids({ q: "exemplo" })).toEqual(["3"]);
    expect(ids({ tipo_nota: "Y1" })).toEqual(["2"]);
    expect(ids({ abc: "A" })).toEqual(["1"]);
    expect(ids({ sem: "1" })).toEqual(["1", "3"]);
    expect(ids({ par: "1" })).toEqual(["2"]);
  });
});
