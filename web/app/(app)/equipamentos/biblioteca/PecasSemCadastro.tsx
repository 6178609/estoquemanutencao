"use client";

import { LoaderCircle, PackagePlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Campo, Mensagem } from "@/components/Campos";
import { BOTAO_PRIMARIO } from "@/components/ui";

import { adicionarPecaSemCadastro, removerPecaSemCadastro } from "../acoes";

interface PecaTela { id: string; descricao: string; referencia: string; fabricante: string; quantidade: string; origem: string }

/** Peças do equipamento sem código no Sysmat: lista (todos) e incluir/remover (editor). */
export function PecasSemCadastro({ eq, pecas, edita }: { eq: string; pecas: PecaTela[]; edita: boolean }) {
  const router = useRouter();
  const [estado, setEstado] = useState({ enviando: false, erro: "", ok: "" });
  const [removendo, setRemovendo] = useState("");

  const incluir = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formulario = e.currentTarget;
    setEstado({ enviando: true, erro: "", ok: "" });
    const r = await adicionarPecaSemCadastro(eq, Object.fromEntries(new FormData(formulario))).catch(() => ({ erro: "Não foi possível gravar agora; tente de novo." }));
    if ("erro" in r) { setEstado({ enviando: false, erro: r.erro, ok: "" }); return; }
    formulario.reset();
    setEstado({ enviando: false, erro: "", ok: "Peça incluída na lista." });
    router.refresh();
  };

  const remover = async (p: PecaTela) => {
    if (!confirm(`Tirar "${p.descricao}" da lista?`)) return;
    setRemovendo(p.id);
    const r = await removerPecaSemCadastro(eq, p.id).catch(() => ({ erro: "Não foi possível remover." }));
    if ("erro" in r) setEstado({ enviando: false, erro: r.erro, ok: "" });
    else router.refresh();
    setRemovendo("");
  };

  return (
    <div className="space-y-4">
      {pecas.length === 0 ? (
        <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">
          Nenhuma peça sem cadastro anotada.{edita ? " Inclua abaixo a peça que achou no manual, no desenho ou na máquina e que não tem código." : ""}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
          <table className="w-full min-w-[640px] text-left text-[13.5px]">
            <thead className="bg-superficie-2 text-[12px] text-texto-3">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Peça</th>
                <th scope="col" className="px-3 py-2 font-semibold">Referência / fabricante</th>
                <th scope="col" className="px-3 py-2 font-semibold">Qtd.</th>
                <th scope="col" className="px-3 py-2 font-semibold">Origem</th>
                {edita && <th scope="col" className="w-14 px-3 py-2"><span className="sr-only">Remover</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {pecas.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-medium">{p.descricao}</td>
                  <td className="px-3 py-2 text-texto-2">{[p.referencia, p.fabricante].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="num px-3 py-2">{p.quantidade || "—"}</td>
                  <td className="px-3 py-2 text-texto-2">{p.origem || "—"}</td>
                  {edita && (
                    <td className="px-1 py-1">
                      <button type="button" onClick={() => remover(p)} aria-label={`Remover ${p.descricao}`} disabled={removendo === p.id} aria-busy={removendo === p.id}
                        className="grid size-11 place-items-center rounded-lg text-texto-3 transition hover:bg-superficie-2 hover:text-[var(--selo-critico-texto)]">
                        {removendo === p.id ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {edita && (
        <form onSubmit={incluir} className="space-y-3 rounded-cartao border border-borda bg-superficie-2 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Campo rotulo="Peça" name="descricao" required minLength={3} maxLength={120} placeholder="Ex.: Vedação U do cilindro de fechamento" className="lg:col-span-2" />
            <Campo rotulo="Referência" name="referencia" maxLength={80} placeholder="Ex.: UHS 55x65x6" />
            <Campo rotulo="Fabricante" name="fabricante" maxLength={60} placeholder="Ex.: Golden Eagle" />
            <Campo rotulo="Quantidade" name="quantidade" maxLength={20} placeholder="Ex.: 2" />
          </div>
          <Campo rotulo="Origem" name="origem" maxLength={120} placeholder="Ex.: Manual cap. 6 · Desenho 320.03.029-6 pos. 12" />
          {estado.erro && <Mensagem>{estado.erro}</Mensagem>}
          {estado.ok && <Mensagem tipo="ok">{estado.ok}</Mensagem>}
          <button type="submit" disabled={estado.enviando} aria-busy={estado.enviando} className={BOTAO_PRIMARIO}>
            {estado.enviando ? <LoaderCircle className="size-4 animate-spin" /> : <PackagePlus className="size-4" />}
            {estado.enviando ? "Gravando…" : "Incluir peça sem cadastro"}
          </button>
        </form>
      )}
    </div>
  );
}
