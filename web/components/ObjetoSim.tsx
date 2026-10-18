/**
 * O "objeto" da tela de entrada: a logo SIM Manutenção em 3D, flutuando. Cada parte da logo (anel, globo, foguete,
 * "SIM" e o subtítulo) é um SVG empilhado em camadas mais escuras atrás, o que dá espessura; o conjunto balança em
 * perspectiva e o foguete se adianta. Com "reduzir movimento" ligado, fica parado (regra global do globals.css).
 */
const CAMADAS = [
  { nome: "anel", z: 0, espessura: 18, brilho: 0.55 },
  { nome: "disco", z: 14, espessura: 14, brilho: 0.55 },
  { nome: "foguete", z: 52, espessura: 16, brilho: 0.7 },
  { nome: "sim", z: 0, espessura: 24, brilho: 0.55 },
  { nome: "mp", z: 0, espessura: 4, brilho: 0.75 },
];
const PASSOS = 8;

export function ObjetoSim({ className = "", tamanho = 420 }: { className?: string; tamanho?: number }) {
  return (
    <div className={`relative grid place-items-center ${className}`} style={{ width: tamanho, maxWidth: "100%", aspectRatio: "1" }}
      role="img" aria-label="SIM Manutenção Profissional">
      <div className="absolute inset-[6%] rounded-full"
        style={{ background: "radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--texto) 7%, transparent) 0%, color-mix(in srgb, var(--texto) 3%, transparent) 45%, transparent 70%)" }} />
      <div className="absolute bottom-[17%] left-[14%] right-[14%] h-[5%] rounded-[50%] bg-black/10 blur-[3px] dark:bg-white/5" />
      <div className="flutuar relative w-full" style={{ perspective: 1400 }}>
        <div className="objeto-sim relative w-full" style={{ aspectRatio: "1000 / 540", transformStyle: "preserve-3d" }}>
          {CAMADAS.map((c) => (
            <div key={c.nome} className={`absolute inset-0 ${c.nome === "foguete" ? "objeto-sim-foguete" : ""}`} style={{ transformStyle: "preserve-3d" }}>
              {Array.from({ length: PASSOS }, (_, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={`/logo-sim/${c.nome}.svg`} alt="" className="absolute inset-0 size-full"
                  style={{ transform: `translateZ(${c.z - c.espessura + (c.espessura * i) / PASSOS}px)`, filter: `brightness(${c.brilho})` }} />
              ))}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/logo-sim/${c.nome}.svg`} alt="" className="absolute inset-0 size-full drop-shadow-[0_18px_24px_rgba(9,9,11,0.16)]"
                style={{ transform: `translateZ(${c.z}px)` }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
