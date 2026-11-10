"use client";

import { Check, LoaderCircle, PackageCheck, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { Campo, ENTRADA, Mensagem } from "@/components/Campos";
import { BOTAO_COMPACTO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";
import { LIMITE_DOCUMENTO } from "@/lib/limitesManual";

/** Id do <datalist> dos equipamentos, desenhado uma vez na página (servidor) e usado por todos os formulários. */
export const LISTA_EQUIPAMENTOS = "cm-equipamentos";
const MB = Math.round(LIMITE_DOCUMENTO / 1_000_000);
const PASSOU = `A foto passou de ${MB} MB.`;
const BOTAO_LINHA = "inline-flex h-9 items-center gap-1 rounded-lg border border-borda px-2.5 text-[12.5px] hover:bg-superficie-2 disabled:opacity-60";
const ARQUIVO = "block h-11 w-full rounded-xl border border-borda bg-superficie px-3 py-2 text-[13.5px] text-texto file:mr-3 file:rounded-lg file:border-0 file:bg-superficie-3 file:px-3 file:text-texto";

/** Envia uma ação para /api/cadastro_material; devolve o erro ("" = deu certo) e o aviso da gravação, se houver. */
async function enviar(form: FormData): Promise<{ erro: string; aviso: string }> {
  const arq = form.get("foto");
  if (arq instanceof File && arq.size > LIMITE_DOCUMENTO) return { erro: PASSOU, aviso: "" };
  const r = await fetch("/api/cadastro_material", { method: "POST", body: form }).catch(() => null);
  const j: { erro?: string; aviso?: string } = (await r?.json().catch(() => ({}))) ?? {};
  if (!r?.ok) return { erro: j.erro || (r?.status === 413 ? PASSOU : "Não foi possível gravar agora; tente de novo."), aviso: "" };
  return { erro: "", aviso: j.aviso ?? "" };
}

function useAcao() {
  const router = useRouter();
  const [estado, setEstado] = useState({ ocupado: false, erro: "", aviso: "" });
  const rodar = async (dados: Record<string, string> | FormData) => {
    const form = dados instanceof FormData ? dados : new FormData();
    if (!(dados instanceof FormData)) for (const [k, v] of Object.entries(dados)) form.set(k, v);
    setEstado({ ocupado: true, erro: "", aviso: "" });
    const r = await enviar(form);
    setEstado({ ocupado: false, ...r });
    if (!r.erro) router.refresh();
    return !r.erro;
  };
  return { ...estado, rodar };
}

/** Descrição do código SAP no catálogo, consultada ~0,4 s depois de parar de digitar (null = não achou). */
function useCatalogo(sap: string) {
  const codigo = sap.trim();
  const valido = /^\d{5,12}$/.test(codigo);
  const [achado, setAchado] = useState<{ sap: string; descricao: string | null } | null>(null);
  useEffect(() => {
    if (!valido) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/cadastro_material?sap=${encodeURIComponent(codigo)}`).catch(() => null);
      const j: { descricao?: string | null } | null = r?.ok ? await r.json().catch(() => null) : null;
      if (vivo && j) setAchado({ sap: codigo, descricao: j.descricao ?? null });
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [codigo, valido]);
  return valido && achado?.sap === codigo ? achado : null;
}

export interface PedidoTela { id: string; descricao: string; sap: string; tag: string; observacao: string }

/** Lançar (ou editar) um pedido: descrição, SAP (com a descrição do catálogo), equipamento da lista, observação e foto. */
function FormPedido({ pedido, aoFechar, aoGravar }: { pedido?: PedidoTela; aoFechar: () => void; aoGravar: () => void }) {
  const a = useAcao();
  const [sap, setSap] = useState(pedido?.sap ?? "");
  const cat = useCatalogo(sap);
  const idCatalogo = useId();
  const titulo = pedido ? "Editar pedido" : "Novo pedido";
  const submeter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.set("acao", pedido ? "editar" : "lancar");
    if (pedido) form.set("id", pedido.id);
    if (await a.rodar(form)) aoGravar();
  };
  return (
    <form onSubmit={submeter} aria-label={titulo} className="w-full space-y-3 rounded-cartao border border-borda bg-superficie-2 p-4">
      <div className="font-display text-[15px] font-medium">{titulo}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Descrição do material" name="descricao" autoComplete="off" required minLength={5} maxLength={200}
          className="sm:col-span-2" defaultValue={pedido?.descricao} />
        <div>
          <Campo rotulo="Número SAP" name="sap" autoComplete="off" spellCheck={false} required inputMode="numeric" pattern="\d{5,12}"
            maxLength={12} title="Só números, de 5 a 12 dígitos" value={sap} onChange={(e) => setSap(e.target.value.replace(/\D/g, ""))}
            aria-describedby={idCatalogo} />
          <span id={idCatalogo} aria-live="polite" className="mt-1 block text-[12px] text-texto-3">
            {cat ? (cat.descricao ? `Catálogo: ${cat.descricao}` : "Código não encontrado no catálogo (pode seguir)") : ""}
          </span>
        </div>
        <Campo rotulo="Equipamento" name="tag" list={LISTA_EQUIPAMENTOS} autoComplete="off" spellCheck={false} required maxLength={60}
          dica="Digite a tag ou o nome e escolha da lista." defaultValue={pedido?.tag} />
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-[13px] font-semibold text-texto">Observação (opcional)</span>
          <textarea name="observacao" maxLength={500} rows={2} defaultValue={pedido?.observacao}
            className={`${ENTRADA} h-auto min-h-11 py-2.5`} />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-[13px] font-semibold text-texto">
            Foto do material (câmera ou arquivo, até {MB} MB){pedido ? " — só se for trocar" : ""}
          </span>
          <input name="foto" type="file" accept="image/*" capture="environment" required={!pedido} className={ARQUIVO} />
        </label>
      </div>
      {a.erro && <Mensagem>{a.erro}</Mensagem>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={a.ocupado} aria-busy={a.ocupado} className={BOTAO_PRIMARIO}>
          {a.ocupado ? <LoaderCircle className="size-4 animate-spin" /> : pedido ? <Check className="size-4" /> : <Upload className="size-4" />}
          {a.ocupado ? "Gravando…" : pedido ? "Salvar alterações" : "Lançar pedido"}
        </button>
        <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>Cancelar</button>
      </div>
    </form>
  );
}

/** Botão "Novo pedido" e o formulário de lançamento. */
export function NovoPedido() {
  const [aberto, setAberto] = useState(false);
  const [ok, setOk] = useState("");
  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {ok && <Mensagem tipo="ok">{ok}</Mensagem>}
        <button type="button" onClick={() => { setOk(""); setAberto(true); }} className={BOTAO_PRIMARIO}>
          <Plus className="size-4" /> Novo pedido
        </button>
      </div>
    );
  }
  return <FormPedido aoFechar={() => setAberto(false)} aoGravar={() => { setAberto(false); setOk("Pedido lançado."); }} />;
}

export interface Permissoes { editar: boolean; aprovar: boolean; recusar: boolean; chegou: boolean; validar: boolean; recusarChegada: boolean }

/** Ações de um pedido: só as que valem para quem está vendo (conferidas de novo no servidor). */
export function AcoesPedido({ pedido, pode }: { pedido: PedidoTela; pode: Permissoes }) {
  const a = useAcao();
  const [aberto, setAberto] = useState<"" | "editar" | "recusar" | "recusar_chegada" | "chegou">("");
  const base = { id: pedido.id };
  const algum = Object.values(pode).some(Boolean);
  const fechar = () => setAberto("");
  const recado = (
    <>
      {a.erro && <Mensagem>{a.erro}</Mensagem>}
      {a.aviso && <Mensagem tipo="ok">{a.aviso}</Mensagem>}
    </>
  );

  if (aberto === "editar") return <FormPedido pedido={pedido} aoFechar={fechar} aoGravar={fechar} />;

  if (aberto === "recusar" || aberto === "recusar_chegada") {
    return (
      <form className="space-y-3" aria-label={aberto === "recusar" ? "Recusar pedido" : "Recusar chegada"}
        onSubmit={async (e) => {
          e.preventDefault();
          const motivo = String(new FormData(e.currentTarget).get("motivo") ?? "").trim();
          if (await a.rodar({ ...base, acao: aberto, motivo })) fechar();
        }}>
        <Campo rotulo="Motivo da recusa" name="motivo" autoComplete="off" required minLength={3} maxLength={300} autoFocus
          dica={aberto === "recusar_chegada" ? "O pedido volta para o Almoxarifado anexar outra foto." : "O pedido fica recusado."} />
        {recado}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={a.ocupado} aria-busy={a.ocupado} className={BOTAO_COMPACTO}>
            {a.ocupado ? <LoaderCircle className="size-3.5 animate-spin" /> : <X className="size-3.5" />} Confirmar recusa
          </button>
          <button type="button" onClick={fechar} className={BOTAO_LINHA}>Cancelar</button>
        </div>
      </form>
    );
  }

  if (aberto === "chegou") {
    return (
      <form className="space-y-3" aria-label="Marcar chegada"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          form.set("acao", "chegou");
          form.set("id", pedido.id);
          if (await a.rodar(form)) fechar();
        }}>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-texto">Foto do material recebido (câmera ou arquivo, até {MB} MB)</span>
          <input name="foto" type="file" accept="image/*" capture="environment" required className={ARQUIVO} />
        </label>
        {recado}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={a.ocupado} aria-busy={a.ocupado} className={BOTAO_COMPACTO}>
            {a.ocupado ? <LoaderCircle className="size-3.5 animate-spin" /> : <PackageCheck className="size-3.5" />} Confirmar chegada
          </button>
          <button type="button" onClick={fechar} className={BOTAO_LINHA}>Cancelar</button>
        </div>
      </form>
    );
  }

  if (!algum) return a.erro || a.aviso ? <div className="space-y-2">{recado}</div> : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {pode.aprovar && (
          <button type="button" disabled={a.ocupado} onClick={() => void a.rodar({ ...base, acao: "aprovar" })} className={BOTAO_COMPACTO}>
            <Check className="size-3.5" /> Aprovar
          </button>
        )}
        {pode.recusar && <button type="button" disabled={a.ocupado} onClick={() => setAberto("recusar")} className={BOTAO_LINHA}><X className="size-3.5" /> Recusar</button>}
        {pode.chegou && (
          <button type="button" disabled={a.ocupado} onClick={() => setAberto("chegou")} className={BOTAO_COMPACTO}>
            <PackageCheck className="size-3.5" /> Chegou
          </button>
        )}
        {pode.validar && (
          <button type="button" disabled={a.ocupado} onClick={() => void a.rodar({ ...base, acao: "validar" })} className={BOTAO_COMPACTO}>
            <Check className="size-3.5" /> Validar
          </button>
        )}
        {pode.recusarChegada && (
          <button type="button" disabled={a.ocupado} onClick={() => setAberto("recusar_chegada")} className={BOTAO_LINHA}>
            <X className="size-3.5" /> Recusar chegada
          </button>
        )}
        {pode.editar && (
          <>
            <button type="button" disabled={a.ocupado} onClick={() => setAberto("editar")} className={BOTAO_LINHA}><Pencil className="size-3.5" /> Editar</button>
            <button type="button" disabled={a.ocupado} aria-label="Excluir pedido"
              onClick={() => confirm("Excluir este pedido (e a foto anexada)?") && void a.rodar({ ...base, acao: "excluir" })}
              className="grid size-9 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-[var(--selo-critico-texto)]">
              <Trash2 className="size-4" />
            </button>
          </>
        )}
        {a.ocupado && <LoaderCircle className="size-4 animate-spin text-texto-3" aria-label="Gravando" />}
      </div>
      {recado}
    </div>
  );
}
