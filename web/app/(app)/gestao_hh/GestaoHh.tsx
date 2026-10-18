"use client";

import clsx from "clsx";
import { Download, Lock, Save, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Mensagem } from "@/components/Campos";
import { CampoBusca, MultiEscolha } from "@/components/Filtros";
import { cor, type Cor } from "@/components/graficos";
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "@/components/ui";
import { casaBusca, normalizarBusca } from "@/lib/dados/texto";
import { dataBr, partes } from "@/lib/wcm/util";

import { GradeTiles, Quadro, Tile } from "../execucao/_ui/Blocos";
import { horas, int, num } from "../execucao/_ui/fmt";
import { baixarCsv, type Coluna } from "../execucao/_ui/Tabela";
import { removerAusencias, salvarDisponibilidade, type EdicaoPessoa } from "./acoes";
import { FormAusencia } from "./FormAusencia";

export interface PessoaLinha {
  np: string; nome: string; cargo: string; especialidade: string; centro: string; area: string; turma: string;
  jornada: number; disponivel: number; conta: boolean; obs: string; diasAusente: number;
  horasBrutas: number; horasAusente: number; horasDisp: number;
}
export interface AusenciaLinha {
  np: string; id: string; tipo: string; de: number; ate: number; obs: string; titulo: string; horas: number | null; entidade: string;
  validade: number | null;
}

/** Cores dos tipos de ausência (identidade: no máximo 4; o resto em "Outros"). */
const COR_TIPO: [string, Cor][] = [["Férias", "serie-1"], ["Afastamento (atestado / INSS)", "serie-2"], ["Treinamento", "serie-3"]];
const OUTROS = "Outros (folga, licença, cedido…)";
const corTipo = (t: string): Cor => COR_TIPO.find(([n]) => n === t)?.[1] ?? "serie-4";
const grupoTipo = (t: string) => (COR_TIPO.some(([n]) => n === t) ? t : OUTROS);

export function GestaoHh({ visao, pessoas, ausencias, hoje, ini, fim, edita, horasSemana, tipos }: {
  visao: string; pessoas: PessoaLinha[]; ausencias: AusenciaLinha[]; hoje: number; ini: number; fim: number; edita: boolean;
  horasSemana: number; tipos: string[];
}) {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const opcoes = useMemo(() => Object.fromEntries((["centro", "turma", "especialidade"] as const).map((k) => {
    const m = new Map<string, number>();
    for (const p of pessoas) if (p[k]) m.set(p[k], (m.get(p[k]) ?? 0) + 1);
    return [k, [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([valor, n]) => ({ valor, n }))];
  })), [pessoas]);
  const indice = useMemo(() => pessoas.map((p) => normalizarBusca(`${p.np} ${p.nome} ${p.cargo} ${p.centro}`)), [pessoas]);
  const vis = useMemo(() => pessoas.filter((p, i) => (!busca || casaBusca(indice[i], busca))
    && (["centro", "turma", "especialidade"] as const).every((k) => !sel[k]?.length || sel[k].includes(p[k]))), [pessoas, indice, busca, sel]);
  const filtrado = !!(busca.trim() || Object.values(sel).some((v) => v.length));

  const cap = vis.filter((p) => p.conta);
  const brutas = cap.reduce((s, p) => s + p.horasBrutas, 0), livres = cap.reduce((s, p) => s + p.horasDisp, 0);
  const npsVis = new Set(vis.map((p) => p.np));
  const ausentesHoje = new Set(ausencias.filter((a) => a.de <= hoje && a.ate >= hoje && npsVis.has(a.np)).map((a) => a.np)).size;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar nome, matrícula, cargo, centro…" />
        <div className="flex flex-wrap gap-2">
          {([["centro", "Centro de trabalho"], ["turma", "Turma"], ["especialidade", "Especialidade"]] as const).map(([k, r]) => (
            <MultiEscolha key={k} rotulo={r} opcoes={opcoes[k]} valor={sel[k] ?? []} aoMudar={(v) => setSel((s) => ({ ...s, [k]: v }))} />
          ))}
        </div>
      </div>
      <GradeTiles colunas={5}>
        <Tile rotulo="Pessoas" valor={int(vis.length)} detalhe={`${int(cap.length)} contam na capacidade`}
          dica="Pessoas da equipe da Gestão de HH no recorte. Apoio/gestão e planejamento não contam na capacidade, a menos que alguém marque." />
        <Tile rotulo="HH da jornada" valor={horas(brutas)} detalhe={`${int(fim - ini + 1)} dias corridos`}
          dica="Jornada semanal × dias do período ÷ 7, de quem conta na capacidade." />
        <Tile rotulo="Ausências" valor={horas(cap.reduce((s, p) => s + p.horasAusente, 0))}
          detalhe={`${int(cap.reduce((s, p) => s + p.diasAusente, 0))} dia(s)`}
          dica="Cada dia corrido de ausência no período tira jornada ÷ 7 (ausências sobrepostas não contam em dobro)." />
        <Tile rotulo="HH disponíveis" valor={horas(livres)} detalhe={brutas ? `${num((livres / brutas) * 100, 0)}% da jornada` : undefined}
          dica="(Jornada − ausências) × % disponível para manutenção. É a base da utilização da mão de obra, da capacidade do backlog e da programação semanal." />
        <Tile rotulo="Ausentes hoje" valor={int(ausentesHoje)} dica="Pessoas do recorte com ausência cadastrada que cobre hoje." />
      </GradeTiles>
      {!edita && (
        <p className="inline-flex items-center gap-1.5 text-[12.5px] text-texto-3"><Lock className="size-3.5" />Seu perfil é de consulta — só editores e administradores alteram a disponibilidade.</p>
      )}
      {visao === "Pessoas" && <Pessoas vis={vis} edita={edita} horasSemana={horasSemana} />}
      {visao === "Ausências" && <Ausencias pessoas={pessoas} npsVis={filtrado ? npsVis : null} ausencias={ausencias} hoje={hoje} edita={edita} tipos={tipos} />}
      {visao === "Calendário" && <Calendario pessoas={vis} ausencias={ausencias} ini={ini} fim={fim} />}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Pessoas: edição de jornada, % disponível, capacidade e observação
// ----------------------------------------------------------------------------
type Edicao = { jornada: string; disponivel: string; conta: boolean; obs: string };
const COLS_PES: Coluna[] = [
  { id: "np", rotulo: "Nº pessoal" }, { id: "nome", rotulo: "Nome" }, { id: "cargo", rotulo: "Cargo" }, { id: "especialidade", rotulo: "Especialidade" },
  { id: "centro", rotulo: "Centro de trabalho" }, { id: "area", rotulo: "Área" }, { id: "turma", rotulo: "Turma" },
  { id: "jornada", rotulo: "Jornada (h/sem)", tipo: "num", casas: 1 }, { id: "disponivel", rotulo: "Disponível %", tipo: "num" },
  { id: "conta", rotulo: "Conta na capacidade" }, { id: "obs", rotulo: "Observação" }, { id: "diasAusente", rotulo: "Dias ausente no período", tipo: "num" },
  { id: "horasBrutas", rotulo: "Horas da jornada", tipo: "num", casas: 1 }, { id: "horasAusente", rotulo: "Horas ausente", tipo: "num", casas: 1 },
  { id: "horasDisp", rotulo: "HH disponíveis no período", tipo: "num", casas: 1 },
];

function Pessoas({ vis, edita, horasSemana }: { vis: PessoaLinha[]; edita: boolean; horasSemana: number }) {
  const router = useRouter();
  const [ed, setEd] = useState<Record<string, Edicao>>({});
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();
  const orden = useMemo(() => [...vis].sort((a, b) => a.centro.localeCompare(b.centro) || a.nome.localeCompare(b.nome)), [vis]);
  const original = (p: PessoaLinha): Edicao => ({ jornada: String(p.jornada), disponivel: String(p.disponivel), conta: p.conta, obs: p.obs });
  const valor = (p: PessoaLinha) => ed[p.np] ?? original(p);
  const mudou = (p: PessoaLinha) => {
    const e = ed[p.np];
    if (!e) return false;
    const o = original(p);
    return Number(e.jornada) !== Number(o.jornada) || Number(e.disponivel) !== Number(o.disponivel) || e.conta !== o.conta || e.obs.trim() !== o.obs.trim();
  };
  const mudados = vis.filter(mudou);
  const mudar = (p: PessoaLinha, k: keyof Edicao, v: string | boolean) => setEd((s) => ({ ...s, [p.np]: { ...valor(p), [k]: v } }));
  const maxDisp = Math.max(1, ...orden.map((p) => p.horasDisp));

  function salvar() {
    const itens: EdicaoPessoa[] = mudados.map((p) => {
      const e = ed[p.np];
      const n = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
      return { np: p.np, jornada: n(e.jornada), disponivel: n(e.disponivel), conta: e.conta, obs: e.obs };
    });
    iniciar(async () => {
      const r = await salvarDisponibilidade(itens);
      if (r.ok) { setEd({}); setMsg({ tipo: "ok", texto: r.msg }); router.refresh(); } else setMsg({ tipo: "erro", texto: r.erro });
    });
  }

  return (
    <Quadro titulo="Pessoas" subtitulo={`Jornada padrão: ${num(horasSemana, 1)} h/semana (Metas e parâmetros). A tabela mostra o período do topo; jornada e % valem para todos os períodos.`}
      acoes={
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => baixarCsv("gerenciador_hh", COLS_PES, orden.map((p) => ({ ...p, conta: p.conta ? "Sim" : "Não" })))}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-borda bg-superficie px-2.5 text-[12.5px] text-texto-2 hover:text-texto">
            <Download className="size-3.5" /> Baixar CSV
          </button>
          {edita && mudados.length > 0 && (
            <button onClick={() => setEd({})} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-borda bg-superficie px-2.5 text-[12.5px] text-texto-2 hover:text-texto">
              <Undo2 className="size-3.5" /> Desfazer
            </button>
          )}
          {edita && (
            <button onClick={salvar} disabled={!mudados.length || salvando} className={clsx(BOTAO_PRIMARIO, "!h-8 !rounded-lg !px-3 !text-[13px]")}>
              <Save className="size-3.5" /> {salvando ? "Salvando…" : `Salvar (${mudados.length})`}
            </button>
          )}
        </div>
      }>
      {msg && <div className="mb-3"><Mensagem tipo={msg.tipo}>{msg.texto}</Mensagem></div>}
      {edita && <p className="mb-3 text-[12.5px] text-texto-3">Altere <b className="font-medium text-texto-2">Jornada</b>, <b className="font-medium text-texto-2">Disponível %</b>, <b className="font-medium text-texto-2">Conta na capacidade</b> e <b className="font-medium text-texto-2">Observação</b> direto na tabela e clique em Salvar. Disponível % = parte da jornada para manutenção (ex.: 80% se 20% vai para reuniões e treinamentos).</p>}
      <div className="max-h-[560px] overflow-auto rounded-lg border border-borda">
        <table className="w-full min-w-[1080px] whitespace-nowrap text-left text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-superficie-2 text-[11.5px] text-texto-3">
            <tr>
              {["Nº pessoal", "Nome", "Cargo", "Centro de trabalho", "Turma", "Jornada (h/sem)", "Disponível %", "Conta na capacidade", "Observação", "Dias ausente", "HH disponíveis no período"]
                .map((h, i) => <th key={h} className={clsx("px-3 py-2 font-medium", i >= 5 && i <= 6 && "text-right", i >= 9 && "text-right")}>{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {orden.map((p) => {
              const v = valor(p), alterada = mudou(p);
              const ent = "h-8 rounded-lg border border-borda bg-superficie-2 px-2 text-[12.5px] outline-none focus:border-marca-500 disabled:border-transparent disabled:bg-transparent";
              return (
                <tr key={p.np} className={alterada ? "bg-marca-500/6" : undefined}>
                  <td className="num px-3 py-1.5 font-mono text-[12px]">{p.np}</td>
                  <td className="px-3 py-1.5 font-medium">{p.nome}</td>
                  <td className="max-w-[180px] truncate px-3 py-1.5 text-texto-2" title={p.cargo}>{p.cargo}</td>
                  <td className="num px-3 py-1.5 font-mono text-[12px]">{p.centro}</td>
                  <td className="px-3 py-1.5">{p.turma}</td>
                  <td className="px-3 py-1.5 text-right">
                    <input aria-label={`Jornada de ${p.nome}`} disabled={!edita} type="number" min={0} max={80} step={0.5} value={v.jornada}
                      onChange={(e) => mudar(p, "jornada", e.target.value)} className={clsx(ent, "num w-20 text-right")} />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <input aria-label={`Disponível de ${p.nome}`} disabled={!edita} type="number" min={0} max={100} step={5} value={v.disponivel}
                      onChange={(e) => mudar(p, "disponivel", e.target.value)} className={clsx(ent, "num w-16 text-right")} />
                  </td>
                  <td className="px-3 py-1.5">
                    <input aria-label={`${p.nome} conta na capacidade`} disabled={!edita} type="checkbox" checked={v.conta}
                      onChange={(e) => mudar(p, "conta", e.target.checked)} className="size-4 accent-[var(--color-marca-500)]" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input aria-label={`Observação de ${p.nome}`} disabled={!edita} value={v.obs} maxLength={500}
                      onChange={(e) => mudar(p, "obs", e.target.value)} className={clsx(ent, "w-44")} placeholder={edita ? "—" : ""} />
                  </td>
                  <td className="num px-3 py-1.5 text-right tabular-nums">{p.diasAusente ? int(p.diasAusente) : ""}</td>
                  <td className="px-3 py-1.5">
                    <span className="flex items-center justify-end gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-superficie-3">
                        <span className="block h-full rounded-full" style={{ width: `${(p.horasDisp / maxDisp) * 100}%`, background: cor(p.conta ? "serie-1" : "neutro") }} />
                      </span>
                      <span className="num w-14 text-right tabular-nums">{num(p.horasDisp, 1)} h</span>
                    </span>
                  </td>
                </tr>
              );
            })}
            {!orden.length && <tr><td colSpan={11} className="px-3 py-6 text-center text-texto-3">Ninguém no recorte.</td></tr>}
          </tbody>
        </table>
      </div>
    </Quadro>
  );
}

// ----------------------------------------------------------------------------
// Ausências: cadastrar, listar, remover
// ----------------------------------------------------------------------------
const situacao = (a: AusenciaLinha, hoje: number) => (a.de <= hoje && hoje <= a.ate ? "Em andamento" : a.de > hoje ? "Futura" : "Encerrada");
const COLS_AUS: Coluna[] = [
  { id: "nome", rotulo: "Nome" }, { id: "np", rotulo: "Nº pessoal" }, { id: "centro", rotulo: "Centro de trabalho" }, { id: "tipo", rotulo: "Tipo" },
  { id: "de", rotulo: "De", tipo: "data" }, { id: "ate", rotulo: "Até", tipo: "data" }, { id: "dias", rotulo: "Dias", tipo: "num" },
  { id: "situacao", rotulo: "Situação" }, { id: "titulo", rotulo: "Treinamento" }, { id: "horas", rotulo: "Carga horária (h)", tipo: "num", casas: 1 },
  { id: "entidade", rotulo: "Entidade" }, { id: "validade", rotulo: "Validade", tipo: "data" }, { id: "obs", rotulo: "Obs" },
];

export function Ausencias({ pessoas, npsVis, ausencias, hoje, edita, tipos, tipoInicial, tituloForm, sugestoes, nomeCsv = "ausencias_equipe" }: {
  pessoas: Pick<PessoaLinha, "np" | "nome" | "centro">[]; npsVis: Set<string> | null; ausencias: AusenciaLinha[]; hoje: number; edita: boolean;
  tipos: string[]; tipoInicial?: string; tituloForm?: string; sugestoes?: string[]; nomeCsv?: string }) {
  const router = useRouter();
  const [passadas, setPassadas] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const porNp = new Map(pessoas.map((p) => [p.np, p]));
  const linhas = ausencias.filter((a) => (!npsVis || npsVis.has(a.np)) && (passadas || a.ate >= hoje))
    .map((a) => ({ ...a, nome: porNp.get(a.np)?.nome ?? "(fora da equipe da Gestão de HH)", centro: porNp.get(a.np)?.centro ?? "",
      dias: a.ate - a.de + 1, situacao: situacao(a, hoje), chave: `${a.np}\u0000${a.id}` }))
    .sort((x, y) => x.de - y.de || x.nome.localeCompare(y.nome));

  const responder = (r: Awaited<ReturnType<typeof removerAusencias>>, depois?: () => void) => {
    if (r.ok) { setMsg({ tipo: "ok", texto: r.msg }); depois?.(); router.refresh(); } else setMsg({ tipo: "erro", texto: r.erro });
  };
  const remover = () => {
    const sel = linhas.filter((l) => marcadas.has(l.chave)).map((l) => ({ np: l.np, id: l.id }));
    if (!sel.length || !confirm(`Remover ${sel.length} ausência(s)?`)) return;
    iniciar(async () => responder(await removerAusencias(sel), () => setMarcadas(new Set())));
  };
  return (
    <div className="space-y-4">
      {msg && <Mensagem tipo={msg.tipo}>{msg.texto}</Mensagem>}
      {edita && <FormAusencia pessoas={pessoas} tipos={tipos} hoje={hoje} tipoInicial={tipoInicial} titulo={tituloForm} sugestoes={sugestoes} />}
      <Quadro titulo="Ausências cadastradas" subtitulo={`${int(linhas.length)} ausência(s)${passadas ? "" : " em andamento ou futuras"}${npsVis ? " · só das pessoas do recorte" : ""}`}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-borda bg-superficie-2 px-2.5 text-[12.5px] text-texto-2">
              <input type="checkbox" checked={passadas} onChange={(e) => setPassadas(e.target.checked)} className="size-3.5 accent-[var(--color-marca-500)]" />
              Mostrar também as encerradas
            </label>
            {linhas.length > 0 && (
              <button onClick={() => baixarCsv(nomeCsv, COLS_AUS, linhas.map((l) => ({ ...l, horas: l.horas ?? "", validade: l.validade ?? "" })))}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-borda bg-superficie px-2.5 text-[12.5px] text-texto-2 hover:text-texto">
                <Download className="size-3.5" /> Baixar CSV
              </button>
            )}
            {edita && (
              <button onClick={remover} disabled={!marcadas.size || ocupado}
                className={clsx(BOTAO_SECUNDARIO, "!h-8 !rounded-lg !px-2.5 !text-[12.5px] disabled:opacity-50")}>
                <Trash2 className="size-3.5" /> Remover selecionadas ({marcadas.size})
              </button>
            )}
          </div>
        }>
        {!linhas.length ? (
          <p className="rounded-lg border border-dashed border-borda px-4 py-6 text-center text-[13px] text-texto-3">
            Nenhuma ausência cadastrada{passadas ? "" : " em andamento ou futura"}.
          </p>
        ) : (
          <div className="max-h-[460px] overflow-auto rounded-lg border border-borda">
            <table className="w-full min-w-[820px] whitespace-nowrap text-left text-[12.5px]">
              <thead className="sticky top-0 bg-superficie-2 text-[11.5px] text-texto-3">
                <tr>{edita && <th className="w-8 px-3 py-2" />}{["Nome", "Nº pessoal", "Centro", "Tipo", "De", "Até", "Dias", "Situação", "Obs"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {linhas.map((l) => (
                  <tr key={l.chave} className={marcadas.has(l.chave) ? "bg-superficie-2" : undefined}>
                    {edita && (
                      <td className="px-3 py-1.5">
                        <input type="checkbox" aria-label={`Selecionar ausência de ${l.nome}`} checked={marcadas.has(l.chave)} className="size-4 accent-[var(--color-marca-500)]"
                          onChange={(e) => setMarcadas((s) => { const n = new Set(s); if (e.target.checked) n.add(l.chave); else n.delete(l.chave); return n; })} />
                      </td>
                    )}
                    <td className="px-3 py-1.5 font-medium">{l.nome}</td>
                    <td className="num px-3 py-1.5 font-mono text-[12px]">{l.np}</td>
                    <td className="num px-3 py-1.5 font-mono text-[12px]">{l.centro}</td>
                    <td className="px-3 py-1.5"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: cor(corTipo(l.tipo)) }} />{l.tipo}{l.titulo ? ` · ${l.titulo}` : ""}{l.horas != null ? ` (${num(l.horas, 1)} h)` : ""}</span></td>
                    <td className="num px-3 py-1.5 tabular-nums">{dataBr(l.de)}</td>
                    <td className="num px-3 py-1.5 tabular-nums">{dataBr(l.ate)}</td>
                    <td className="num px-3 py-1.5 tabular-nums">{l.dias}</td>
                    <td className="px-3 py-1.5 text-texto-2">{l.situacao}</td>
                    <td className="max-w-[220px] truncate px-3 py-1.5 text-texto-2" title={l.obs}>{l.obs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Quadro>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Calendário: pessoa × dia (ou semana, em períodos longos), cor pelo tipo
// ----------------------------------------------------------------------------
function Calendario({ pessoas, ausencias, ini, fim }: { pessoas: PessoaLinha[]; ausencias: AusenciaLinha[]; ini: number; fim: number }) {
  const porSemana = fim - ini + 1 > 62;
  const colunas = useMemo(() => {
    const out: { de: number; ate: number; rot: string; fds: boolean }[] = [];
    if (!porSemana) for (let d = ini; d <= fim; d++) { const p = partes(d); out.push({ de: d, ate: d, rot: String(p.dia), fds: p.semana === 0 || p.semana === 6 }); }
    else for (let d = ini - ((partes(ini).semana + 6) % 7); d <= fim; d += 7) out.push({ de: Math.max(d, ini), ate: Math.min(d + 6, fim), rot: dataBr(Math.max(d, ini)).slice(0, 5), fds: false });
    return out;
  }, [ini, fim, porSemana]);
  const nps = new Set(pessoas.map((p) => p.np));
  const nome = new Map(pessoas.map((p) => [p.np, p.nome]));
  const aus = ausencias.filter((a) => nps.has(a.np) && a.ate >= ini && a.de <= fim);
  const linhas = [...new Set(aus.map((a) => a.np))].sort((a, b) => (nome.get(a) ?? a).localeCompare(nome.get(b) ?? b));
  if (!linhas.length) return <p className="rounded-cartao border border-borda bg-superficie px-5 py-6 text-[13.5px] text-texto-3">Ninguém do recorte tem ausência no período.</p>;
  const celula = (np: string, c: { de: number; ate: number }) => {
    const cont = new Map<string, number>();
    for (const a of aus) if (a.np === np) {
      const n = Math.min(a.ate, c.ate) - Math.max(a.de, c.de) + 1;
      if (n > 0) cont.set(a.tipo, (cont.get(a.tipo) ?? 0) + n);
    }
    if (!cont.size) return null;
    const [tipo, dias] = [...cont.entries()].sort((x, y) => y[1] - x[1])[0];
    return { tipo, dias: Math.min([...cont.values()].reduce((s, v) => s + v, 0), c.ate - c.de + 1) };
  };
  const tiposUsados = [...new Set(aus.map((a) => grupoTipo(a.tipo)))];
  const largura = porSemana ? 44 : 26;
  const tabela = linhas.map((np) => [nome.get(np) ?? np, ...colunas.map((c) => celula(np, c))]);
  return (
    <Quadro titulo={`Ausências por ${porSemana ? "semana" : "dia"}`} subtitulo={`${int(linhas.length)} pessoa(s) com ausência no período${porSemana ? " · período longo: cada coluna é uma semana (cor do tipo com mais dias)" : " · sábados e domingos em cinza claro"}`}
      acoes={
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-texto-2">
          {[...COR_TIPO.map(([n]) => n), OUTROS].filter((t) => tiposUsados.includes(t)).map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: cor(corTipo(t === OUTROS ? "" : t)) }} />{t}</span>
          ))}
        </div>
      }>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[2px] text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[150px] bg-superficie pr-2 text-left font-medium text-texto-3">Pessoa</th>
              {colunas.map((c) => <th key={c.de} className="font-normal text-texto-3" style={{ minWidth: largura }}>{c.rot}</th>)}
            </tr>
          </thead>
          <tbody>
            {tabela.map(([n, ...cs], i) => (
              <tr key={linhas[i]}>
                <td className="sticky left-0 z-10 max-w-[180px] truncate bg-superficie pr-2 text-[12px] text-texto-2" title={n as string}>{n as string}</td>
                {(cs as ReturnType<typeof celula>[]).map((x, j) => (
                  <td key={j} title={x ? `${n} · ${porSemana ? `semana de ${dataBr(colunas[j].de)}` : dataBr(colunas[j].de)} · ${x.tipo}${porSemana ? ` (${x.dias} dia(s))` : ""}` : undefined}
                    className="h-6 rounded-[4px]" style={{ background: x ? cor(corTipo(x.tipo)) : colunas[j].fds ? "var(--superficie-3)" : "var(--superficie-2)" }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Quadro>
  );
}

