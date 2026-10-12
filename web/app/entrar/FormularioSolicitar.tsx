"use client";

import { CheckCircle2, LoaderCircle, Send } from "lucide-react";
import { useActionState } from "react";

import { Campo, ENTRADA, Mensagem, Seletor } from "@/components/Campos";
import { acaoSolicitar, type EstadoPedido } from "./acoes";

const FUNCOES = { lider: "Líder de manutenção", analista: "Analista", manutentor: "Manutentor", terceiro: "Terceiro" };

export function FormularioSolicitar() {
  const [estado, enviar, enviando] = useActionState<EstadoPedido, FormData>(acaoSolicitar,
    { erro: "", ok: false, nome: "", login: "", funcao: "", motivo: "" });
  if (estado.ok) {
    return (
      <div className="space-y-3 text-[14px] text-texto-2">
        <p className="flex items-center gap-2 font-display text-[16px] font-medium text-marca-600 dark:text-marca-300">
          <CheckCircle2 className="size-5" /> Pedido enviado
        </p>
        <p>Um administrador do PCM vai conferir e liberar o seu acesso. Depois de aprovado, entre com o seu NP
          (<b className="num">{estado.login.trim()}</b>) e a senha que você acabou de escolher.</p>
      </div>
    );
  }
  return (
    <form action={enviar} className="space-y-4">
      <Campo rotulo="Seu nome" name="nome" defaultValue={estado.nome} required autoComplete="name" maxLength={80} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Número Pessoal (NP)" name="login" defaultValue={estado.login} required inputMode="numeric"
          placeholder="Ex.: 6178609" autoComplete="username" />
        <Seletor rotulo="Sua função" name="funcao" opcoes={FUNCOES} vazio="Escolha" defaultValue={estado.funcao} />
      </div>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-texto-2">Para que precisa do acesso? <span className="font-normal text-texto-3">(opcional)</span></span>
        <textarea name="motivo" defaultValue={estado.motivo} maxLength={300} rows={2} className={`${ENTRADA} h-auto py-2.5`} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Escolha uma senha" name="senha" type="password" required autoComplete="new-password" />
        <Campo rotulo="Repita a senha" name="senha2" type="password" required autoComplete="new-password" />
      </div>
      <p className="-mt-2 text-[12px] text-texto-3">Mínimo de 8 caracteres, com letras e números. Ela vale assim que o pedido for aprovado.</p>
      {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
      <button disabled={enviando}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-marca-500 font-display text-[15px] font-medium text-white transition hover:bg-marca-600 disabled:cursor-not-allowed disabled:opacity-60">
        {enviando ? <LoaderCircle className="size-5 animate-spin" /> : <><Send className="size-4" /> Enviar pedido</>}
      </button>
    </form>
  );
}
