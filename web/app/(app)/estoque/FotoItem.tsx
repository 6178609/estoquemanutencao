"use client";

import clsx from "clsx";
import { ImageOff } from "lucide-react";
import { useState } from "react";

import { Selo } from "@/components/ui";
import { type FotoDoItem, fotoDoItem, type ItemComFoto, ROTULO_FOTO } from "@/lib/fotoMaterial";

/** Moldura 4:3 da foto em detalhe (a mesma do carrossel do Almoxarifado). */
export const MOLDURA_FOTO = "relative aspect-[4/3] overflow-hidden rounded-2xl border border-borda bg-white";

/**
 * Miniatura da lista: a foto de maior prioridade (própria → do fabricante). Sem nenhuma, não mostra nada.
 * Foto que não carrega vira um quadro com o ícone padrão; a foto de origem externa tem um rótulo discreto embaixo.
 */
export function MiniaturaFoto({ it }: { it: ItemComFoto }) {
  const [falhou, setFalhou] = useState(false);
  const f = fotoDoItem(it, true);
  // sem foto, ou a do fabricante que não carregou: a miniatura some (nada de quadro quebrado na lista)
  if (!f || (falhou && f.origem !== "propria")) return null;
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1">
      {falhou ? (
        <div className="grid size-14 place-items-center rounded-xl border border-borda bg-superficie-2 text-texto-3" aria-hidden>
          <ImageOff className="size-5" />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={f.url} alt="" loading="lazy" decoding="async" onError={() => setFalhou(true)}
          className="size-14 rounded-xl border border-borda bg-white object-cover" />
      )}
      {f.origem !== "propria" && (
        <span className="text-center text-[10px] leading-tight text-texto-3">{ROTULO_FOTO[f.origem]}</span>
      )}
    </div>
  );
}

/** A foto em detalhe (prioridade já escolhida): a própria só aparece; as externas vêm com selo e a página de origem. */
export function FotoDetalhe({ f, className }: { f: FotoDoItem; className?: string }) {
  const [falhou, setFalhou] = useState(false);
  const externa = f.origem !== "propria";
  // a do fabricante que não carrega (loja bloqueou, página mudou) não fica quebrada na tela: o item aparece sem foto
  if (externa && falhou) return (
    <div className={clsx(MOLDURA_FOTO, "grid place-items-center", className)}>
      <div className="flex flex-col items-center gap-2 px-6 text-center text-[13.5px] text-texto-3">
        <ImageOff className="size-7" aria-hidden />Este material ainda não tem foto.
      </div>
    </div>
  );
  return (
    <figure className={clsx("space-y-3", className)}>
      <div className={MOLDURA_FOTO}>
        {falhou ? (
          <div className="grid size-full place-items-center gap-2 px-6 text-center text-[13.5px] text-texto-3">
            <ImageOff className="size-7" aria-hidden />Não foi possível carregar esta foto.
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.url} alt={externa ? `${ROTULO_FOTO.referencia}${f.titulo ? `: ${f.titulo}` : ""}` : "Foto do material"}
            loading="lazy" decoding="async" className="size-full object-contain p-6" onError={() => setFalhou(true)} />
        )}
      </div>
      {externa && (
        <figcaption className="space-y-1.5 text-sm text-texto-3">
          <Selo>{ROTULO_FOTO.referencia}</Selo>
          <p>Foto do fabricante, achada pela referência do item.</p>
          {f.pagina && (
            <a href={f.pagina} target="_blank" rel="noopener noreferrer" className="block break-all text-acao underline underline-offset-2">
              Ver página de origem
            </a>
          )}
        </figcaption>
      )}
    </figure>
  );
}
