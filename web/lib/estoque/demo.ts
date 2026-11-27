import type { Dia } from "../wcm/util";
import type { LinhaRetirada } from "./historicoIw13";

/**
 * IW13 FICTÍCIA da aba Estoque (demonstração e testes de ponta a ponta; nada daqui é da empresa): para os primeiros
 * materiais do almoxarifado fictício, retiradas espalhadas pelos últimos 14 meses nas ordens fictícias (lib/wcm/demo.ts),
 * com uma devolução (Tomados < 0) e as linhas das validações fictícias da UBM (lib/ubm/demo.ts: 4199001 × 900049 veio da
 * UBM, 4199002 × 900042 veio do Almox). As linhas da IW13 fictícia da UBM entram junto (`extras`).
 */
export function iw13EstoqueDemo(materiais: string[], ordens: { ordem: string; equipamento: string; data: Dia | null }[], hoje: Dia,
  extras: LinhaRetirada[] = []): LinhaRetirada[] {
  const passadas = ordens.filter((o) => o.data != null && o.data <= hoje && o.data > hoje - 430).sort((a, b) => (b.data ?? 0) - (a.data ?? 0));
  const r: LinhaRetirada[] = [...extras];
  if (passadas.length) {
    materiais.slice(0, 15).forEach((material, k) => {
      // o 1º material é o mais usado (várias retiradas por mês); os outros, menos
      const n = k === 0 ? 60 : Math.max(2, 14 - k);
      for (let i = 0; i < n; i++) {
        const o = passadas[(k * 37 + i * 11) % passadas.length];
        r.push({ ordem: o.ordem, material, quantidade: 1 + ((k + i) % 4), um: "PC", descricao: "", equipamento: o.equipamento, data: o.data });
      }
      // uma devolução (estorno) no 1º material
      if (k === 0) {
        const o = passadas[3 % passadas.length];
        r.push({ ordem: o.ordem, material, quantidade: -1, um: "PC", descricao: "", equipamento: o.equipamento, data: o.data });
      }
    });
  }
  r.push({ ordem: "4199001", material: "900049", quantidade: 1, um: "PC", descricao: "", equipamento: "10000105", data: hoje - 4 },
    { ordem: "4199002", material: "900042", quantidade: 2, um: "PC", descricao: "", equipamento: "10000109", data: hoje - 6 });
  return r;
}
