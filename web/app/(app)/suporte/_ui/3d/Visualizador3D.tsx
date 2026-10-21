"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode, RefObject } from "react";

import { MODELOS, temCena } from "@/lib/suporte/modelos3d";
import type { IdModelo, Marcador, ModeloComCena } from "@/lib/suporte/modelos3d";

/** three.js só entra no cliente, quando o bloco aparece na tela (ver `useVisivel`). */
const Cena = dynamic(() => import("./Cena").then((m) => m.Cena), {
  ssr: false,
  loading: () => <Mensagem>Carregando visualização 3D…</Mensagem>,
});

interface Props {
  modelo: IdModelo;
  /** identifica o contexto (ex.: tipo/sintoma no diagnóstico, guia no guia): ao mudar, o estado começa do zero */
  chave: string;
  /** causas com a peça ligada (no servidor: a tabela inteira não vai ao cliente), ou as peças do modelo */
  marcadores: Marcador[];
  /** título da lista de marcadores */
  rotulo?: string;
}

/**
 * Visualizador 3D de falhas: modelo do equipamento com as causas do sintoma como marcadores. Selecionar um marcador
 * focaliza a peça (vermelho) e mostra a explicação. Sem WebGL, a lista de marcadores continua.
 */
export function Visualizador3D(props: Props) {
  // modelo sem cena não mostra o bloco (nada quebra)
  if (!temCena(props.modelo)) return null;
  // ao trocar o contexto, o estado (peça ativa, explodido, giro) começa do zero
  return <Bloco key={props.chave} modelo={props.modelo} marcadores={props.marcadores} rotulo={props.rotulo} />;
}

function Bloco({ modelo: idModelo, marcadores, rotulo }: { modelo: ModeloComCena; marcadores: Marcador[]; rotulo?: string }) {
  const modelo = MODELOS[idModelo];
  // o marcador inicial é o da primeira causa que tem peça no modelo
  const [ativo, setAtivo] = useState<number | null>(() => primeiroComPeca(idModelo, marcadores));
  const [explodir, setExplodir] = useState(false);
  const [pausado, setPausado] = useState(false);
  /** contador de Recentrar: cada clique refoca o modelo inteiro, mesmo sem peça em foco */
  const [recentrarN, setRecentrarN] = useState(0);
  /** o navegador perdeu o contexto WebGL depois de montar a cena */
  const [perdido, setPerdido] = useState(false);
  const reduzir = useMovimentoReduzido();
  const suporte = useWebGL();
  const area = useRef<HTMLDivElement>(null);
  const { naTela, jaVisto } = useVisivel(area);

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
            className="relative h-[300px] w-full overflow-hidden rounded-cartao border border-borda bg-superficie-2 sm:h-[400px]"
          >
            {!jaVisto ? (
              <Mensagem>Visualização 3D</Mensagem>
            ) : suporte === false || perdido ? (
              <Mensagem role="status">Visualização 3D indisponível neste navegador</Mensagem>
            ) : suporte === true ? (
              <div
                role="img"
                aria-label={`Modelo 3D: ${modelo.titulo}.${marcador ? ` Peça em destaque: ${nomeDe(marcador.peca)}.` : ""}`}
                className="absolute inset-0 touch-pan-y"
              >
                <Cena
                  modelo={idModelo}
                  destaque={peca}
                  explodir={explodir}
                  girar={girar}
                  reduzir={reduzir}
                  naTela={naTela}
                  recentrar={recentrarN}
                  aoClicarPeca={aoClicarPeca}
                  aoPerderContexto={() => setPerdido(true)}
                />
              </div>
            ) : null}
          </div>

          {/* controles da cena: só existem com WebGL; sem ele, a lista de causas continua */}
          {suporte === true && !perdido && (
            <div className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={!explodir} onClick={() => setExplodir(false)} className={BOTAO_NO_MODELO}>
                Montado
              </button>
              <button type="button" aria-pressed={explodir} onClick={() => setExplodir(true)} className={BOTAO_NO_MODELO}>
                Vista explodida
              </button>
              <button
                type="button"
                onClick={() => {
                  setAtivo(null);
                  setRecentrarN((n) => n + 1);
                }}
                className={BOTAO_NO_MODELO}
              >
                Recentrar
              </button>
              {/* com uma peça em foco o giro já está parado: o botão só aparece quando há giro para pausar */}
              {!reduzir && peca === null && (
                <button type="button" onClick={() => setPausado((p) => !p)} className={BOTAO_NO_MODELO}>
                  {pausado ? "Retomar giro" : "Pausar giro"}
                </button>
              )}
            </div>
          )}

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
          <h4 className="text-[13px] font-semibold text-texto">{rotulo ?? "Causas no modelo"}</h4>
          <ul className="mt-2 space-y-2">
            {marcadores.map((m, i) => (
              <li key={`${m.peca}-${i}`}>
                <button
                  type="button"
                  aria-pressed={ativo === i}
                  onClick={() => setAtivo(i)}
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

/** Índice da primeira causa cuja peça existe no modelo; null se nenhuma. */
function primeiroComPeca(modelo: ModeloComCena, marcadores: Marcador[]): number | null {
  const pecas = new Set(MODELOS[modelo].pecas.map((p) => p.id));
  const i = marcadores.findIndex((m) => pecas.has(m.peca));
  return i >= 0 ? i : null;
}

const BOTAO_NO_MODELO =
  "inline-flex min-h-11 items-center rounded-full border border-borda bg-superficie px-4 text-[13.5px] text-texto transition hover:border-borda-forte aria-pressed:border-transparent aria-pressed:bg-tinta aria-pressed:font-semibold aria-pressed:text-tinta-texto";

function Mensagem({ children, role }: { children: ReactNode; role?: "status" }) {
  return (
    <div role={role} className="flex h-full items-center justify-center p-6 text-center text-[13.5px] text-texto-3">
      {children}
    </div>
  );
}

/**
 * Acompanha a entrada na tela sem parar de observar: `naTela` liga/desliga o desenho do canvas, e `jaVisto` monta
 * a cena só na primeira vez que o bloco aparece.
 */
function useVisivel(ref: RefObject<HTMLDivElement | null>) {
  const [naTela, setNaTela] = useState(false);
  const [jaVisto, setJaVisto] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        const dentro = entradas.some((e) => e.isIntersecting);
        setNaTela(dentro);
        if (dentro) setJaVisto(true);
      },
      { rootMargin: "200px" },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [ref]);
  return { naTela, jaVisto };
}

let webglCache: boolean | undefined;
/** Há WebGL neste navegador? Testa com um contexto de sonda e o libera logo em seguida. null no servidor e na hidratação. */
function useWebGL(): boolean | null {
  return useSyncExternalStore(
    () => () => {},
    () => {
      if (webglCache === undefined) {
        try {
          const c = document.createElement("canvas");
          const gl = c.getContext("webgl2") || c.getContext("webgl");
          webglCache = !!gl;
          (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
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
