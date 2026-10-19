import clsx from "clsx";

import { MESES_ROADMAP, familia, resumir, situacao, ultimoMesComReal, type MaquinaComComentario } from "@/lib/wcm/roadmapSim";

import { AbasParam, GradeNumeros, Numero } from "../equipamentos/_ui/Blocos";
import { FiltrosUrl } from "../equipamentos/_ui/FiltrosUrl";
import { ComentarioEditavel } from "./ComentarioEditavel";

type Params = Record<string, string | string[] | undefined>;
const um = (p: Params, k: string) => (Array.isArray(p[k]) ? p[k]![0] : p[k]) ?? "";
const NOMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const passo = (v: number | null) => (v == null ? "" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

/** Célula de um mês: previsto em cima, realizado embaixo com a cor da situação (e texto para leitor de tela). */
function Mes({ prev, real, destaque }: { prev: number | null; real: number | null; destaque: boolean }) {
  const s = situacao(prev, real);
  return (
    <td className={clsx("border-l border-borda px-1 py-1 text-center", destaque && "bg-superficie-2")}>
      <div className="num text-[11.5px] leading-tight text-texto-3" title="Previsto"><span className="sr-only">Previsto </span>{prev == null ? "·" : passo(prev)}</div>
      <div className={clsx("num mx-auto mt-0.5 w-8 rounded-md py-0.5 text-[13px] font-semibold leading-tight",
        s === "ok" && "bg-[var(--selo-bom-fundo)] text-[var(--selo-bom-texto)]",
        s === "atrasada" && "bg-[var(--selo-critico-fundo)] text-[var(--selo-critico-texto)]",
        s === "sem" && "text-texto-4")}
        title={s === "ok" ? "Realizado: no previsto" : s === "atrasada" ? "Realizado: abaixo do previsto" : "Realizado"}>
        <span className="sr-only">Realizado </span>{real == null ? "–" : passo(real)}
        {s === "atrasada" && <span className="sr-only"> (abaixo do previsto)</span>}
      </div>
    </td>
  );
}

export function Roadmap({ maquinas, params, enviada, edita }: { maquinas: MaquinaComComentario[]; params: Params; enviada: string; edita: boolean }) {
  const ultimo = ultimoMesComReal(maquinas);
  const pedido = MESES_ROADMAP.indexOf(um(params, "rmes").toUpperCase());
  const mes = pedido >= 0 ? pedido : Math.max(0, ultimo);
  const familias = [...new Set(maquinas.map((m) => familia(m.maquina)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const famSel = um(params, "fam").split(",").map((x) => x.trim()).filter((x) => x && x !== "-");
  const q = um(params, "rq").trim().toUpperCase();
  const soAtrasadas = um(params, "ratr") === "1";
  const filtradas = maquinas
    .filter((m) => !famSel.length || famSel.includes(familia(m.maquina)))
    .filter((m) => !q || `${m.maquina} ${m.comentario}`.toUpperCase().includes(q));
  // os números do topo não dependem de "só as atrasadas" (que só enxuga a tabela)
  const r = resumir(filtradas, mes);
  const vis = soAtrasadas ? filtradas.filter((m) => situacao(m.previsto[mes], m.realizado[mes]) === "atrasada") : filtradas;
  const pct = r.ok + r.atrasadas ? Math.round((r.ok / (r.ok + r.atrasadas)) * 100) : null;
  const n1 = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <AbasParam params={params} param="rmes" atual={MESES_ROADMAP[mes]}
          abas={MESES_ROADMAP.slice(0, Math.max(ultimo, mes, 0) + 1).map((m, i) => ({ id: m, rotulo: NOMES[i] }))} />
        <FiltrosUrl campos={[
          { tipo: "busca", param: "rq", placeholder: "Buscar máquina ou comentário…" },
          { tipo: "alternar", param: "ratr", rotulo: `Só as atrasadas em ${NOMES[mes]}` },
          { tipo: "pilulas", param: "fam", rotulo: "Máquinas", opcoes: familias },
        ]} />
        <p className="text-[12.5px] text-texto-3">{enviada} Mês em destaque: <b className="text-texto-2">{NOMES[mes]}</b> (o último com realizado, se nenhum for escolhido).</p>
      </div>
      <GradeNumeros colunas={4}>
        <Numero rotulo={`No previsto em ${NOMES[mes]}`} valor={pct == null ? "—" : `${pct}%`} detalhe={`${r.ok} de ${r.ok + r.atrasadas} máquina(s) com previsto e realizado`}
          tom={pct == null ? undefined : pct >= 90 ? "bom" : pct >= 70 ? "atencao" : "critico"} />
        <Numero rotulo={`Atrasadas em ${NOMES[mes]}`} valor={String(r.atrasadas)} detalhe="realizado abaixo do passo previsto" tom={r.atrasadas ? "critico" : "bom"} />
        <Numero rotulo="Passo médio realizado" valor={n1(r.passoMedio)} detalhe={`em ${NOMES[mes]}, das ${r.total} máquina(s) mostradas`} />
        <Numero rotulo="Passo médio previsto em dezembro" valor={n1(r.metaFimAno)} detalhe="a meta de fim de ano" />
      </GradeNumeros>
      <section className="overflow-hidden rounded-cartao border border-borda bg-superficie">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr className="border-b border-borda bg-marca-700 text-white">
                <th className="sticky left-0 z-10 bg-marca-700 px-3 py-2 text-left text-[12px] font-semibold">Máquina</th>
                {NOMES.map((n, i) => <th key={n} className={clsx("px-1 py-2 text-center text-[12px] font-semibold", i === mes && "bg-marca-800")}>{n}</th>)}
                <th className="px-3 py-2 text-left text-[12px] font-semibold">Comentário</th>
              </tr>
            </thead>
            <tbody>
              {vis.map((m) => (
                <tr key={`${m.fabrica}|${m.maquina}`} className="border-b border-borda last:border-0">
                  <th scope="row" className="sticky left-0 z-10 max-w-56 bg-superficie px-3 py-1.5 text-left text-[13px] font-medium leading-snug">{m.maquina}</th>
                  {MESES_ROADMAP.map((_, i) => <Mes key={i} prev={m.previsto[i]} real={m.realizado[i]} destaque={i === mes} />)}
                  <td className="min-w-64 border-l border-borda px-3 py-1.5 text-[12.5px] leading-snug text-texto-2">
                    <ComentarioEditavel fabrica={m.fabrica} maquina={m.maquina} comentario={m.comentario} planilha={m.comentarioPlanilha}
                      manual={m.manual && { por: m.manual.por, em: m.manual.em }} edita={edita} />
                  </td>
                </tr>
              ))}
              {!vis.length && <tr><td colSpan={14} className="px-3 py-6 text-center text-[13.5px] text-texto-3">Nenhuma máquina com estes filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-[12px] text-texto-3">
        Em cada mês: o passo previsto em cima e o realizado embaixo — verde quando chegou no previsto, vermelho quando ficou abaixo. Meses sem
        realizado ainda aparecem com “–”. O comentário vem da planilha; quem edita pode reescrever no lápis (vale o manual até voltar ao da planilha).
      </p>
    </div>
  );
}
