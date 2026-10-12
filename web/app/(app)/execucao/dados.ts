import "server-only";

import { filtrarConf, type Contexto } from "@/lib/wcm/contexto";
import * as ex from "@/lib/wcm/execucao";

import { assinatura, memo } from "./_ui/memo";
import { baseExecucao, ordensDoRecorte } from "./calculos";

/**
 * Operações (IW38OP) com situação e quem fez + apontamentos (IW47) no recorte de área/tipo (em cache pela versão
 * das bases) e depois no centro de trabalho escolhido — o _ops() + o filtro de setor/centro de central/execucao_ui.py.
 */
export function execucaoDoRecorte(c: Contexto) {
  const { areas, tipos } = c.f;
  const base = memo(`ex|${assinatura(c.b)}|${areas.join(",")}|${tipos.join(",")}`, () => {
    const ordens = ordensDoRecorte(c.b.ordens.dados, areas, tipos);
    const confRec = filtrarConf(c, c.b.confirmacoes.dados, areas, [], tipos);
    return { ordens, ...baseExecucao(c.b.operacoes.dados ?? [], ordens, c.b.confirmacoes.dados, confRec, c.b.equipe.dados, c.b.hoje) };
  });
  return ex.recortarPorCentros(base.ops, base.ap, base.ordens, c.centros);
}
