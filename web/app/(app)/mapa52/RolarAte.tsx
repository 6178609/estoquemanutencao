"use client";

import { useEffect, useRef } from "react";

/** Caixa com rolagem lateral que abre já na posição `x` (px): a faixa de semanas começa na semana atual. */
export function RolarAte({ x, className, children }: { x: number; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = Math.max(0, x);
  }, [x]);
  return <div ref={ref} className={className}>{children}</div>;
}
