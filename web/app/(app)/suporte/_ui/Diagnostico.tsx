import Link from "next/link";

import { Campo } from "@/components/Campos";
import { Aviso, Secao } from "@/components/PaginaWcm";
import { BOTAO_SECUNDARIO, Cartao } from "@/components/ui";
import { podeVer, type Usuario } from "@/lib/auth/acesso";
import { guiaPorId } from "@/lib/suporte/guias";
import { TIPOS_EQUIPAMENTO, diagnosticar, type Sintoma } from "@/lib/suporte/diagnostico";
import { MODELO_DO_TIPO } from "@/lib/suporte/modelos3d";

import { HistoricoEquipamento } from "./HistoricoEquipamento";
import { Visualizador3D } from "./3d/Visualizador3D";
import { hrefSuporte, type Params, um } from "./url";
/** Diagnóstico guiado: tipo → sintoma → causas, verificações e aviso; com equipamento válido, o histórico dele. */
export async function Diagnostico({ params, u }: { params: Params; u: Usuario }) {
  const tipoId = um(params, "tipo");
  const tipo = TIPOS_EQUIPAMENTO.find((t) => t.id === tipoId);
  const sintomaId = um(params, "sintoma");
  const sintoma: Sintoma | null = tipo ? diagnosticar(tipo.id, sintomaId) : null;
  const eq = um(params, "eq").slice(0, 60);

  return (
    <div className="space-y-8">
      {/* 1. tipo de equipamento (e equipamento, opcional) */}
      <form method="get" action="/suporte" className="space-y-5">
        <input type="hidden" name="visao" value="diagnostico" />
        <fieldset className="space-y-3">
          <legend className="font-display text-[18px] font-medium text-texto">1. Qual é o equipamento?</legend>
          <div className="flex flex-wrap gap-2">
            {TIPOS_EQUIPAMENTO.map((t) => (
              <label key={t.id} className="inline-flex">
                <input type="radio" name="tipo" value={t.id} defaultChecked={t.id === tipo?.id} required className="peer sr-only" />
                <span className="inline-flex min-h-11 items-center rounded-full border border-borda bg-superficie px-4 text-[13.5px] text-texto-2 transition hover:border-borda-forte hover:text-texto peer-checked:border-transparent peer-checked:bg-tinta peer-checked:font-semibold peer-checked:text-tinta-texto peer-focus-visible:ring-2 peer-focus-visible:ring-acao">
                  {t.titulo}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,320px)_auto] sm:items-end">
          <Campo rotulo="Código do equipamento (opcional)" name="eq" defaultValue={eq} maxLength={60}
            dica="Se informar um equipamento do site, mostramos as últimas quebras e os modos de causa dele." />
          <button type="submit" className={BOTAO_SECUNDARIO}>Ver sintomas</button>
        </div>
      </form>

      {tipoId && !tipo && <Aviso>Tipo de equipamento não reconhecido. Escolha um da lista.</Aviso>}

      {/* 2. sintoma */}
      {tipo && (
        <form method="get" action="/suporte" className="space-y-5">
          <input type="hidden" name="visao" value="diagnostico" />
          <input type="hidden" name="tipo" value={tipo.id} />
          {eq && <input type="hidden" name="eq" value={eq} />}
          <fieldset className="space-y-3">
            <legend className="font-display text-[18px] font-medium text-texto">2. O que está acontecendo com o {tipo.titulo.toLowerCase()}?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {tipo.sintomas.map((s) => (
                <label key={s.id} className="flex min-h-11 items-center gap-3 rounded-cartao border border-borda bg-superficie px-4 py-3 text-[14px] text-texto transition hover:bg-superficie-2 has-[:checked]:border-acao">
                  <input type="radio" name="sintoma" value={s.id} defaultChecked={s.id === sintoma?.id} required className="size-4 accent-[var(--acao)]" />
                  <span>{s.titulo}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className={BOTAO_SECUNDARIO}>Ver causas prováveis</button>
        </form>
      )}

      {tipo && sintomaId && !sintoma && <Aviso>Escolha um dos sintomas da lista.</Aviso>}

      {tipo && sintoma && (
        <div className="space-y-8">
          <Secao titulo={`${sintoma.titulo}`} sub={`${tipo.titulo}. As causas vêm em ordem de frequência; siga as verificações na ordem.`}>
            <div className="grid gap-4 lg:grid-cols-2">
              <Cartao className="p-5">
                <h3 className="font-display text-[17px] font-medium text-texto">Causas prováveis</h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px] text-texto-2 marker:text-texto-3">
                  {sintoma.causas.map((c) => <li key={c}>{c}</li>)}
                </ol>
              </Cartao>
              <Cartao className="p-5">
                <h3 className="font-display text-[17px] font-medium text-texto">Verificações</h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px] text-texto-2 marker:text-texto-3">
                  {sintoma.verificar.map((v) => <li key={v}>{v}</li>)}
                </ol>
              </Cartao>
            </div>
            {sintoma.seguranca && <Aviso><strong className="font-semibold text-texto">Segurança: </strong>{sintoma.seguranca}</Aviso>}
            {sintoma.guias.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[13px] font-semibold text-texto">Guias relacionados</h3>
                <ul className="flex flex-wrap gap-2">
                  {sintoma.guias.map((id) => {
                    const g = guiaPorId(id);
                    return g ? (
                      <li key={id}>
                        <Link prefetch={false} href={hrefSuporte("guias", { guia: g.id })}
                          className="inline-flex min-h-11 items-center rounded-full border border-borda bg-superficie px-4 text-[13.5px] text-texto transition hover:border-borda-forte">
                          {g.titulo}
                        </Link>
                      </li>
                    ) : null;
                  })}
                </ul>
              </div>
            )}
            {MODELO_DO_TIPO[tipo.id] && (
              <Visualizador3D modelo={MODELO_DO_TIPO[tipo.id]!} tipo={tipo.id} sintoma={sintoma.id} />
            )}
          </Secao>

          {eq && podeVer(u, "confiabilidade") && <HistoricoEquipamento params={params} eq={eq} podeFicha={podeVer(u, "equipamentos")} />}
        </div>
      )}
    </div>
  );
}
