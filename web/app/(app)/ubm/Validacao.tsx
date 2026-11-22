"use client";

import { Check, LoaderCircle, PackageCheck, Warehouse, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";
import * as R from "@/lib/ubm/regras";
import type { ItemPendente } from "@/lib/ubm/validacao";

import { enviarUbm } from "./Acoes";

/**
 * Um material pendente da validação do líder (celular primeiro): dois botões grandes, "Veio da UBM" (escolhe o armário
 * quando o item está em mais de um, quantidade = a tomada na IW13, editável) e "Veio do Almox" (não mexe no saldo).
 * A confirmação é um segundo toque no mesmo cartão; depois de gravar, a página recarrega e a linha some.
 */
export function ItemValidacao({ item }: { item: ItemPendente }) {
  const router = useRouter();
  const [modo, setModo] = useState<"" | "ubm" | "almox">("");
  const [armario, setArmario] = useState(item.armarios.length === 1 ? item.armarios[0].id : "");
  const [qtd, setQtd] = useState(String(item.tomada).replace(".", ","));
  const [estado, setEstado] = useState({ ocupado: false, erro: "" });
  const idQtd = useId();
  const arm = item.armarios.find((a) => a.id === armario);
  const um = arm?.um ?? item.armarios[0]?.um ?? item.umIw13;
  const rotulo = `${item.codigo}${item.descricao ? ` · ${item.descricao}` : ""}`;

  const gravar = async (decisao: "ubm" | "almox") => {
    const f = new FormData();
    f.set("acao", "validar");
    f.set("chave", item.chave);
    f.set("decisao", decisao);
    if (decisao === "ubm") { f.set("armario", armario); f.set("quantidade", qtd); }
    setEstado({ ocupado: true, erro: "" });
    const r = await enviarUbm(f);
    if (r.erro) { setEstado({ ocupado: false, erro: r.erro }); return; }
    router.refresh();
  };

  return (
    <li className="min-w-0 space-y-3 rounded-xl border border-borda bg-superficie p-3" aria-label={`Material ${rotulo}`}>
      <div className="min-w-0 text-[13.5px]">
        <div className="break-words font-medium"><span className="num">{item.codigo}</span>{item.descricao && <span className="font-normal text-texto-2"> · {item.descricao}</span>}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-texto-3">
          <span>Tomado na IW13: <b className="num text-texto">{R.fmtQtd(item.tomada)} {item.umIw13}</b></span>
          {item.armarios.map((a) => <span key={a.id}>Saldo {a.id}: <b className={`num ${a.saldo < item.tomada ? "text-[var(--selo-serio-texto)]" : "text-texto"}`}>{R.fmtQtd(a.saldo)} {a.um}</b></span>)}
        </div>
      </div>

      {!modo && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setModo("ubm"); setEstado({ ocupado: false, erro: "" }); }} className={`${BOTAO_PRIMARIO} h-12 px-3 text-[14.5px]`}>
            <PackageCheck className="size-4 shrink-0" aria-hidden /> Veio da UBM
          </button>
          <button type="button" onClick={() => { setModo("almox"); setEstado({ ocupado: false, erro: "" }); }} className={`${BOTAO_SECUNDARIO} h-12 px-3 text-[14.5px]`}>
            <Warehouse className="size-4 shrink-0" aria-hidden /> Veio do Almox
          </button>
        </div>
      )}

      {modo === "ubm" && (
        <form className="space-y-3 rounded-xl bg-superficie-2 p-3" aria-label={`Veio da UBM · ${item.codigo}`}
          onSubmit={(e) => { e.preventDefault(); void gravar("ubm"); }}>
          {item.armarios.length > 1 && (
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">De qual armário saiu?</legend>
              <div className="grid gap-2">
                {item.armarios.map((a) => (
                  <label key={a.id} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[14px] ${armario === a.id ? "border-[var(--acao)] bg-[var(--selo-bom-fundo)] font-medium" : "border-borda-forte bg-superficie"}`}>
                    <input type="radio" name={`arm-${item.chave}`} value={a.id} checked={armario === a.id} onChange={() => setArmario(a.id)} required className="size-4 accent-[var(--acao)]" />
                    <span className="min-w-0 break-words">{a.id} · {a.nome} <span className="text-texto-3">(saldo {R.fmtQtd(a.saldo)} {a.um})</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="block" htmlFor={idQtd}>
            <span className="mb-1.5 block text-[13px] font-semibold">Quantidade que saiu da UBM ({um})</span>
            <input id={idQtd} value={qtd} onChange={(e) => setQtd(e.target.value)} required autoComplete="off"
              inputMode={R.umInteira(um) ? "numeric" : "decimal"}
              className="h-12 w-full rounded-xl border border-borda-forte bg-superficie px-3.5 text-[16px] focus:border-[var(--acao)]" />
            <span className="mt-1 block text-[12px] text-texto-3">{R.umInteira(um) ? "Peça: número inteiro." : "Até 2 casas (ex.: 1,5)."} Baixa do saldo do armário.</span>
          </label>
          {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
          <div className="grid grid-cols-2 gap-2">
            <button type="submit" disabled={estado.ocupado || !armario} aria-busy={estado.ocupado} className={`${BOTAO_PRIMARIO} h-12 px-3 text-[14.5px]`}>
              {estado.ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Confirmar
            </button>
            <button type="button" onClick={() => setModo("")} className={`${BOTAO_SECUNDARIO} h-12 px-3 text-[14.5px]`}><X className="size-4" /> Cancelar</button>
          </div>
        </form>
      )}

      {modo === "almox" && (
        <div className="space-y-3 rounded-xl bg-superficie-2 p-3">
          <p className="text-[13px] text-texto-2">Confirma que o material veio do <b>Almox</b>? O saldo da UBM não muda.</p>
          {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void gravar("almox")} disabled={estado.ocupado} aria-busy={estado.ocupado} className={`${BOTAO_PRIMARIO} h-12 px-3 text-[14.5px]`}>
              {estado.ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Confirmar Almox
            </button>
            <button type="button" onClick={() => setModo("")} className={`${BOTAO_SECUNDARIO} h-12 px-3 text-[14.5px]`}><X className="size-4" /> Cancelar</button>
          </div>
        </div>
      )}
    </li>
  );
}
