import Link from "next/link";

import { Selo } from "@/components/ui";

import { Cartao, inteiroBr } from "../equipamentos/_ui/Blocos";
import { hrefFicha, type LinhaLista } from "./logica";
import { problemasDasListas } from "./qualidade";

/** Qualidade das listas: o que falta ou está estranho em cada lista (sem equipamento, sem tempo, sem ciclo, repetida…). */
export function Qualidade({ linhas }: { linhas: LinhaLista[] }) {
  const ps = problemasDasListas(linhas);
  const comAlgum = new Set(ps.flatMap((p) => p.listas.map((x) => x.lt.chave))).size;
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-texto-2">{inteiroBr(comAlgum)} de {inteiroBr(linhas.length)} lista(s) com algum ponto a corrigir no SAP (IA02).
        Clique na lista para abrir a ficha.</p>
      {ps.map((p) => (
        <Cartao key={p.id} titulo={<span className="inline-flex items-center gap-2">{p.titulo} <Selo cor={p.listas.length ? p.cor : "verde"}>{inteiroBr(p.listas.length)}</Selo></span>}
          sub={p.explica}>
          {!p.listas.length ? <p className="text-[13px] text-texto-3">Nenhuma lista com este ponto.</p> : (
            <ul className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
              {p.listas.slice(0, 40).map((x) => (
                <li key={x.lt.chave} className="min-w-0 truncate">
                  <Link prefetch={false} href={hrefFicha(x.lt)} className="font-mono text-[12.5px] text-alp-azul hover:underline">{x.lt.grupo}/{x.lt.numerador}</Link>{" "}
                  <span className="text-texto-2" title={x.lt.titulo}>{x.lt.titulo}</span>
                  {x.detalhe && <span className="text-[12px] text-texto-3"> · {x.detalhe}</span>}
                </li>
              ))}
              {p.listas.length > 40 && <li className="text-[12.5px] text-texto-3">… e mais {inteiroBr(p.listas.length - 40)} (use os filtros para ver as outras).</li>}
            </ul>
          )}
        </Cartao>
      ))}
    </div>
  );
}
