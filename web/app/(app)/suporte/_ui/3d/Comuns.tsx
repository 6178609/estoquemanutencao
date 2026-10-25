import { useMemo } from "react";
import { CatmullRomCurve3, Vector3 } from "three";

import { anel, Mat, naAbertura, Torneado, useEixo } from "./Peca";
import type { CorBase } from "./Peca";

/**
 * Rolamento pequeno em corte (para motor, bomba, redutor), em torno do Y local, centrado em `y`: anel externo,
 * anel interno e esferas (as do quadrante aberto não são desenhadas).
 */
export function RolamentoMini({ y = 0, rInt, rExt, largura }: { y?: number; rInt: number; rExt: number; largura: number }) {
  const eixo = useEixo();
  const { externo, interno, esferas, rEsfera } = useMemo(() => {
    const parede = (rExt - rInt) * 0.22;
    const rm = (rInt + rExt) / 2;
    const r = Math.min((rExt - rInt) * 0.3, largura * 0.38);
    const n = Math.max(7, Math.round((2 * Math.PI * rm) / (r * 2.6)));
    const pos: [number, number, number][] = [];
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n;
      const x = rm * Math.sin(a), z = rm * Math.cos(a);
      if (!naAbertura(x, z, eixo)) pos.push([x, y, z]);
    }
    return {
      externo: anel(rExt - parede, rExt, y - largura / 2, y + largura / 2),
      interno: anel(rInt, rInt + parede, y - largura / 2, y + largura / 2),
      esferas: pos,
      rEsfera: r,
    };
  }, [y, rInt, rExt, largura, eixo]);
  return (
    <group>
      <Torneado perfil={externo} cor="aco" corte segmentos={48} />
      <Torneado perfil={interno} cor="aco" corte segmentos={48} />
      {esferas.map((p) => (
        <mesh key={p.join(",")} position={p}>
          <sphereGeometry args={[rEsfera, 16, 12]} />
          <Mat cor="acoClaro" />
        </mesh>
      ))}
    </group>
  );
}

/** Mola helicoidal em torno do Y local, de `y0` a `y1`. */
export function Mola({ y0, y1, raio, fio, espiras, cor = "acoClaro" }: {
  y0: number; y1: number; raio: number; fio: number; espiras: number; cor?: CorBase;
}) {
  const curva = useMemo(() => {
    const passos = espiras * 24;
    const pts = Array.from({ length: passos + 1 }, (_, i) => {
      const t = i / passos;
      const a = 2 * Math.PI * espiras * t;
      return new Vector3(raio * Math.sin(a), y0 + (y1 - y0) * t, raio * Math.cos(a));
    });
    return new CatmullRomCurve3(pts);
  }, [y0, y1, raio, espiras]);
  return (
    <mesh>
      <tubeGeometry args={[curva, espiras * 24, fio, 8, false]} />
      <Mat cor={cor} />
    </mesh>
  );
}
