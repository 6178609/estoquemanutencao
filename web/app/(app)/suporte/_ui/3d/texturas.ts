import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace } from "three";
import type { Texture } from "three";

import type { CorBase } from "./Peca";

/**
 * Texturas dos materiais, desenhadas no navegador (sem baixar imagens): marcas de torneamento no aço usinado, acabamento
 * retificado no aço polido, areia de fundição no ferro fundido, espiras de fio esmaltado no cobre, grão na borracha e
 * casca de laranja com leve desgaste na pintura. Cada material tem três mapas do mesmo desenho: cor (tons perto do
 * branco, multiplicam a cor base), rugosidade e relevo. Geradas uma vez por material, com semente fixa (mesma imagem
 * sempre).
 */

export interface MapasMaterial { map: Texture; roughnessMap: Texture; bumpMap: Texture; relevo: number }

const LADO = 256;

/** Gerador pseudoaleatório com semente (mulberry32): a textura sai igual a cada carga. */
function aleatorio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Desenho em tons de 0 a 1 (um valor por pixel) de cada acabamento. */
type Desenho = (r: () => number) => Float32Array;

const grade = () => new Float32Array(LADO * LADO);

/** Ruído suave (valores em grade grossa interpolados), em [0, 1]. */
function ruidoSuave(r: () => number, celula: number): Float32Array {
  const n = Math.ceil(LADO / celula) + 1;
  const pontos = Array.from({ length: n * n }, r);
  const out = grade();
  for (let y = 0; y < LADO; y++)
    for (let x = 0; x < LADO; x++) {
      const gx = x / celula, gy = y / celula, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      const p = (i: number, j: number) => pontos[((j % (n - 1)) * n) + (i % (n - 1))];
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = p(x0, y0) + (p(x0 + 1, y0) - p(x0, y0)) * sx;
      const b = p(x0, y0 + 1) + (p(x0 + 1, y0 + 1) - p(x0, y0 + 1)) * sx;
      out[y * LADO + x] = a + (b - a) * sy;
    }
  return out;
}

/** Riscos finos ao longo do U (marcas de torneamento/retífica): cada linha tem seu tom, com ruído leve. */
function riscos(r: () => number, contraste: number, fino: number): Float32Array {
  const linhas = Array.from({ length: LADO }, () => r());
  const out = grade();
  for (let y = 0; y < LADO; y++)
    for (let x = 0; x < LADO; x++) out[y * LADO + x] = 0.5 + (linhas[y] - 0.5) * contraste + (r() - 0.5) * fino;
  return out;
}

const DESENHOS: Record<CorBase, Desenho> = {
  aco: (r) => riscos(r, 0.55, 0.12),
  acoClaro: (r) => riscos(r, 0.25, 0.06),
  acoEscuro: (r) => {
    // areia de fundição: grãos miúdos sobre manchas largas
    const manchas = ruidoSuave(r, 32);
    const out = grade();
    for (let i = 0; i < out.length; i++) out[i] = 0.35 + manchas[i] * 0.3 + (r() < 0.18 ? r() * 0.45 : r() * 0.12);
    return out;
  },
  cobre: (r) => {
    // espiras de fio esmaltado: faixas paralelas arredondadas, com o reflexo no meio de cada fio
    const fio = 8;
    const tons = Array.from({ length: LADO / fio + 1 }, () => 0.85 + r() * 0.15);
    const out = grade();
    for (let y = 0; y < LADO; y++) {
      const k = (y % fio) / fio, tom = tons[Math.floor(y / fio)];
      const perfil = Math.sin(k * Math.PI);
      for (let x = 0; x < LADO; x++) out[y * LADO + x] = (0.2 + 0.8 * perfil) * tom + (r() - 0.5) * 0.04;
    }
    return out;
  },
  borracha: (r) => {
    const base = ruidoSuave(r, 8);
    const out = grade();
    for (let i = 0; i < out.length; i++) out[i] = 0.45 + base[i] * 0.25 + (r() - 0.5) * 0.2;
    return out;
  },
  azul: (r) => {
    // pintura: casca de laranja (ruído médio) e desgaste claro em poucos pontos
    const casca = ruidoSuave(r, 6), desgaste = ruidoSuave(r, 48);
    const out = grade();
    for (let i = 0; i < out.length; i++) out[i] = 0.5 + (casca[i] - 0.5) * 0.35 + (desgaste[i] > 0.82 ? (desgaste[i] - 0.82) * 2.5 : 0);
    return out;
  },
};

/** Faixa de tom da cor (perto do branco: a cor base do material continua mandando) e da rugosidade de cada material. */
const AJUSTE: Record<CorBase, { cor: [number, number]; rug: [number, number]; relevo: number; repete: [number, number] }> = {
  aco: { cor: [0.82, 1], rug: [0.25, 0.5], relevo: 0.4, repete: [1, 3] },
  acoClaro: { cor: [0.9, 1], rug: [0.12, 0.28], relevo: 0.15, repete: [1, 3] },
  acoEscuro: { cor: [0.7, 1], rug: [0.45, 0.8], relevo: 1.2, repete: [2, 2] },
  cobre: { cor: [0.62, 1], rug: [0.25, 0.45], relevo: 1, repete: [1, 6] },
  borracha: { cor: [0.85, 1], rug: [0.75, 0.95], relevo: 0.5, repete: [3, 3] },
  azul: { cor: [0.88, 1], rug: [0.35, 0.6], relevo: 0.25, repete: [2, 2] },
};

function canvasDe(valores: Float32Array, faixa: [number, number]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = LADO;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(LADO, LADO);
  for (let i = 0; i < valores.length; i++) {
    const v = Math.round(255 * (faixa[0] + (faixa[1] - faixa[0]) * Math.min(1, Math.max(0, valores[i]))));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function textura(c: HTMLCanvasElement, cor: boolean, repete: [number, number]): Texture {
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repete[0], repete[1]);
  t.colorSpace = cor ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = 4;
  return t;
}

const prontos = new Map<CorBase, MapasMaterial>();

/** Os mapas de um material (gerados na primeira vez; null fora do navegador). */
export function mapasDe(cor: CorBase): MapasMaterial | null {
  if (typeof document === "undefined") return null;
  const pronto = prontos.get(cor);
  if (pronto) return pronto;
  const a = AJUSTE[cor];
  const valores = DESENHOS[cor](aleatorio(cor.length * 7919 + cor.charCodeAt(0)));
  const mapas = {
    map: textura(canvasDe(valores, a.cor), true, a.repete),
    roughnessMap: textura(canvasDe(valores.map((v) => 1 - v), a.rug), false, a.repete),
    bumpMap: textura(canvasDe(valores, [0, 1]), false, a.repete),
    relevo: a.relevo,
  };
  prontos.set(cor, mapas);
  return mapas;
}
