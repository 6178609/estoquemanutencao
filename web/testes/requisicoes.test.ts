import { describe, expect, it } from "vitest";

import { filtrar, lerFiltro, ordenarReq } from "@/app/(app)/requisicoes/dados";
import type { Requisicao } from "@/lib/wcm/preparo";
import { dia } from "@/lib/wcm/util";

const hoje = dia(2026, 10, 12)!;
// dados fictícios
const r = (x: Partial<Requisicao>) => ({ requisicao: "R1", po: "", status: "", aprovador: "", proprietario: "", solicitante: "",
  itens: "", justificativa: "", enviadoEm: hoje, ultimoEnvio: null, total: 0, pendente: false, diasAguardando: null, ...x }) as Requisicao;

describe("requisições", () => {
  it("abre no mês atual, só pendentes", () => {
    const f = lerFiltro({}, hoje);
    expect(f.ini).toBe(dia(2026, 10, 1)); expect(f.fim).toBe(hoje); expect(f.pend).toBe(true);
    expect(lerFiltro({ per: "tudo" }, hoje).ini).toBeNull();
    expect(lerFiltro({ de: "2026-01-01", ate: "2026-02-01", per: "3m" }, hoje).ini).toBe(dia(2026, 1, 1));
  });
  it("avisa pendentes fora do período", () => {
    const xs = [r({ requisicao: "A", pendente: true }), r({ requisicao: "B", pendente: true, enviadoEm: dia(2026, 5, 1) }), r({ requisicao: "C" })];
    const { filtradas, fora } = filtrar(xs, lerFiltro({}, hoje));
    expect(filtradas.map((x) => x.requisicao)).toEqual(["A"]);
    expect(fora.map((x) => x.requisicao)).toEqual(["B"]);
    expect(filtrar(xs, lerFiltro({ pend: "0" }, hoje)).filtradas).toHaveLength(2);
  });
  it("pendentes e maior valor primeiro", () => {
    const xs = [r({ requisicao: "A", total: 5 }), r({ requisicao: "B", pendente: true, total: 1 }), r({ requisicao: "C", pendente: true, total: 9 })];
    expect(ordenarReq(xs, {}).lista.map((x) => x.requisicao)).toEqual(["C", "B", "A"]);
  });
});
