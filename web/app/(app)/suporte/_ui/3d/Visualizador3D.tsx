"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode, RefObject } from "react";

import { MODELOS, marcadoresDe } from "@/lib/suporte/modelos3d";
import type { IdModelo } from "@/lib/suporte/modelos3d";

/** three.js só entra no cliente, quando o bloco aparece na tela (ver `useVisivel`). */
const Cena = dynamic(() => import("./Cena").then((m) => m.Cena), {
  ssr: false,
  loading: () => <Mensagem>Carregando visualização 3D…</Mensagem>,
});

interface Props {
  modelo: IdModelo;
  tipo: string;
  sintoma: string;
}

/**
 * Visualizador 3D de falhas: modelo do equipamento com as causas do sintoma como marcadores. Selecionar um marcador
 * focaliza a peça (vermelho) e mostra a explicação. Sem WebGL, a lista de marcadores continua.
 */
export function Visualizador3D(props: Props) {
  // modelos ainda sem cena não mostram o bloco (nada quebra); ao trocar tipo ou sintoma, o estado começa do zero
  if (!MODELOS_COM_CENA.has(props.modelo)) return null;
  return <Bloco key={`${props.tipo}/${props.sintoma}`} {...props} />;
}

/** Modelos que já têm cena em `Cena.tsx` (COMPONENTES). Mantém a lista igual à de lá. */
const MODELOS_COM_CENA: ReadonlySet<IdModelo> = new Set<IdModelo>(["rolamento", "motor"]);

function Bloco({ modelo: idModelo, tipo, sintoma }: Props) {
  const modelo = MODELOS[idModelo];
  const marcadores = marcadoresDe(tipo, sintoma);
  const [ativo, setAtivo] = useState<number | null>(null);
  const [explodir, setExplodir] = useState(false);
  const [pausado, setPausado] = useState(false);
  const reduzir = useMovimentoReduzido();
  const suporte = useWebGL();
  const area = useRef<HTMLDivElement>(null);
  const visivel = useVisivel(area);

  const peca = ativo === null ? null : (marcadores[ativo]?.peca ?? null);
  // o giro para quando há uma peça em foco, e nunca com movimento reduzido
  const girar = !reduzir && !pausado && peca === null;
  const nomeDe = (id: string) => modelo.pecas.find((p) => p.id === id)?.nome ?? id;
  const marcador = ativo === null ? null : (marcadores[ativo] ?? null);

  function aoClicarPeca(id: string) {
    const i = marcadores.findIndex((m) => m.peca === id);
    if (i >= 0) setAtivo(i);
  }

  return (
    <section aria-labelledby="visualizador-3d-titulo" className="space-y-4">
      <h3 id="visualizador-3d-titulo" className="font-display text-[17px] font-medium text-texto">
        Visualização 3D
      </h3>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="min-w-0 space-y-3">
          <div
            ref={area}
            role="img"
            aria-label={`Modelo 3D: ${modelo.titulo}.${marcador ? ` Peça em destaque: ${nomeDe(marcador.peca)}.` : ""}`}
            className="relative h-[300px] w-full overflow-hidden rounded-cartao border border-borda bg-superficie-2 sm:h-[400px]"
          >
            {!visivel ? (
              <Mensagem>Visualização 3D</Mensagem>
            ) : suporte === false ? (
              <Mensagem>Visualização 3D indisponível neste navegador</Mensagem>
            ) : suporte === true ? (
              <Cena
                modelo={idModelo}
                destaque={peca}
                explodir={explodir}
                girar={girar}
                reduzir={reduzir}
                aoClicarPeca={aoClicarPeca}
              />
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={!explodir}
              onClick={() => setExplodir(false)}
              className={BOTAO_NO_MODELO}
            >
              Montado
            </button>
            <button
              type="button"
              aria-pressed={explodir}
              onClick={() => setExplodir(true)}
              className={BOTAO_NO_MODELO}
            >
              Vista explodida
            </button>
            <button type="button" onClick={() => setAtivo(null)} className={BOTAO_NO_MODELO}>
              Recentrar
            </button>
            {!reduzir && (
              <button type="button" onClick={() => setPausado((p) => !p)} className={BOTAO_NO_MODELO}>
                {pausado ? "Retomar giro" : "Pausar giro"}
              </button>
            )}
          </div>

          <div aria-live="polite" className="min-h-[4.5rem] rounded-cartao border border-borda bg-superficie p-4">
            {marcador ? (
              <>
                <p className="text-[13px] font-semibold text-texto">{nomeDe(marcador.peca)}</p>
                <p className="mt-1 text-[15px] font-medium text-texto">{marcador.titulo}</p>
                <p className="mt-1 text-[14px] text-texto-2">{marcador.explicacao}</p>
              </>
            ) : (
              <p className="text-[14px] text-texto-3">Escolha uma causa para ver a peça no modelo.</p>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold text-texto">Causas no modelo</h4>
          <ul className="mt-2 space-y-2">
            {marcadores.map((m, i) => (
              <li key={`${m.peca}-${i}`}>
                <button
                  type="button"
                  aria-pressed={ativo === i}
                  onClick={() => setAtivo(ativo === i ? null : i)}
                  className="flex min-h-11 w-full flex-col items-start rounded-cartao border border-borda bg-superficie px-4 py-3 text-left transition hover:border-borda-forte hover:bg-superficie-2 aria-pressed:border-acao"
                >
                  <span className="text-[14px] font-medium text-texto">{m.titulo}</span>
                  <span className="text-[12.5px] text-texto-3">{nomeDe(m.peca)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const BOTAO_NO_MODELO =
  "inline-flex min-h-11 items-center rounded-full border border-borda bg-superficie px-4 text-[13.5px] text-texto transition hover:border-borda-forte aria-pressed:border-transparent aria-pressed:bg-tinta aria-pressed:font-semibold aria-pressed:text-tinta-texto";

function Mensagem({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-[13.5px] text-texto-3">{children}</div>
  );
}

/** Vira verdadeiro uma vez, quando o bloco entra na tela (com folga para começar antes). */
function useVisivel(ref: RefObject<HTMLDivElement | null>) {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visivel) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisivel(true);
          observador.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [ref, visivel]);
  return visivel;
}

let webglCache: boolean | undefined;
/** Há WebGL neste navegador? null no servidor e na hidratação. */
function useWebGL(): boolean | null {
  return useSyncExternalStore(
    () => () => {},
    () => {
      if (webglCache === undefined) {
        try {
          const c = document.createElement("canvas");
          webglCache = !!(c.getContext("webgl2") || c.getContext("webgl"));
        } catch {
          webglCache = false;
        }
      }
      return webglCache;
    },
    () => null,
  );
}

const CONSULTA_MOVIMENTO = "(prefers-reduced-motion: reduce)";
/** Preferência de movimento reduzido do sistema. */
function useMovimentoReduzido(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia(CONSULTA_MOVIMENTO);
      mq.addEventListener("change", avisar);
      return () => mq.removeEventListener("change", avisar);
    },
    () => window.matchMedia(CONSULTA_MOVIMENTO).matches,
    () => false,
  );
}
