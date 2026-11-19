"use client";

import clsx from "clsx";

import { FOTO_LADO, FOTO_QUALIDADE, iniciais } from "@/lib/agendaHh/regras";

/** Foto do técnico (data URL guardada no cadastro) ou as iniciais. */
export function Avatar({ nome, foto, tamanho = 44, className }: { nome: string; foto?: string; tamanho?: number; className?: string }) {
  return (
    <span className={clsx("grid shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--selo-info-fundo)] font-display font-semibold text-[var(--selo-info-texto)]", className)}
      style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.36) }}>
      {foto
        // eslint-disable-next-line @next/next/no-img-element -- data URL pequena guardada no cadastro
        ? <img src={foto} alt={`Foto de ${nome}`} className="size-full object-cover" />
        : <span aria-hidden>{iniciais(nome)}</span>}
    </span>
  );
}

/**
 * Reduz a imagem no navegador (como o resizeImage do app original): no máximo `lado` px no maior lado, JPEG.
 * Aceita um arquivo ou uma data URL (fotos do backup antigo).
 */
export function reduzirImagem(origem: Blob | string, lado = FOTO_LADO, qualidade = FOTO_QUALIDADE): Promise<string> {
  return new Promise((ok, falha) => {
    const carregar = (src: string) => {
      const img = new Image();
      img.onerror = () => falha(new Error("Imagem ilegível"));
      img.onload = () => {
        const escala = Math.min(1, lado / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * escala));
        c.height = Math.max(1, Math.round(img.height * escala));
        const ctx = c.getContext("2d");
        if (!ctx) { falha(new Error("Sem canvas")); return; }
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL("image/jpeg", qualidade));
      };
      img.src = src;
    };
    if (typeof origem === "string") carregar(origem);
    else {
      const r = new FileReader();
      r.onerror = () => falha(new Error("Arquivo ilegível"));
      r.onload = () => carregar(String(r.result));
      r.readAsDataURL(origem);
    }
  });
}

/** Baixa um texto/JSON como arquivo. */
export function baixarArquivo(nome: string, conteudo: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Rótulo pequeno de campo de filtro + controle (select ou data), no padrão do site. */
export const CONTROLE = "h-11 w-full rounded-xl border border-borda bg-superficie-2 px-3 text-[14px] transition focus:border-[var(--acao)] focus:bg-superficie";

export function Filtro({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={clsx("block min-w-0", className)}>
      <span className="mb-1 block text-[12.5px] font-semibold text-texto-2">{rotulo}</span>
      {children}
    </label>
  );
}
