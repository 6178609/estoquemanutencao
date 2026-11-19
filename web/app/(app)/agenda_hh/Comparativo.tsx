"use client";

import clsx from "clsx";
import { AlertTriangle, CalendarRange, CheckCircle2, ClipboardList, Clock, Gauge, Scale } from "lucide-react";
import { useMemo, useState } from "react";

import { Seletor } from "@/components/Campos";
import { Barras, Grafico, Legenda, Medidor, Partes, cor, type Cor } from "@/components/graficos";
import { Cartao, Kpi, Selo } from "@/components/ui";
import {
  aderencia, alertasPorTecnico, hhPorTipo, nivelOcupacao, porStatus, programacoesDoPeriodo, sobrecargas, type NivelOcupacao,
} from "@/lib/agendaHh/analise";
import {
  type Periodo, type Programacao, type Tecnico, comparar, comparativo, formatarHoras, formatarHorasSinal, formatarNumero,
  formatarPct, periodoDaVisao,
} from "@/lib/agendaHh/regras";

import { Avatar } from "./comum";

/** Cor de cada status (identidade): concluída no verde de status; os outros nas séries. */
const COR_STATUS: Record<string, Cor> = { programada: "serie-1", reprogramada: "serie-2", concluida: "st-bom" };
const corStatus = (s: string, i: number): Cor => COR_STATUS[s] ?? (["serie-3", "serie-4", "neutro"] as Cor[])[i % 3];

const SELO_NIVEL: Record<NivelOcupacao, { cor: "vermelho" | "amarelo" | "verde" | "cinza"; texto: string }> = {
  sobrecarga: { cor: "vermelho", texto: "Sobrecarga" }, alta: { cor: "amarelo", texto: "Ocupação alta" },
  normal: { cor: "verde", texto: "Dentro da capacidade" }, livre: { cor: "cinza", texto: "Sem programação" },
};

export function Comparativo({ tecnicos, programacoes, hoje }: { tecnicos: Tecnico[]; programacoes: Programacao[]; hoje: string }) {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDaVisao("mes", hoje));
  const [area, setArea] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");

  const areas = useMemo(() => [...new Set(tecnicos.map((t) => t.area).filter(Boolean))].sort(comparar), [tecnicos]);
  const opcoesTecnico = useMemo(() => Object.fromEntries([...tecnicos].sort((a, b) => comparar(a.nome, b.nome))
    .map((t) => [t.id, `${t.nome} • NP ${t.np || "não informado"}`])), [tecnicos]);
  const areaAtiva = areas.includes(area) ? area : "";
  const tecnicoAtivo = tecnicos.some((t) => t.id === tecnicoId) ? tecnicoId : "";

  const c = useMemo(() => comparativo(tecnicos, programacoes, periodo, { area: areaAtiva, tecnicoId: tecnicoAtivo }),
    [tecnicos, programacoes, periodo, areaAtiva, tecnicoAtivo]);
  const doPeriodo = useMemo(() => programacoesDoPeriodo(programacoes, periodo, new Set(c.linhas.map((l) => l.tecnico.id))),
    [programacoes, periodo, c.linhas]);
  const ader = useMemo(() => aderencia(doPeriodo), [doPeriodo]);
  const status = useMemo(() => porStatus(doPeriodo), [doPeriodo]);
  const tipos = useMemo(() => hhPorTipo(doPeriodo), [doPeriodo]);
  const acima = useMemo(() => sobrecargas(c.linhas), [c.linhas]);
  const diasAlerta = useMemo(() => alertasPorTecnico(c.alertas), [c.alertas]);

  const filtrado = !!(areaAtiva || tecnicoAtivo);
  const vazio = !c.linhas.length;
  const max = Math.max(1, ...c.linhas.flatMap((l) => [l.disponivel, l.programado]));
  const corAderencia: Cor = ader.pct == null ? "neutro" : ader.pct >= 85 ? "st-bom" : ader.pct >= 60 ? "st-atencao" : "st-critico";

  return (
    <div className="space-y-5">
      <Cartao className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
          <SeletorPeriodo periodo={periodo} aoMudar={setPeriodo} hoje={hoje} rotulo="comparativo" />
          <Seletor rotulo="Área de atuação" name="comparativo-area" vazio="Todas as áreas" value={areaAtiva}
            opcoes={Object.fromEntries(areas.map((a) => [a, a]))} onChange={(e) => setArea(e.target.value)} />
          <Seletor rotulo="Técnico" name="comparativo-tecnico" vazio="Todos os técnicos" value={tecnicoAtivo} opcoes={opcoesTecnico}
            onChange={(e) => setTecnicoId(e.target.value)} />
        </div>
      </Cartao>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="HH disponíveis" valor={formatarHoras(c.disponivel)} icone={Clock} tom="azul"
          dica="Dias úteis × jornada, menos férias, folga e ausências lançadas na Gestão de HH (dia inteiro ou parcial) de cada técnico no período." />
        <Kpi rotulo="HH programadas" valor={formatarHoras(c.programado)} icone={ClipboardList} tom="laranja"
          detalhe={`${formatarNumero(c.programacoes)} programação(ões)`} dica="Soma do tempo das programações do período (minutos ÷ 60)." />
        <Kpi rotulo="Saldo da equipe" valor={formatarHorasSinal(c.saldo)} icone={Scale} tom="verde"
          status={c.saldo < 0 ? { cor: "vermelho", texto: "Negativo" } : undefined}
          dica="HH disponíveis − HH programadas." />
        <Kpi rotulo="Ocupação" valor={formatarPct(c.ocupacao)} icone={Gauge} tom="ciano"
          status={c.ocupacao > 100 ? { cor: "vermelho", texto: "Acima de 100%" } : undefined}
          dica="HH programadas ÷ HH disponíveis." />
      </div>

      {(acima.length > 0 || c.alertas.length > 0) && (
        <section aria-labelledby="comparativo-alertas"
          className="rounded-cartao border border-[color-mix(in_srgb,var(--st-critico)_35%,transparent)] bg-[var(--selo-critico-fundo)] p-4 text-[var(--selo-critico-texto)] sm:p-5">
          <h3 id="comparativo-alertas" className="flex items-center gap-2 font-display text-[15px] font-semibold">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {acima.length ? `${acima.length} técnico(s) com mais horas programadas do que disponíveis` : "Programação com alerta no dia"}
          </h3>
          {acima.length > 0 && (
            <ul className="mt-2 space-y-1 text-[13.5px]">
              {acima.map((s) => (
                <li key={s.tecnicoId} className="break-words">
                  <b className="font-semibold">{s.nome}</b>: {formatarHoras(s.programado)} programadas para {formatarHoras(s.disponivel)} disponíveis
                  {" "}(<span className="num">+{formatarHoras(s.excesso)}</span>, {formatarPct(s.ocupacao)})
                </li>
              ))}
            </ul>
          )}
          {c.alertas.length > 0 && (
            <p className="mt-2 text-[13px]">
              {c.alertas.length} dia(s) de técnico com programação acima da jornada do dia ou em fim de semana, férias ou folga
              (programações concluídas não contam). Veja no Calendário.
            </p>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao className="p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-texto-3" aria-hidden />
            <div className="min-w-0">
              <h3 className="font-display text-[15px] font-medium">Aderência à programação</h3>
              <p className="mt-0.5 text-[12.5px] text-texto-3">Concluídas ÷ programações do período</p>
            </div>
          </div>
          <div className="num mt-4 font-display text-[32px] font-medium leading-none tracking-[-0.03em]">
            {ader.pct == null ? "—" : formatarPct(ader.pct)}
          </div>
          <div className="mt-1.5 text-[12.5px] text-texto-3">
            {ader.total ? `${formatarNumero(ader.concluidas)} de ${formatarNumero(ader.total)} concluída(s) · ${formatarHoras(ader.horasConcluidas)} de ${formatarHoras(ader.horasTotal)}`
              : "Sem programação no período"}
          </div>
          <div className="mt-3"><Medidor valor={ader.pct} status={corAderencia} rotulo="Aderência à programação" /></div>
          {status.length > 0 && (
            <div className="mt-4">
              <Partes partes={status.map((s, i) => ({ nome: s.rotulo, valor: s.quantidade, cor: corStatus(s.status, i) }))} />
            </div>
          )}
        </Cartao>
        <Grafico titulo="HH programado por tipo de ordem" subtitulo="Horas do período, maior primeiro" className="lg:col-span-2"
          tabela={{ colunas: ["Tipo de ordem", "Programações", "HH"], linhas: tipos.map((t) => [t.rotulo, t.quantidade, formatarHoras(t.valor)]) }}>
          {tipos.length ? <Barras itens={tipos.map((t) => ({ rotulo: t.rotulo, valor: t.valor, detalhe: `${t.quantidade} programação(ões)` }))} formato="h" />
            : <p className="py-6 text-center text-[13px] text-texto-3">Sem programação no período.</p>}
        </Grafico>
      </div>

      <Grafico titulo="Disponível x programado por técnico" subtitulo="O tempo informado em minutos é convertido para horas."
        legenda={<Legenda series={[{ nome: "Disponível", cor: "serie-1" }, { nome: "Programado", cor: "serie-2" }, { nome: "Programado acima do disponível", cor: "st-critico" }]} />}
        tabela={{ colunas: ["Técnico", "Disponível", "Programado", "Saldo", "Ocupação"],
          linhas: c.linhas.map((l) => [l.tecnico.nome, formatarHoras(l.disponivel), formatarHoras(l.programado), formatarHorasSinal(l.saldo), formatarPct(l.ocupacao)]) }}>
        {vazio ? (
          <p className="py-6 text-center text-[13px] text-texto-3">
            {filtrado ? "Nenhum técnico corresponde aos filtros selecionados." : "Cadastre técnicos para visualizar o comparativo."}
          </p>
        ) : (
          <ul className="space-y-3">
            {c.linhas.map((l) => {
              const sobre = l.programado > l.disponivel + 1e-9;
              return (
                <li key={l.tecnico.id} className="grid gap-1.5 sm:grid-cols-[180px_1fr] sm:items-center sm:gap-3">
                  <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-texto-2">
                    <span className="truncate" title={l.tecnico.nome}>{l.tecnico.nome}</span>
                    {sobre && <AlertTriangle className="size-3.5 shrink-0 text-[var(--selo-critico-texto)]" aria-label="Sobrecarga" />}
                  </span>
                  <div className="space-y-1">
                    <Trilho valor={l.disponivel} max={max} c="serie-1" rotulo={`Disponível de ${l.tecnico.nome}`} />
                    <Trilho valor={l.programado} max={max} c={sobre ? "st-critico" : "serie-2"} rotulo={`Programado de ${l.tecnico.nome}`} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Grafico>

      {!vazio && (
        <Cartao className="overflow-hidden">
          <div className="hidden md:block">
            <table className="w-full text-left text-[13px]">
              <caption className="sr-only">Comparativo de HH por técnico no período</caption>
              <thead className="bg-superficie-2 text-[12px] text-texto-3">
                <tr>
                  {["Técnico", "NP", "Centro", "Turno", "HH disponíveis", "HH programadas", "Saldo", "Ocupação"].map((h, i) => (
                    <th key={h} scope="col" className={clsx("px-3 py-2 font-medium", i >= 4 && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {c.linhas.map((l) => {
                  const nivel = nivelOcupacao(l.ocupacao, l.programado, l.disponivel);
                  const dias = diasAlerta.get(l.tecnico.id);
                  return (
                    <tr key={l.tecnico.id} className={clsx(nivel === "sobrecarga" && "bg-[color-mix(in_srgb,var(--selo-critico-fundo)_60%,transparent)]")}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <Avatar nome={l.tecnico.nome} foto={l.tecnico.foto} tamanho={36} />
                          <div className="min-w-0">
                            <div className="font-semibold text-texto">{l.tecnico.nome}</div>
                            <SelosLinha nivel={nivel} dias={dias} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-texto-2">{l.tecnico.np || "Não informado"}</td>
                      <td className="px-3 py-2 text-texto-2">{l.tecnico.centro}</td>
                      <td className="px-3 py-2 text-texto-2">{l.tecnico.turno}</td>
                      <td className="num px-3 py-2 text-right font-semibold">{formatarHoras(l.disponivel)}</td>
                      <td className="num px-3 py-2 text-right">{formatarHoras(l.programado)}</td>
                      <td className={clsx("num px-3 py-2 text-right font-medium", l.saldo < 0 ? "text-[var(--selo-critico-texto)]" : "text-[var(--selo-bom-texto)]")}>
                        {formatarHorasSinal(l.saldo)}
                      </td>
                      <td className="num px-3 py-2 text-right">{formatarPct(l.ocupacao)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-borda md:hidden" aria-label="Comparativo de HH por técnico">
            {c.linhas.map((l) => {
              const nivel = nivelOcupacao(l.ocupacao, l.programado, l.disponivel);
              return (
                <li key={l.tecnico.id} className={clsx("p-4", nivel === "sobrecarga" && "bg-[color-mix(in_srgb,var(--selo-critico-fundo)_60%,transparent)]")}>
                  <div className="flex items-center gap-2.5">
                    <Avatar nome={l.tecnico.nome} foto={l.tecnico.foto} tamanho={36} />
                    <div className="min-w-0">
                      <div className="break-words font-semibold text-texto">{l.tecnico.nome}</div>
                      <div className="text-[12px] text-texto-3">NP {l.tecnico.np || "não informado"} · {l.tecnico.centro} · {l.tecnico.turno}</div>
                    </div>
                  </div>
                  <SelosLinha nivel={nivel} dias={diasAlerta.get(l.tecnico.id)} />
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
                    <dt className="text-texto-3">Disponível</dt><dd className="num text-right font-semibold">{formatarHoras(l.disponivel)}</dd>
                    <dt className="text-texto-3">Programado</dt><dd className="num text-right">{formatarHoras(l.programado)}</dd>
                    <dt className="text-texto-3">Saldo</dt>
                    <dd className={clsx("num text-right font-medium", l.saldo < 0 ? "text-[var(--selo-critico-texto)]" : "text-[var(--selo-bom-texto)]")}>{formatarHorasSinal(l.saldo)}</dd>
                    <dt className="text-texto-3">Ocupação</dt><dd className="num text-right">{formatarPct(l.ocupacao)}</dd>
                  </dl>
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}
      {vazio && (
        <Cartao className="p-6 text-center">
          <h3 className="font-display text-[15px] font-medium">{filtrado ? "Nenhum técnico encontrado" : "Nenhum técnico cadastrado"}</h3>
          <p className="mt-1 text-[13px] text-texto-3">
            {filtrado ? "Ajuste os filtros de área ou técnico para visualizar o comparativo." : "Cadastre a equipe para visualizar o comparativo."}
          </p>
        </Cartao>
      )}
    </div>
  );
}

function SelosLinha({ nivel, dias }: { nivel: NivelOcupacao; dias?: { sobrecarga: number; foraDoDia: number } }) {
  const s = SELO_NIVEL[nivel];
  const mostrarNivel = nivel === "sobrecarga" || nivel === "alta";
  if (!mostrarNivel && !dias) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {mostrarNivel && <Selo cor={s.cor}>{s.texto}</Selo>}
      {!!dias?.sobrecarga && <Selo cor="laranja">{dias.sobrecarga} dia(s) acima da jornada</Selo>}
      {!!dias?.foraDoDia && <Selo cor="amarelo">{dias.foraDoDia} dia(s) sem expediente</Selo>}
    </div>
  );
}

function Trilho({ valor, max, c, rotulo }: { valor: number; max: number; c: Cor; rotulo: string }) {
  return (
    <div className="flex items-center gap-2" role="img" aria-label={`${rotulo}: ${formatarHoras(valor)}`}>
      <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-superficie-2">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (valor / max) * 100)}%`, background: cor(c) }} />
      </div>
      <span className="num w-14 shrink-0 text-right text-[12px] font-medium text-texto">{formatarHoras(valor)}</span>
    </div>
  );
}

/** Início e fim do período, com atalhos para a semana e o mês de hoje. Data final antes da inicial não é aplicada. */
export function SeletorPeriodo({ periodo, aoMudar, hoje, rotulo }: { periodo: Periodo; aoMudar: (p: Periodo) => void; hoje: string; rotulo: string }) {
  const [rascunho, setRascunho] = useState<Periodo>(periodo);
  const [erro, setErro] = useState("");
  const [ultimo, setUltimo] = useState(periodo);
  if (ultimo !== periodo) { setUltimo(periodo); setRascunho(periodo); }
  const mudar = (k: keyof Periodo, v: string) => {
    const novo = { ...rascunho, [k]: v };
    setRascunho(novo);
    if (!novo.ini || !novo.fim) return;
    if (novo.ini > novo.fim) { setErro("A data final deve ser igual ou posterior à data inicial."); return; }
    setErro("");
    aoMudar(novo);
  };
  const atalho = (modo: "semana" | "mes") => { setErro(""); aoMudar(periodoDaVisao(modo, hoje)); };
  const idErro = `erro-periodo-${rotulo}`;
  return (
    <fieldset className="min-w-0 sm:col-span-2 lg:col-span-1">
      <legend className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-texto">
        <CalendarRange className="size-4 text-texto-3" aria-hidden />Período
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1 basis-[140px]">
          <span className="sr-only">Início</span>
          <input type="date" value={rascunho.ini} max={rascunho.fim || undefined} onChange={(e) => mudar("ini", e.target.value)}
            aria-label="Início do período" aria-invalid={erro ? true : undefined} aria-describedby={erro ? idErro : undefined}
            className="h-11 w-full rounded-xl border border-borda-forte bg-superficie px-3 text-[15px] focus:border-[var(--acao)]" />
        </label>
        <span className="text-[13px] text-texto-3" aria-hidden>a</span>
        <label className="min-w-0 flex-1 basis-[140px]">
          <span className="sr-only">Fim</span>
          <input type="date" value={rascunho.fim} min={rascunho.ini || undefined} onChange={(e) => mudar("fim", e.target.value)}
            aria-label="Fim do período" aria-invalid={erro ? true : undefined} aria-describedby={erro ? idErro : undefined}
            className="h-11 w-full rounded-xl border border-borda-forte bg-superficie px-3 text-[15px] focus:border-[var(--acao)]" />
        </label>
        <div className="flex gap-1">
          <button type="button" onClick={() => atalho("semana")}
            className="h-11 rounded-xl px-3 text-[13px] font-medium text-texto-2 transition hover:bg-superficie-2 hover:text-texto">Esta semana</button>
          <button type="button" onClick={() => atalho("mes")}
            className="h-11 rounded-xl px-3 text-[13px] font-medium text-texto-2 transition hover:bg-superficie-2 hover:text-texto">Este mês</button>
        </div>
      </div>
      {erro && <p id={idErro} role="alert" className="mt-1 text-[12px] font-medium text-[var(--selo-critico-texto)]">{erro}</p>}
    </fieldset>
  );
}
