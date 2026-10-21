import { Path, Shape, Vector2 } from "three";

/** Ponto na circunferência de centro (cx, cy), raio r e ângulo a (radianos). */
function noCirculo(cx: number, cy: number, r: number, a: number): Vector2 {
  return new Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a));
}

/** Arco de `a0` a `a1` (em ordem crescente) de um círculo, com `passos` segmentos. */
function arco(cx: number, cy: number, r: number, a0: number, a1: number, passos = 24): Vector2[] {
  const pontos: Vector2[] = [];
  for (let i = 0; i <= passos; i++) pontos.push(noCirculo(cx, cy, r, a0 + ((a1 - a0) * i) / passos));
  return pontos;
}

/**
 * Laço de correia (ou esteira) em volta de duas polias de mesmo centro em y, com o centro 2 à direita do centro 1.
 * Os trechos retos são tangentes externas: quando os raios são iguais, a correia é um retângulo com cantos arredondados.
 */
function laco(c1x: number, r1: number, c2x: number, r2: number): Vector2[] {
  const d = c2x - c1x;
  // tangente externa: cos(θ) = (r1 - r2) / d; θ é o ângulo do ponto de tangência na polia 1 (e 2) em relação ao eixo X
  const theta = Math.acos(limitar((r1 - r2) / d));
  return [
    ...arco(c2x, 0, r2, -theta, theta),
    ...arco(c1x, 0, r1, theta, 2 * Math.PI - theta),
  ];
}

/** Clamp a [-1, 1] para o acos não sair do domínio por arredondamento. */
function limitar(x: number): number {
  return Math.min(1, Math.max(-1, x));
}

/**
 * Correia plana/em V vista de frente: contorno externo (raio + espessura) com furo no contorno interno (raio das polias).
 * Use com ExtrudeGeometry para dar a largura da correia no eixo Z. Os centros ficam em y = 0 (polia 1 à esquerda).
 */
export function formaCorreia(c1x: number, r1: number, c2x: number, r2: number, espessura: number): Shape {
  const externo = laco(c1x, r1 + espessura, c2x, r2 + espessura);
  const interno = laco(c1x, r1, c2x, r2);
  const forma = new Shape(externo);
  forma.holes.push(new Path(interno));
  return forma;
}

/**
 * Engrenagem de dentes retos vista de frente (eixo Z): contorno com dentes trapezoidais e furo central.
 * `passo` é o raio primitivo; `adendo` e `dedendo` são a altura do topo e a profundidade do pé do dente.
 */
export function formaEngrenagem(dentes: number, raioPrimitivo: number, furo: number, adendo = 0.08, dedendo = 0.1): Shape {
  const passo = (2 * Math.PI) / dentes;
  const topo = raioPrimitivo + adendo;
  const pe = raioPrimitivo - dedendo;
  const pontos: Vector2[] = [];
  for (let i = 0; i < dentes; i++) {
    const a = i * passo;
    pontos.push(
      noCirculo(0, 0, pe, a),
      noCirculo(0, 0, topo, a + passo * 0.2),
      noCirculo(0, 0, topo, a + passo * 0.42),
      noCirculo(0, 0, pe, a + passo * 0.5),
    );
  }
  const forma = new Shape(pontos);
  const buraco = new Path();
  buraco.absarc(0, 0, furo, 0, 2 * Math.PI, true);
  forma.holes.push(buraco);
  return forma;
}
