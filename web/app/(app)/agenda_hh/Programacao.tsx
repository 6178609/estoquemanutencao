"use client";

import clsx from "clsx";
import { CalendarCheck, CheckCheck, ClipboardPlus, Copy, Download, FileSpreadsheet, History, Layers, Pencil, RefreshCw, RotateCcw, Search, Timer, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Campo, Mensagem, Seletor } from "@/components/Campos";
import { CampoBusca } from "@/components/Filtros";
import { Gaveta } from "@/components/Gaveta";
import { BOTAO_COMPACTO, BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Kpi, Selo } from "@/components/ui";
import { baixarModelo, exportarProgramacoes, lerPlanilha } from "@/lib/agendaHh/excel";
import * as R from "@/lib/agendaHh/regras";

import { buscarOrdem, excluirProgramacoes, importarPlanilha, mudarStatus, salvarProgramacao } from "./acoes";
import { CONTROLE, Filtro } from "./comum";

export const COR_STATUS: Record<R.Status, "verde" | "amarelo" | "azul"> = { programada: "azul", reprogramada: "amarelo", concluida: "verde" };
const PAGINA = 200;
type Aviso = { tipo: "ok" | "erro"; texto: string; lista?: string[] } | null;
const FILTROS_VAZIOS = { busca: "", status: "", tecnicoId: "", area: "", de: "", ate: "" };

export function Programacao({ tecnicos, programacoes, hoje, edita, equipamentos }: { tecnicos: R.Tecnico[]; programacoes: R.Programacao[];
  hoje: string; edita: boolean; equipamentos: string[] }) {
  const router = useRouter();
  const [f, setF] = useState(FILTROS_VAZIOS);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<Aviso>(null);
  const [limite, setLimite] = useState(PAGINA);
  const [novoStatus, setNovoStatus] = useState<R.Status>("concluida");
  const [form, setForm] = useState<{ aberto: boolean; base?: R.Programacao; duplicar?: boolean; n: number }>({ aberto: false, n: 0 });
  const [ocupado, iniciar] = useTransition();

  const vis = useMemo(() => R.buscarProgramacoes(programacoes, f), [programacoes, f]);
  const resumo = R.resumoProgramacao(programacoes);
  const areas = useMemo(() => R.distintos(programacoes, (p) => p.area), [programacoes]);
  const selVis = vis.filter((p) => sel.has(p.id));
  const filtrado = Object.values(f).some(Boolean);

  const filtrar = (k: keyof typeof FILTROS_VAZIOS, v: string) => { setF({ ...f, [k]: v }); setSel(new Set()); setLimite(PAGINA); };
  const terminar = (r: { ok: true; msg: string } | { ok: false; erro: string; avisos?: string[] }) => {
    setAviso(r.ok ? { tipo: "ok", texto: r.msg } : { tipo: "erro", texto: r.erro, lista: r.avisos });
    if (r.ok) { setSel(new Set()); router.refresh(); }
  };

  function excluirSelecionadas() {
    if (!selVis.length) return;
    const previa = selVis.slice(0, 8).map((p) => `• Ordem ${p.ordem} — ${p.equipamento}`).join("\n");
    const mais = selVis.length > 8 ? `\n• E mais ${selVis.length - 8} linha(s)` : "";
    if (!window.confirm(`Excluir ${selVis.length} ${selVis.length === 1 ? "programação selecionada" : "programações selecionadas"}?\n\n${previa}${mais}\n\nEssa ação não pode ser desfeita.`)) return;
    iniciar(async () => terminar(await excluirProgramacoes(selVis.map((p) => p.id))));
  }
  function aplicarStatus() {
    if (!selVis.length) return;
    iniciar(async () => terminar(await mudarStatus(selVis.map((p) => p.id), novoStatus)));
  }
  async function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    try {
      const objetos = R.objetosDaPlanilha(await lerPlanilha(arq));
      const { itens, erros } = R.prepararImportacao(objetos, tecnicos);
      if (erros.length) {
        setAviso({ tipo: "erro", texto: "Corrija a planilha antes de importar:", lista: [...erros.slice(0, 12), ...(erros.length > 12 ? [`E mais ${erros.length - 12} erro(s).`] : [])] });
        return;
      }
      if (!window.confirm(`Importar ${itens.length} programação(ões) desta planilha?`)) return;
      iniciar(async () => terminar(await importarPlanilha(objetos)));
    } catch (err) {
      setAviso({ tipo: "erro", texto: `Não foi possível ler a planilha: ${(err as Error).message || "arquivo inválido"}.` });
    }
  }

  const todosMarcados = vis.length > 0 && selVis.length === vis.length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {edita && <button type="button" className={BOTAO_PRIMARIO} onClick={() => setForm({ aberto: true, n: form.n + 1 })}><ClipboardPlus className="size-4" aria-hidden />Novo input manual</button>}
        {edita && <button type="button" className={BOTAO_SECUNDARIO} onClick={baixarModelo}><Download className="size-4" aria-hidden />Baixar modelo Excel</button>}
        {edita && (
          <label className={clsx(BOTAO_SECUNDARIO, "cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-[var(--foco)]")}>
            <Upload className="size-4" aria-hidden />Importar Excel
            <input type="file" className="sr-only" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importar} disabled={ocupado} />
          </label>
        )}
        <button type="button" className={BOTAO_SECUNDARIO} disabled={!vis.length} onClick={() => exportarProgramacoes(vis, tecnicos, `programacao_hh_${hoje}`)}>
          <FileSpreadsheet className="size-4" aria-hidden />Exportar Excel{filtrado ? " (filtrado)" : ""}
        </button>
      </div>
      {aviso && (
        <Mensagem tipo={aviso.tipo}>
          {aviso.texto}
          {aviso.lista?.length ? <ul className="mt-1 list-disc pl-5 font-normal">{aviso.lista.map((l) => <li key={l}>{l}</li>)}</ul> : null}
        </Mensagem>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="Total de registros" valor={String(resumo.total)} icone={Layers} tom="azul" />
        <Kpi rotulo="Programadas" valor={String(resumo.programadas)} icone={CalendarCheck} tom="ciano" />
        <Kpi rotulo="Reprogramadas" valor={String(resumo.reprogramadas)} icone={RefreshCw} tom="amarelo" />
        <Kpi rotulo="Concluídas" valor={String(resumo.concluidas)} icone={CheckCheck} tom="verde" />
        <Kpi rotulo="Tempo total" valor={R.formatarMinutos(resumo.minutos)} icone={Timer} tom="laranja" />
      </div>

      <div className="space-y-3 rounded-cartao border border-borda bg-superficie p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div className="min-w-0 sm:col-span-2">
            <span className="mb-1 block text-[12.5px] font-semibold text-texto-2">Buscar na programação</span>
            <CampoBusca valor={f.busca} aoMudar={(v) => filtrar("busca", v)} placeholder="Equipamento, ordem ou técnico" />
          </div>
          <Filtro rotulo="Status">
            <select className={CONTROLE} value={f.status} onChange={(e) => filtrar("status", e.target.value)}>
              <option value="">Todos</option>
              {R.STATUS.map((s) => <option key={s} value={s}>{R.ROTULO_STATUS[s]}</option>)}
            </select>
          </Filtro>
          <Filtro rotulo="Técnico">
            <select className={CONTROLE} value={f.tecnicoId} onChange={(e) => filtrar("tecnicoId", e.target.value)}>
              <option value="">Todos os técnicos</option>
              {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </Filtro>
          <Filtro rotulo="Área de atuação">
            <select className={CONTROLE} value={f.area} onChange={(e) => filtrar("area", e.target.value)}>
              <option value="">Todas as áreas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Filtro>
          <button type="button" className={clsx(BOTAO_SECUNDARIO, "disabled:opacity-50")} disabled={!filtrado} onClick={() => { setF(FILTROS_VAZIOS); setSel(new Set()); }}>
            <RotateCcw className="size-4" aria-hidden />Limpar
          </button>
          <Filtro rotulo="Data de"><input type="date" className={CONTROLE} value={f.de} onChange={(e) => filtrar("de", e.target.value)} /></Filtro>
          <Filtro rotulo="Data até"><input type="date" className={CONTROLE} value={f.ate} onChange={(e) => filtrar("ate", e.target.value)} /></Filtro>
        </div>
      </div>

      {edita && (
        <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
          <span aria-live="polite" className="mr-auto text-texto-2">
            {selVis.length ? `${selVis.length} ${selVis.length === 1 ? "linha selecionada" : "linhas selecionadas"}` : "Selecione as linhas para mudar o status ou excluir."}
          </span>
          <label className="flex items-center gap-2">
            <span className="text-texto-2">Mudar status para</span>
            <select className={clsx(CONTROLE, "w-40")} value={novoStatus} onChange={(e) => setNovoStatus(e.target.value as R.Status)}>
              {R.STATUS.map((s) => <option key={s} value={s}>{R.ROTULO_STATUS[s]}</option>)}
            </select>
          </label>
          <button type="button" className={BOTAO_COMPACTO} disabled={!selVis.length || ocupado} onClick={aplicarStatus}>Aplicar</button>
          <button type="button" className={clsx(BOTAO_PERIGO, "h-9 px-3 text-[13px]")} disabled={!selVis.length || ocupado} onClick={excluirSelecionadas}>
            Excluir selecionadas ({selVis.length})
          </button>
        </div>
      )}

      {vis.length ? (
        <div className="overflow-x-auto rounded-cartao border border-borda">
          <table className="w-full min-w-[1100px] text-left text-[13px]">
            <caption className="sr-only">Programação de serviços</caption>
            <thead className="bg-superficie-2 text-[12px] uppercase tracking-wide text-texto-3">
              <tr>
                {edita && (
                  <th scope="col" className="w-10 px-3 py-2">
                    <input type="checkbox" aria-label="Selecionar todas as linhas exibidas" checked={todosMarcados}
                      ref={(el) => { if (el) el.indeterminate = selVis.length > 0 && !todosMarcados; }}
                      onChange={(e) => setSel(e.target.checked ? new Set(vis.map((p) => p.id)) : new Set())} className="size-4" />
                  </th>
                )}
                {["Data", "Turno", "Equipamento", "Tipo", "Ordem", "Descrição", "Área", "Status", "Tempo", "NP", "Técnico"].map((c) => (
                  <th key={c} scope="col" className="px-3 py-2 font-semibold">{c}</th>
                ))}
                {edita && <th scope="col" className="px-3 py-2"><span className="sr-only">Ações</span></th>}
              </tr>
            </thead>
            <tbody>
              {vis.slice(0, limite).map((p) => (
                <tr key={p.id} className={clsx("border-t border-borda align-top", sel.has(p.id) && "bg-marca-50")}>
                  {edita && (
                    <td className="px-3 py-2">
                      <input type="checkbox" className="size-4" checked={sel.has(p.id)} aria-label={`Selecionar ordem ${p.ordem} da máquina ${p.equipamento}`}
                        onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                    </td>
                  )}
                  <td className="whitespace-nowrap px-3 py-2">{R.formatarData(p.data)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{p.turno || "Sem turno"}</td>
                  <td className="px-3 py-2 font-medium">{p.equipamento}</td>
                  <td className="px-3 py-2">{p.tipoOrdem}</td>
                  <td className="px-3 py-2">{p.ordem}</td>
                  <td className="max-w-[260px] px-3 py-2" title={p.descricao}><span className="line-clamp-2">{p.descricao}</span></td>
                  <td className="px-3 py-2">{p.area}</td>
                  <td className="px-3 py-2">
                    <Selo cor={COR_STATUS[p.status]}>{R.ROTULO_STATUS[p.status]}</Selo>
                    {p.historico.length > 0 && (
                      <span className="mt-1 flex items-center gap-1 text-[11.5px] text-texto-3" title={p.historico.map((h) => `${R.formatarData(h.de)} → ${R.formatarData(h.para)}`).join("\n")}>
                        <History className="size-3" aria-hidden />{p.historico.length} reprog.
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{R.formatarMinutos(p.minutos)}</td>
                  <td className="px-3 py-2">{p.np || "Não informado"}</td>
                  <td className="px-3 py-2">{p.tecnicoNome}</td>
                  {edita && (
                    <td className="whitespace-nowrap px-2 py-1">
                      <button type="button" className="inline-grid size-11 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto"
                        aria-label={`Editar ordem ${p.ordem}`} title="Editar" onClick={() => setForm({ aberto: true, base: p, n: form.n + 1 })}><Pencil className="size-4" aria-hidden /></button>
                      <button type="button" className="inline-grid size-11 place-items-center rounded-lg text-texto-3 hover:bg-superficie-2 hover:text-texto"
                        aria-label={`Duplicar ordem ${p.ordem}`} title="Duplicar lançamento" onClick={() => setForm({ aberto: true, base: p, duplicar: true, n: form.n + 1 })}><Copy className="size-4" aria-hidden /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-cartao border border-dashed border-borda px-5 py-10 text-center">
          <p className="font-display text-[17px] font-medium">{programacoes.length ? "Nenhuma programação para os filtros" : "Nenhuma programação cadastrada"}</p>
          <p className="mt-1 text-[13.5px] text-texto-3">{programacoes.length ? "Ajuste os filtros para ver outras ordens." : "Use “Novo input manual” ou importe a planilha para adicionar a primeira ordem."}</p>
        </div>
      )}
      {vis.length > limite && (
        <button type="button" className={BOTAO_SECUNDARIO} onClick={() => setLimite(limite + PAGINA)}>Mostrar mais ({vis.length - limite} restantes)</button>
      )}

      <FormProgramacao key={form.n} aberto={form.aberto} base={form.base} duplicar={!!form.duplicar} tecnicos={tecnicos} hoje={hoje}
        areas={R.distintos([...tecnicos.map((t) => t.area), ...areas].map((a) => ({ a })), (x) => x.a)} equipamentos={equipamentos}
        aoFechar={() => setForm({ ...form, aberto: false })}
        aoSalvar={(msg) => { setForm({ ...form, aberto: false }); setAviso({ tipo: "ok", texto: msg }); router.refresh(); }} />
    </div>
  );
}

type Rascunho = { equipamento: string; tipoOrdem: string; ordem: string; descricao: string; area: string; data: string; turno: string;
  status: R.Status; minutos: string; tecnicoId: string };

/** Formulário de programação (novo, editar ou duplicar). Exportado para o Calendário abrir a edição. */
export function FormProgramacao({ aberto, base, duplicar, tecnicos, hoje, areas, equipamentos, aoFechar, aoSalvar }: {
  aberto: boolean; base?: R.Programacao; duplicar: boolean; tecnicos: R.Tecnico[]; hoje: string; areas: string[]; equipamentos: string[];
  aoFechar: () => void; aoSalvar: (msg: string) => void;
}) {
  const editando = !!base && !duplicar;
  const [d, setD] = useState<Rascunho>(() => ({ equipamento: base?.equipamento ?? "", tipoOrdem: base?.tipoOrdem ?? "", ordem: base?.ordem ?? "",
    descricao: base?.descricao ?? "", area: base?.area ?? "", data: editando ? base!.data : hoje, turno: base?.turno ?? "",
    status: editando ? base!.status : "programada", minutos: base ? String(base.minutos) : "", tecnicoId: base?.tecnicoId ?? "" }));
  const [erros, setErros] = useState<R.Erros>({});
  const [erro, setErro] = useState("");
  const [infoOrdem, setInfoOrdem] = useState("");
  const [ocupado, iniciar] = useTransition();
  const [buscando, iniciarBusca] = useTransition();
  const semTurno = editando && !base!.turno;
  const mudar = (k: keyof Rascunho) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  const reprogramando = editando && d.data !== base!.data;

  function preencherDaOrdem(sobrescrever: boolean) {
    if (!R.chaveOrdem(d.ordem)) { setInfoOrdem("Digite o número da ordem."); return; }
    iniciarBusca(async () => {
      const r = await buscarOrdem(d.ordem);
      if (!r.ok) { setInfoOrdem(r.erro); return; }
      setD((x) => ({ ...x, ...Object.fromEntries(Object.entries(r.campos).filter(([k, v]) => v && (sobrescrever || !x[k as keyof Rascunho]))) }));
      setInfoOrdem("Dados da ordem trazidos da IW38.");
    });
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const entrada = { ...d };
    const v = R.validarProgramacao(entrada, tecnicos, { semTurnoPermitido: semTurno });
    if (!v.ok) { setErros(v.erros); setErro("Confira os campos destacados."); return; }
    setErros({});
    iniciar(async () => {
      const r = await salvarProgramacao(entrada, editando ? base!.id : undefined);
      if (r.ok) aoSalvar(r.msg);
      else { setErros(r.erros ?? {}); setErro(r.erro); }
    });
  }
  function excluir() {
    if (!editando || !window.confirm(`Excluir a programação da ordem ${base!.ordem}?`)) return;
    iniciar(async () => {
      const r = await excluirProgramacoes([base!.id]);
      if (r.ok) aoSalvar("Programação excluída."); else setErro(r.erro);
    });
  }

  const titulo = editando ? "Editar programação" : duplicar ? "Duplicar programação" : "Novo input";
  return (
    <Gaveta aberta={aberto} aoFechar={aoFechar} titulo={titulo} subtitulo="Programação">
      <form onSubmit={salvar} noValidate className="space-y-4" aria-label={titulo}>
        <div>
          <div className="flex items-end gap-2">
            <Campo className="flex-1" rotulo="Ordem *" name="ordem" value={d.ordem} onChange={mudar("ordem")} maxLength={30} erro={erros.ordem} inputMode="numeric"
              onBlur={() => { if (d.ordem && !d.equipamento && !d.descricao) preencherDaOrdem(false); }} />
            <button type="button" className={clsx(BOTAO_SECUNDARIO, erros.ordem && "mb-5")} onClick={() => preencherDaOrdem(true)} disabled={buscando}>
              <Search className="size-4" aria-hidden />{buscando ? "Buscando…" : "Buscar na IW38"}
            </button>
          </div>
          {infoOrdem && <p role="status" className="mt-1 text-[12.5px] text-texto-3">{infoOrdem}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Equipamento *" name="equipamento" list="agenda-equipamentos" value={d.equipamento} onChange={mudar("equipamento")} maxLength={80}
            erro={erros.equipamento} dica={equipamentos.length ? "Digite para buscar na lista de equipamentos." : undefined} />
          <Campo rotulo="Tipo de ordem *" name="tipoOrdem" value={d.tipoOrdem} onChange={mudar("tipoOrdem")} maxLength={40} erro={erros.tipoOrdem} placeholder="Ex.: Preventiva" />
          <Campo rotulo="Área de atuação *" name="area" list="agenda-areas" value={d.area} onChange={mudar("area")} maxLength={60} erro={erros.area} />
          <Seletor rotulo="Técnico responsável *" name="tecnicoId" vazio="Selecione" erro={erros.tecnicoId} value={d.tecnicoId}
            opcoes={Object.fromEntries(tecnicos.map((t) => [t.id, `${t.np || "Sem NP"} — ${t.nome}`]))}
            onChange={(e) => {
              const t = tecnicos.find((x) => x.id === e.target.value);
              setD({ ...d, tecnicoId: e.target.value, area: d.area.trim() ? d.area : t?.area ?? "" });
            }} />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold">Descrição *</span>
          <textarea name="descricao" rows={3} maxLength={300} value={d.descricao} onChange={mudar("descricao")} aria-invalid={erros.descricao ? true : undefined}
            aria-describedby={erros.descricao ? "erro-agenda-descricao" : undefined}
            className={clsx("w-full rounded-xl border bg-superficie px-3 py-2 text-[15px] focus:border-[var(--acao)]", erros.descricao ? "border-[var(--selo-critico-texto)]" : "border-borda-forte")} />
          {erros.descricao && <span id="erro-agenda-descricao" className="mt-1 block text-[12px] font-medium text-[var(--selo-critico-texto)]">{erros.descricao}</span>}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Data programada *" name="data" type="date" value={d.data} onChange={mudar("data")} erro={erros.data}
            dica={reprogramando ? `Reprogramação: a data anterior (${R.formatarData(base!.data)}) fica no histórico.` : undefined} />
          <Seletor rotulo={semTurno ? "Turno da programação" : "Turno da programação *"} name="turno" vazio="Selecione o turno" value={d.turno} onChange={mudar("turno")}
            opcoes={Object.fromEntries(R.TURNOS_PROGRAMACAO.map((t) => [t, t]))} erro={erros.turno}
            dica={semTurno ? "Registro anterior: você pode manter sem turno." : undefined} />
          <Seletor rotulo="Status *" name="status" value={d.status} onChange={mudar("status")} erro={erros.status}
            opcoes={Object.fromEntries(R.STATUS.map((s) => [s, R.ROTULO_STATUS[s]]))} />
          <Campo rotulo="Tempo (minutos) *" name="minutos" type="number" min={1} max={R.MAX_MINUTOS} step={1} value={d.minutos} onChange={mudar("minutos")} erro={erros.minutos} />
        </div>
        <datalist id="agenda-equipamentos">{equipamentos.map((e) => <option key={e} value={e} />)}</datalist>
        <datalist id="agenda-areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
        {editando && base!.historico.length > 0 && (
          <div className="rounded-xl border border-borda bg-superficie-2 p-3 text-[13px]">
            <div className="mb-1 flex items-center gap-1.5 font-semibold"><History className="size-4" aria-hidden />Histórico de reprogramações</div>
            <ol className="space-y-0.5 text-texto-2">
              {base!.historico.map((h, i) => (
                <li key={i}>{R.formatarData(h.de)} → {R.formatarData(h.para)}{h.por ? ` · ${h.por}` : ""}{h.em ? ` · ${new Date(h.em).toLocaleDateString("pt-BR")}` : ""}</li>
              ))}
            </ol>
          </div>
        )}
        {erro && <Mensagem>{erro}</Mensagem>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {editando ? <button type="button" className={BOTAO_PERIGO} onClick={excluir} disabled={ocupado}>Excluir</button> : <span />}
          <div className="flex gap-2">
            <button type="button" className={BOTAO_SECUNDARIO} onClick={aoFechar}>Cancelar</button>
            <button type="submit" className={BOTAO_PRIMARIO} disabled={ocupado}>{ocupado ? "Salvando…" : "Salvar programação"}</button>
          </div>
        </div>
      </form>
    </Gaveta>
  );
}
