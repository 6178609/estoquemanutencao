"use client";

import { Clock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AVISO_MS, INATIVIDADE_MIN, MOTIVO, PING_MS, restante } from "@/lib/auth/inatividade";

import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "./ui";

const CHAVE_ATIVIDADE = "cmw_atividade"; // última atividade, compartilhada entre as abas
const CHAVE_SAIU = "cmw_saiu"; // uma aba saiu: as outras vão junto
const EVENTOS = ["pointerdown", "pointermove", "keydown", "wheel", "scroll", "touchstart"] as const;

const ler = (k: string) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
/** Sem localStorage (aba privada, armazenamento bloqueado) cada aba conta sozinha: aí ela só sai desta aba e deixa o
 * encerramento da sessão para o servidor — uma aba esquecida não derruba a que está em uso. */
function compartilha(): boolean {
  try { localStorage.setItem("cmw_teste", "1"); localStorage.removeItem("cmw_teste"); return true; } catch { return false; }
}
const gravar = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* aba privada */ } };

/**
 * Saída automática por inatividade (regra em lib/auth/inatividade.ts): sem mexer no site por INATIVIDADE_MIN minutos
 * em nenhuma aba, avisa 1 minuto antes e depois sai. Enquanto a pessoa usa a tela, avisa o servidor de vez em quando
 * (o servidor também encerra a sessão parada, ver proxy.ts).
 */
export function Inatividade({ sair }: { sair: () => Promise<void> }) {
  const ultima = useRef(0), ultimoPing = useRef(0), saindo = useRef(false);
  const [falta, setFalta] = useState<number | null>(null); // ms até sair, só durante o aviso

  const encerrar = useCallback(async () => {
    if (saindo.current) return;
    saindo.current = true;
    if (compartilha()) {
      gravar(CHAVE_SAIU, Date.now());
      try { await sair(); } catch { /* o servidor pode já ter encerrado a sessão */ }
    }
    window.location.replace(`/entrar?motivo=${MOTIVO}`);
  }, [sair]);

  const avisarServidor = useCallback(async () => {
    ultimoPing.current = Date.now();
    try {
      const r = await fetch("/api/sessao", { cache: "no-store" });
      if (r.status === 401) await encerrar();
    } catch { /* sem rede: tenta no próximo ciclo */ }
  }, [encerrar]);

  const marcar = useCallback(() => {
    const agora = Date.now();
    if (agora - ultima.current < 5000) return; // no máximo a cada 5 s
    ultima.current = agora;
    gravar(CHAVE_ATIVIDADE, agora);
  }, []);

  const conferir = useCallback(() => {
    if (saindo.current) return;
    const agora = Date.now();
    const ult = Math.max(ultima.current, ler(CHAVE_ATIVIDADE));
    const r = restante(ult, agora);
    if (r <= 0) { void encerrar(); return; }
    setFalta(r <= AVISO_MS ? r : null);
    // ativo desde o último aviso ao servidor: renova lá também (quem lê uma tela longa sem trocar de página)
    if (ult > ultimoPing.current && agora - ultimoPing.current >= PING_MS) void avisarServidor();
  }, [encerrar, avisarServidor]);

  useEffect(() => {
    const agora = Date.now();
    ultima.current = agora;
    ultimoPing.current = agora; // a própria página acabou de passar pelo servidor
    gravar(CHAVE_ATIVIDADE, agora);
    const aoMexer = () => { if (!saindo.current) marcar(); };
    const aoVoltar = () => { if (document.visibilityState === "visible") conferir(); }; // computador acordou
    const outraAba = (e: StorageEvent) => {
      if (e.key === CHAVE_SAIU && e.newValue) { saindo.current = true; window.location.replace(`/entrar?motivo=${MOTIVO}`); }
      if (e.key === CHAVE_ATIVIDADE) conferir();
    };
    for (const ev of EVENTOS) window.addEventListener(ev, aoMexer, { passive: true, capture: true });
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("storage", outraAba);
    const t = setInterval(conferir, 1000);
    return () => {
      for (const ev of EVENTOS) window.removeEventListener(ev, aoMexer, { capture: true });
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("storage", outraAba);
      clearInterval(t);
    };
  }, [marcar, conferir]);

  if (falta == null) return null;
  const continuar = () => { ultima.current = 0; marcar(); setFalta(null); void avisarServidor(); };
  const seg = Math.max(0, Math.ceil(falta / 1000));
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="inat-titulo" aria-describedby="inat-texto"
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-cartao border border-borda bg-superficie p-6 text-center shadow-flutuante">
        <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-superficie-2">
          <Clock className="size-5 text-alp-laranja" strokeWidth={1.75} />
        </div>
        <h2 id="inat-titulo" className="font-display text-[18px] font-semibold tracking-tight">Você ainda está aí?</h2>
        <p id="inat-texto" className="mt-2 text-[13.5px] leading-relaxed text-texto-3">
          Por segurança, o site sai sozinho depois de {INATIVIDADE_MIN} minutos sem uso. Saindo em{" "}
          <b className="num text-texto">{seg} s</b>.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button type="button" autoFocus className={BOTAO_PRIMARIO} onClick={continuar}>Continuar conectado</button>
          <button type="button" className={BOTAO_SECUNDARIO} onClick={() => void encerrar()}>Sair agora</button>
        </div>
      </div>
    </div>
  );
}
