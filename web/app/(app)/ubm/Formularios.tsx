"use client";

import { AlertTriangle, Camera, CheckCircle2, LoaderCircle, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";
import { LIMITE_DOCUMENTO } from "@/lib/limitesManual";
import * as R from "@/lib/ubm/regras";

import { enviarUbm } from "./Acoes";

/**
 * Formulários do celular (QR colado no armário kanban): campos grandes, câmera do celular, a descrição da ordem (IW38) e
 * do código (kit/Sysmat) aparece enquanto digita; o que não for achado é gravado assim mesmo, com o aviso amarelo.
 */
const MB = Math.round(LIMITE_DOCUMENTO / 1_000_000);
const GRANDE = "h-12 w-full rounded-xl border border-borda-forte bg-superficie px-3.5 text-[16px] transition placeholder:text-texto-4 focus:border-[var(--acao)]";
const ROTULO = "mb-1.5 block text-[14px] font-semibold text-texto";
const ARQUIVO = "block w-full rounded-xl border border-borda-forte bg-superficie px-3 py-3 text-[15px] text-texto file:mr-3 file:h-10 file:rounded-lg file:border-0 file:bg-superficie-3 file:px-3 file:text-texto";

export interface ArmarioTela { id: string; nome: string; local: string; itens: { codigo: string; descricao: string; um: string }[] }

type Achado = { estado: "buscando" } | { estado: "achou"; texto: string } | { estado: "nao"; texto: string } | null;

/** Consulta ~0,4 s depois de parar de digitar (só com formato válido). */
function useConsulta(valor: string, valido: boolean, url: (v: string) => string, ler: (j: Record<string, unknown>) => Achado) {
  const [r, setR] = useState<{ v: string; a: Achado }>({ v: "", a: null });
  useEffect(() => {
    if (!valido) return;
    let vivo = true;
    const t = setTimeout(async () => {
      setR({ v: valor, a: { estado: "buscando" } });
      const resp = await fetch(url(valor)).catch(() => null);
      const j: Record<string, unknown> | null = resp?.ok ? await resp.json().catch(() => null) : null;
      if (vivo) setR({ v: valor, a: j ? ler(j) : null });
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [valor, valido]); // eslint-disable-line react-hooks/exhaustive-deps
  return valido && r.v === valor ? r.a : null;
}

function Retorno({ a, id }: { a: Achado; id: string }) {
  return (
    <span id={id} aria-live="polite" className="mt-1.5 block min-h-5 text-[13px]">
      {a?.estado === "buscando" && <span className="text-texto-3">Procurando…</span>}
      {a?.estado === "achou" && <span className="text-texto-2">{a.texto}</span>}
      {a?.estado === "nao" && (
        <span className="flex items-start gap-1.5 rounded-lg px-2.5 py-1.5" style={{ background: "var(--selo-atencao-fundo)", color: "var(--selo-atencao-texto)" }}>
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{a.texto}
        </span>
      )}
    </span>
  );
}

function useCodigo(codigo: string, armario: ArmarioTela) {
  const c = R.normalizarCodigo(codigo);
  const doKit = armario.itens.find((i) => i.codigo === c);
  const a = useConsulta(c, R.codigoValido(c), (v) => `/api/ubm?codigo=${encodeURIComponent(v)}&u=${encodeURIComponent(armario.id)}`, (j) => {
    const kit = j.kit as { um: string } | null;
    const d = String(j.descricao ?? "");
    if (d || kit) return { estado: "achou", texto: `${d || "Item do kit"}${kit ? ` · ${kit.um} · no kit do armário` : " · fora do kit do armário"}` };
    return { estado: "nao", texto: "Código não encontrado na base — será gravado mesmo assim." };
  });
  return { achado: a, um: doKit?.um ?? "" };
}

function Cabeca({ armario, titulo }: { armario: ArmarioTela; titulo: string }) {
  return (
    <div className="rounded-cartao border border-borda bg-superficie px-4 py-3">
      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-acao">{titulo}</div>
      <div className="mt-0.5 font-display text-[18px] font-medium leading-tight">{armario.id} · {armario.nome}</div>
      {armario.local && <div className="text-[13px] text-texto-3">{armario.local}</div>}
    </div>
  );
}

function Pronto({ titulo, texto, aoNovo }: { titulo: string; texto: string; aoNovo: () => void }) {
  return (
    <div role="status" className="space-y-4 rounded-cartao border border-borda bg-superficie p-5 text-center">
      <CheckCircle2 className="mx-auto size-12" style={{ color: "var(--selo-bom-texto)" }} aria-hidden />
      <h2 className="font-display text-[22px] font-medium">{titulo}</h2>
      <p className="text-[14px] text-texto-3">{texto}</p>
      <div className="grid gap-2">
        <button type="button" onClick={aoNovo} className={`${BOTAO_PRIMARIO} h-12`}>Registrar outra</button>
        <Link href="/ubm" className={`${BOTAO_SECUNDARIO} h-12`}>Ir para a aba UBM</Link>
      </div>
    </div>
  );
}

function Escolhas({ nome, opcoes, valor, mudar, rotulo, colunas = 2 }: { nome: string; opcoes: readonly (readonly [string, string])[]; valor: string;
  mudar: (v: string) => void; rotulo: string; colunas?: number }) {
  return (
    <fieldset>
      <legend className={ROTULO}>{rotulo}</legend>
      <div className={colunas === 1 ? "grid gap-2" : "grid grid-cols-2 gap-2"}>
        {opcoes.map(([v, r]) => (
          <label key={v} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[15px] transition ${valor === v ? "border-[var(--acao)] bg-[var(--selo-bom-fundo)] font-medium" : "border-borda-forte bg-superficie"}`}>
            <input type="radio" name={nome} value={v} checked={valor === v} onChange={() => mudar(v)} required className="size-4 accent-[var(--acao)]" />
            {r}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Foto({ obrigatoria, rotulo }: { obrigatoria: boolean; rotulo: string }) {
  const [nome, setNome] = useState("");
  return (
    <label className="block">
      <span className={ROTULO}><Camera className="mr-1 inline size-4 align-[-2px]" aria-hidden />{rotulo}</span>
      <input name="foto" type="file" accept="image/*" capture="environment" required={obrigatoria} className={ARQUIVO}
        onChange={(e) => setNome(e.target.files?.[0]?.name ?? "")} />
      <span className="mt-1 block text-[12.5px] text-texto-3">{nome ? `Foto: ${nome}` : `Câmera do celular ou arquivo, até ${MB} MB.`}</span>
    </label>
  );
}

function Enviar({ ocupado, rotulo }: { ocupado: boolean; rotulo: string }) {
  return (
    <button type="submit" disabled={ocupado} aria-busy={ocupado} className={`${BOTAO_PRIMARIO} h-14 w-full text-[17px]`}>
      {ocupado ? <LoaderCircle className="size-5 animate-spin" /> : <Send className="size-5" />} {ocupado ? "Enviando…" : rotulo}
    </button>
  );
}

function useEnvio() {
  const [estado, setEstado] = useState({ ocupado: false, erro: "", ok: false });
  const enviar = async (form: FormData) => {
    const arq = form.get("foto");
    if (arq instanceof File && arq.size > LIMITE_DOCUMENTO) { setEstado({ ocupado: false, erro: `A foto passou de ${MB} MB.`, ok: false }); return; }
    setEstado({ ocupado: true, erro: "", ok: false });
    const r = await enviarUbm(form);
    setEstado({ ocupado: false, erro: r.erro, ok: !r.erro });
    if (r.erro) window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };
  return { ...estado, enviar, limpar: () => setEstado({ ocupado: false, erro: "", ok: false }) };
}

/** Retirada: ordem, turno, código, quantidade, descrição do uso, lançado na ordem (SAP Mobile) e foto obrigatória. */
export function FormRetirada({ armario }: { armario: ArmarioTela }) {
  const e = useEnvio();
  const [chave, setChave] = useState(0);
  const [ordem, setOrdem] = useState("");
  const [codigo, setCodigo] = useState("");
  const [turno, setTurno] = useState("");
  const [lancado, setLancado] = useState("");
  const idOrdem = useId(), idCodigo = useId(), idLista = useId();
  const o = R.normalizarOrdem(ordem);
  const achOrdem = useConsulta(o, R.ordemValida(o), (v) => `/api/ubm?ordem=${encodeURIComponent(v)}`, (j) => {
    const a = j.achada as R.OrdemIw38 | null;
    if (a) return { estado: "achou", texto: [a.texto, a.equipamento && `Equipamento ${a.equipamento}${a.denominacao ? ` · ${a.denominacao}` : ""}`].filter(Boolean).join(" · ") };
    return { estado: "nao", texto: j.base ? "Ordem não encontrada na base — será gravada mesmo assim." : "IW38 não carregada — a ordem será gravada mesmo assim." };
  });
  const cod = useCodigo(codigo, armario);

  if (e.ok) {
    return <Pronto titulo="Retirada registrada" texto={lancado === "sim" ? "Obrigado! O planejamento já vê a retirada para repor o armário."
      : "Obrigado! Lembre de adicionar o material na ordem pelo SAP Mobile e marcar como lançada na aba UBM."}
      aoNovo={() => { e.limpar(); setOrdem(""); setCodigo(""); setTurno(""); setLancado(""); setChave(chave + 1); }} />;
  }
  return (
    <form key={chave} aria-label="Retirada de material" className="space-y-5" onSubmit={(ev) => {
      ev.preventDefault();
      const f = new FormData(ev.currentTarget);
      f.set("acao", "retirada");
      f.set("u", armario.id);
      void e.enviar(f);
    }}>
      <Cabeca armario={armario} titulo="Retirada de material" />
      <label className="block">
        <span className={ROTULO}>Ordem</span>
        <input name="ordem" value={ordem} onChange={(ev) => setOrdem(ev.target.value)} required maxLength={20} autoComplete="off" spellCheck={false}
          inputMode="numeric" placeholder="Número da ordem" aria-describedby={idOrdem} className={GRANDE} />
        <Retorno a={achOrdem} id={idOrdem} />
      </label>
      <Escolhas nome="turno" rotulo="Turno" valor={turno} mudar={setTurno} opcoes={R.TURNOS.map((t) => [t, t] as const)} />
      <label className="block">
        <span className={ROTULO}>Código do material</span>
        <input name="codigo" value={codigo} onChange={(ev) => setCodigo(ev.target.value)} required maxLength={40} autoComplete="off" spellCheck={false}
          list={idLista} placeholder="Código SAP do item" aria-describedby={idCodigo} className={GRANDE} />
        <datalist id={idLista}>{armario.itens.map((i) => <option key={i.codigo} value={i.codigo}>{i.descricao}</option>)}</datalist>
        <Retorno a={cod.achado} id={idCodigo} />
      </label>
      <label className="block">
        <span className={ROTULO}>Quantidade{cod.um ? ` (${cod.um})` : ""}</span>
        <input name="quantidade" defaultValue="1" required inputMode={cod.um && R.umInteira(cod.um) ? "numeric" : "decimal"} autoComplete="off" className={GRANDE} />
        <span className="mt-1 block text-[12.5px] text-texto-3">{cod.um && R.umInteira(cod.um) ? "Peça: número inteiro." : "Metro e outras unidades: até 2 casas (ex.: 1,5)."}</span>
      </label>
      <label className="block">
        <span className={ROTULO}>Descrição do uso</span>
        <textarea name="uso" required minLength={3} maxLength={500} rows={3} placeholder="Onde e para que o material foi usado"
          className={`${GRANDE} h-auto py-3`} />
      </label>
      <Escolhas nome="lancado" rotulo="Já lançado na ordem pelo SAP Mobile?" valor={lancado} mudar={setLancado}
        opcoes={[["sim", "Sim"], ["nao", "Não"]] as const} />
      <Foto obrigatoria rotulo="Foto do material" />
      {e.erro && <Mensagem>{e.erro}</Mensagem>}
      <Enviar ocupado={e.ocupado} rotulo="Enviar retirada" />
    </form>
  );
}

/** Solicitação: acabou, faltando ou reposição; código opcional só em "faltando"; foto opcional. */
export function FormSolicitacao({ armario }: { armario: ArmarioTela }) {
  const e = useEnvio();
  const [chave, setChave] = useState(0);
  const [tipo, setTipo] = useState("");
  const [codigo, setCodigo] = useState("");
  const idCodigo = useId(), idLista = useId();
  const cod = useCodigo(codigo, armario);
  if (e.ok) {
    return <Pronto titulo="Solicitação registrada" texto="Obrigado! O planejamento vê a solicitação na aba UBM."
      aoNovo={() => { e.limpar(); setTipo(""); setCodigo(""); setChave(chave + 1); }} />;
  }
  return (
    <form key={chave} aria-label="Solicitação de material" className="space-y-5" onSubmit={(ev) => {
      ev.preventDefault();
      const f = new FormData(ev.currentTarget);
      f.set("acao", "solicitacao");
      f.set("u", armario.id);
      void e.enviar(f);
    }}>
      <Cabeca armario={armario} titulo="Solicitação de material" />
      <Escolhas nome="tipo" rotulo="O que aconteceu?" valor={tipo} mudar={setTipo} colunas={1}
        opcoes={Object.entries(R.TIPOS_SOLICITACAO) as [string, string][]} />
      <label className="block">
        <span className={ROTULO}>Código do material{tipo === "faltando" ? " (se souber)" : ""}</span>
        <input name="codigo" value={codigo} onChange={(ev) => setCodigo(ev.target.value)} required={tipo !== "faltando"} maxLength={40}
          autoComplete="off" spellCheck={false} list={idLista} placeholder="Código SAP do item" aria-describedby={idCodigo} className={GRANDE} />
        <datalist id={idLista}>{armario.itens.map((i) => <option key={i.codigo} value={i.codigo}>{i.descricao}</option>)}</datalist>
        <Retorno a={cod.achado} id={idCodigo} />
      </label>
      <label className="block">
        <span className={ROTULO}>Quantidade{cod.um ? ` (${cod.um})` : ""}</span>
        <input name="quantidade" defaultValue="1" required inputMode="decimal" autoComplete="off" className={GRANDE} />
      </label>
      <label className="block">
        <span className={ROTULO}>Observação{tipo === "faltando" && !codigo.trim() ? "" : " (opcional)"}</span>
        <textarea name="observacao" maxLength={500} rows={3} required={tipo === "faltando" && !codigo.trim()}
          placeholder={tipo === "faltando" ? "Descreva o item que deveria estar no armário" : "Algo que o planejamento precise saber"}
          className={`${GRANDE} h-auto py-3`} />
      </label>
      <Foto obrigatoria={false} rotulo="Foto (opcional)" />
      {e.erro && <Mensagem>{e.erro}</Mensagem>}
      <Enviar ocupado={e.ocupado} rotulo="Enviar solicitação" />
    </form>
  );
}
