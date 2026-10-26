"use client";

import { Check, LoaderCircle, Lock, LockOpen, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Campo, Mensagem, Seletor } from "@/components/Campos";
import { BOTAO_COMPACTO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";

/** Envia uma ação da aba para /api/cartao e recarrega a tela; devolve a mensagem de erro ("" = deu certo). */
async function enviar(form: FormData): Promise<string> {
  const arq = form.get("cupom");
  if (arq instanceof File && arq.size > 4_000_000) return "O cupom passou de 4 MB.";
  const r = await fetch("/api/cartao", { method: "POST", body: form }).catch(() => null);
  const j = await r?.json().catch(() => ({})) ?? {};
  if (!r?.ok) return j.erro || (r?.status === 413 ? "O cupom passou de 4 MB." : "Não foi possível gravar agora; tente de novo.");
  return "";
}

function useAcao() {
  const router = useRouter();
  const [estado, setEstado] = useState({ ocupado: false, erro: "" });
  const rodar = async (dados: Record<string, string> | FormData) => {
    const form = dados instanceof FormData ? dados : new FormData();
    if (!(dados instanceof FormData)) for (const [k, v] of Object.entries(dados)) form.set(k, v);
    setEstado({ ocupado: true, erro: "" });
    const erro = await enviar(form);
    setEstado({ ocupado: false, erro });
    if (!erro) router.refresh();
    return !erro;
  };
  return { ...estado, rodar };
}

export interface GastoTela {
  id: string; data: string; valor: number; estabelecimento: string; descricao: string; categoria: string;
  documento: string; ordem: string; centroCusto: string;
}

/** Lançar (ou editar) um gasto: campos + cupom fiscal (PDF ou foto). */
export function FormGasto({ bloco, categorias, hoje, gasto, aoFechar }: { bloco: string; categorias: string[]; hoje: string;
  gasto?: GastoTela; aoFechar?: () => void }) {
  const a = useAcao();
  const [ok, setOk] = useState("");
  const submeter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    const form = new FormData(el);
    form.set("acao", gasto ? "editar" : "lancar");
    form.set("bloco", bloco);
    if (gasto) form.set("gasto", gasto.id);
    setOk("");
    if (await a.rodar(form)) {
      if (gasto) aoFechar?.();
      else { el.reset(); setOk("Gasto lançado."); }
    }
  };
  return (
    <form onSubmit={submeter} className="space-y-3 rounded-cartao border border-borda bg-superficie-2 p-4">
      <div className="font-display text-[15px] font-medium">{gasto ? "Editar gasto" : "Lançar gasto"}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Data da compra" name="data" type="date" required max={hoje} defaultValue={gasto?.data ?? hoje} />
        <Campo rotulo="Valor (R$)" name="valor" required inputMode="decimal" placeholder="0,00"
          defaultValue={gasto ? gasto.valor.toFixed(2).replace(".", ",") : ""} />
        <Campo rotulo="Estabelecimento" name="estabelecimento" required maxLength={120} defaultValue={gasto?.estabelecimento} />
        <Seletor rotulo="Categoria" name="categoria" required vazio="Escolha…" defaultValue={gasto?.categoria ?? ""}
          opcoes={Object.fromEntries(categorias.map((c) => [c, c]))} />
        <Campo rotulo="O que foi comprado" name="descricao" required maxLength={300} className="sm:col-span-2" defaultValue={gasto?.descricao} />
        <Campo rotulo="Nº do cupom / NF" name="documento" maxLength={40} defaultValue={gasto?.documento} />
        <Campo rotulo="Ordem de manutenção" name="ordem" inputMode="numeric" maxLength={12} placeholder="opcional" defaultValue={gasto?.ordem} />
        <Campo rotulo="Centro de custo" name="centroCusto" maxLength={20} placeholder="opcional" defaultValue={gasto?.centroCusto} />
        <label className="block sm:col-span-2 lg:col-span-3">
          <span className="mb-1.5 block text-[13px] font-semibold text-texto">
            Cupom fiscal (PDF ou foto, até 4 MB){gasto ? " — só se for trocar" : ""}
          </span>
          <input name="cupom" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" capture="environment"
            className="block h-11 w-full rounded-xl border border-borda bg-superficie px-3 py-2 text-[13.5px] text-texto file:mr-3 file:rounded-lg file:border-0 file:bg-superficie-3 file:px-3 file:text-texto" />
        </label>
      </div>
      {a.erro && <Mensagem>{a.erro}</Mensagem>}
      {ok && <Mensagem tipo="ok">{ok}</Mensagem>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={a.ocupado} aria-busy={a.ocupado} className={BOTAO_PRIMARIO}>
          {a.ocupado ? <LoaderCircle className="size-4 animate-spin" /> : gasto ? <Check className="size-4" /> : <Upload className="size-4" />}
          {a.ocupado ? "Gravando…" : gasto ? "Salvar alterações" : "Lançar gasto"}
        </button>
        {gasto && <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>Cancelar</button>}
      </div>
    </form>
  );
}

/** Ações de uma linha: editar/excluir (portador) e conferir/recusar/voltar (quem confere). */
export function AcoesGasto({ bloco, gasto, categorias, hoje, edita, confere, status, temCupom }: {
  bloco: string; gasto: GastoTela; categorias: string[]; hoje: string; edita: boolean; confere: boolean; status: string; temCupom: boolean;
}) {
  const a = useAcao();
  const [editando, setEditando] = useState(false);
  const base = { bloco, gasto: gasto.id };
  const conferir = (st: string) => {
    let motivo = "";
    if (st === "Recusado") {
      motivo = prompt("Motivo da recusa:")?.trim() ?? "";
      if (!motivo) return;
    }
    void a.rodar({ ...base, acao: "conferir", status: st, motivo });
  };
  if (editando) return <div className="w-full"><FormGasto bloco={bloco} categorias={categorias} hoje={hoje} gasto={gasto} aoFechar={() => setEditando(false)} /></div>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {edita && (
        <>
          <button type="button" onClick={() => setEditando(true)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-borda px-2.5 text-[12.5px] hover:bg-superficie-2">
            <Pencil className="size-3.5" /> Editar
          </button>
          <button type="button" disabled={a.ocupado} aria-label="Excluir gasto"
            onClick={() => confirm("Excluir este gasto (e o cupom anexado)?") && void a.rodar({ ...base, acao: "excluir" })}
            className="grid size-9 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-[var(--selo-critico-texto)]">
            {a.ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </button>
        </>
      )}
      {confere && status === "Lançado" && (
        <>
          <button type="button" disabled={a.ocupado || !temCupom} onClick={() => conferir("Conferido")} title={temCupom ? "" : "Sem cupom anexado"}
            className={BOTAO_COMPACTO}><Check className="size-3.5" /> Conferir</button>
          <button type="button" disabled={a.ocupado} onClick={() => conferir("Recusado")}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-borda px-2.5 text-[12.5px] hover:bg-superficie-2"><X className="size-3.5" /> Recusar</button>
        </>
      )}
      {confere && status !== "Lançado" && (
        <button type="button" disabled={a.ocupado} onClick={() => conferir("Lançado")}
          className="inline-flex h-9 items-center rounded-lg px-2.5 text-[12.5px] text-texto-3 hover:bg-superficie-2">Desfazer</button>
      )}
      {a.erro && <span role="alert" className="text-[12px] text-[var(--selo-critico-texto)]">{a.erro}</span>}
    </div>
  );
}

/** Criar o bloco de um portador (quem confere). */
export function NovoBloco({ usuarios }: { usuarios: Record<string, string> }) {
  const a = useAcao();
  const [aberto, setAberto] = useState(false);
  const [login, setLogin] = useState("");
  const [nome, setNome] = useState("");
  if (!aberto) return <button type="button" onClick={() => setAberto(true)} className={BOTAO_COMPACTO}><Plus className="size-3.5" /> Novo bloco</button>;
  return (
    <form className="grid w-full gap-3 rounded-cartao border border-borda bg-superficie-2 p-4 sm:grid-cols-[1fr_1fr_auto]"
      onSubmit={async (e) => { e.preventDefault(); if (await a.rodar({ acao: "bloco", login, nome })) { setAberto(false); setLogin(""); setNome(""); } }}>
      <Seletor rotulo="Usuário do portador" required vazio="Escolha…" value={login} opcoes={usuarios}
        onChange={(e) => { setLogin(e.target.value); if (!nome) setNome(usuarios[e.target.value]?.replace(/ \(.*\)$/, "") ?? ""); }} />
      <Campo rotulo="Nome no bloco" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
      <div className="flex items-end gap-2">
        <button type="submit" disabled={a.ocupado} className={BOTAO_PRIMARIO}>{a.ocupado ? "Criando…" : "Criar"}</button>
        <button type="button" onClick={() => setAberto(false)} className={BOTAO_SECUNDARIO}>Cancelar</button>
      </div>
      {a.erro && <div className="sm:col-span-3"><Mensagem>{a.erro}</Mensagem></div>}
    </form>
  );
}

/** Fechar o mês (quem confere) ou reabrir (administrador). */
export function FecharMes({ mes, fechado, podeFechar, podeReabrir, rotulo }: { mes: string; fechado: boolean; podeFechar: boolean; podeReabrir: boolean; rotulo: string }) {
  const a = useAcao();
  if (fechado && !podeReabrir) return null;
  if (!fechado && !podeFechar) return null;
  const acao = fechado ? "reabrir" : "fechar";
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" disabled={a.ocupado}
        onClick={() => confirm(fechado ? `Reabrir ${rotulo}? Os gastos voltam a poder ser alterados.`
          : `Fechar ${rotulo}? Depois disso ninguém lança, altera nem confere gastos deste mês.`) && void a.rodar({ acao, mes })}
        className={fechado ? BOTAO_SECUNDARIO : BOTAO_COMPACTO}>
        {fechado ? <LockOpen className="size-4" /> : <Lock className="size-3.5" />} {fechado ? "Reabrir o mês" : "Fechar o mês"}
      </button>
      {a.erro && <span role="alert" className="text-[12px] text-[var(--selo-critico-texto)]">{a.erro}</span>}
    </span>
  );
}

/** Ativar/desativar um bloco (quem confere). */
export function AtivarBloco({ bloco, ativo }: { bloco: string; ativo: boolean }) {
  const a = useAcao();
  return (
    <button type="button" disabled={a.ocupado} onClick={() => void a.rodar({ acao: "ativar", bloco, ativo: ativo ? "0" : "1" })}
      className="inline-flex h-9 items-center rounded-lg border border-borda px-3 text-[12.5px] hover:bg-superficie-2">
      {ativo ? "Desativar bloco" : "Reativar bloco"}
    </button>
  );
}
