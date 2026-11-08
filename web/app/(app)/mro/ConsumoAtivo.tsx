import { Selo } from "@/components/ui";
import { dataBr } from "@/lib/wcm/util";
import type { LinhaConsumo } from "@/lib/wcm/consumo";

import { TabelaT } from "../equipamentos/_ui/Blocos";
import { AlocarUm } from "./AlocacaoAcoes";

const n = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/**
 * Peças que de fato saíram do almoxarifado para ordens deste ativo (e dos subconjuntos dele), pela IW13: a lista de peças
 * pelo consumo real, com o que já está vinculado e o botão de vincular o que falta (editor).
 */
export function ConsumoAtivo({ tag, linhas, periodo, edita }: { tag: string; linhas: LinhaConsumo[] | null; periodo: string; edita: boolean }) {
  if (linhas === null) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-borda p-3 text-[12.5px] text-texto-3">
        Consumo real nas ordens: envie o export da <b>IW13</b> em Fontes de dados para ver as peças que de fato saíram do almoxarifado para este ativo.
      </p>
    );
  }
  const retiradas = linhas.filter((l) => l.ordens).length;
  const soReserva = linhas.length - retiradas;
  const faltam = linhas.filter((l) => l.ordens && !l.vinculado).length;
  return (
    <details className="mt-4 rounded-xl border border-borda" open={linhas.length > 0}>
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 px-3 text-[13.5px] font-medium hover:bg-superficie-2">
        Consumo real nas ordens (IW13{periodo ? `, ${periodo}` : ""})
        <span className="text-[12.5px] font-normal text-texto-3">
          {linhas.length ? [`${retiradas} peça(s) retirada(s)`, `${faltam} sem vínculo`, soReserva ? `${soReserva} só reservada(s)` : ""].filter(Boolean).join(" · ")
            : "nenhuma retirada registrada"}
        </span>
      </summary>
      {linhas.length > 0 && (
        <div className="border-t border-borda p-3">
          <TabelaT alta colunas={[{ rotulo: "Material" }, { rotulo: "Descrição", larga: true }, { rotulo: "Ordens" }, { rotulo: "Qtd. retirada" },
            { rotulo: "Última retirada" }, { rotulo: "Saldo MB52" }, { rotulo: "Vínculo" }, ...(edita ? [{ rotulo: "" }] : [])]}
            linhas={linhas.map((l) => ({
              chave: l.material,
              celulas: [<span key="m" className="font-mono text-[12.5px] text-alp-azul">{l.material}</span>,
                <span key="d">{l.descricao || "—"}{l.cadastro && l.cadastro !== "Ativo" ? <> · <Selo cor="laranja">{l.cadastro}</Selo></> : null}</span>,
                l.ordens || (l.reservas ? `só reservado (${l.reservas} ${l.reservas > 1 ? "ordens" : "ordem"})` : "—"),
                l.quantidade ? `${n.format(l.quantidade)} ${l.um}`.trim() : "—",
                l.ultima != null ? dataBr(l.ultima) : "—",
                l.saldo == null ? <span key="s" className="text-texto-3">fora da MB52</span> : `${n.format(l.saldo)} ${l.umSaldo || l.um}`.trim(),
                l.vinculado ? <Selo key="v" cor="verde">vinculada</Selo> : <Selo key="v" cor="cinza">sem vínculo</Selo>,
                ...(edita ? [l.vinculado || !l.ordens ? "" : <AlocarUm key="a" ativo={tag} material={l.material} />] : [])],
            }))} />
        </div>
      )}
    </details>
  );
}
