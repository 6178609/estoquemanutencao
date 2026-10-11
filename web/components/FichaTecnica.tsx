import clsx from "clsx";

import { linhasTecnicas } from "@/lib/dados/materiais";

/** Separa "NOME: valor" para destacar o valor; o primeiro atributo (o que o material é) vai em negrito. */
function partes(linha: string): [string, string] | null {
  const i = linha.indexOf(":");
  if (i < 1 || i > 40) return null;
  return [linha.slice(0, i).trim(), linha.slice(i + 1).trim()];
}

/** Descr Completa em texto corrido, quebrando linha naturalmente (lista do almoxarifado/catálogo). */
export function DescrCorrida({ texto, className }: { texto: string; className?: string }) {
  const linhas = linhasTecnicas(texto);
  if (!linhas.length) return <span className={clsx("text-sm italic text-texto-3", className)}>Sem Descr Completa no Sysmat</span>;
  return (
    <p className={clsx("text-[13px] leading-relaxed text-texto-2", className)}>
      {linhas.map((l, i) => {
        const p = partes(l);
        return (
          <span key={i}>
            {i > 0 && <span className="mx-1.5 text-texto-3/60">·</span>}
            {p ? (<><span className="text-texto-3">{p[0]}:</span> <span className="font-medium text-texto">{p[1]}</span></>)
              : <span className={i === 0 ? "font-semibold text-texto" : ""}>{l}</span>}
          </span>
        );
      })}
    </p>
  );
}

/** Ficha técnica: um atributo por linha (gaveta de detalhe). */
export function FichaTecnica({ texto }: { texto: string }) {
  const linhas = linhasTecnicas(texto);
  if (!linhas.length) return <p className="text-sm italic text-texto-3">Sem Descr Completa: o código não está no catálogo do Sysmat ou o cadastro está vazio.</p>;
  return (
    <dl className="divide-y divide-borda overflow-hidden rounded-2xl border border-borda">
      {linhas.map((l, i) => {
        const p = partes(l);
        return (
          <div key={i} className={clsx("grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[42%_1fr] sm:gap-4", i % 2 ? "bg-superficie" : "bg-superficie-2/60")}>
            {p ? (<><dt className="text-texto-3">{p[0]}</dt><dd className="font-medium text-texto">{p[1]}</dd></>)
              : <dd className={clsx("sm:col-span-2", i === 0 ? "font-display font-semibold" : "text-texto")}>{l}</dd>}
          </div>
        );
      })}
    </dl>
  );
}
