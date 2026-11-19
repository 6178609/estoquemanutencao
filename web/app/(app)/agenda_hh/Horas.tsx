"use client";

import clsx from "clsx";
import { CalendarOff, Clock3, Info, Pencil, RotateCcw, TrendingUp, UserPlus, Users, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Campo, Mensagem, Seletor } from "@/components/Campos";
import { CampoBusca, Segmentos } from "@/components/Filtros";
import { Gaveta } from "@/components/Gaveta";
import { Barras, Grafico } from "@/components/graficos";
import { BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Kpi, Selo } from "@/components/ui";
import * as R from "@/lib/agendaHh/regras";

import { excluirTecnico, salvarTecnico, trazerDaEquipe } from "./acoes";
import { Avatar, CONTROLE, Filtro, reduzirImagem } from "./comum";

type Modo = R.ModoPeriodo;
const MODOS: { valor: Modo; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia" }, { valor: "semana", rotulo: "Semana" }, { valor: "mes", rotulo: "Mês" }, { valor: "personalizado", rotulo: "Período" },
];
const ROTULO_MODO: Record<Modo, string> = { dia: "Visão diária", semana: "Visão semanal", mes: "Visão mensal", personalizado: "Período personalizado" };
const COR_SITUACAO: Record<R.SituacaoTecnico, "verde" | "amarelo" | "azul" | "vermelho"> = {
  disponivel: "verde", ferias: "amarelo", folga: "amarelo", ausencia: "azul", indisponivel: "vermelho",
};

export function Horas({ tecnicos, hoje, edita }: { tecnicos: R.Tecnico[]; hoje: string; edita: boolean }) {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("semana");
  const [referencia, setReferencia] = useState(hoje);
  const [pers, setPers] = useState<R.Periodo>(() => R.periodoDaVisao("semana", hoje));
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [f, setF] = useState<Required<R.FiltrosTecnicos>>({ centro: "", turno: "", area: "", busca: "", ordem: "maior" });
  const [form, setForm] = useState<{ aberto: boolean; tecnico?: R.Tecnico }>({ aberto: false });
  const [trazendo, iniciar] = useTransition();

  const periodo = modo === "personalizado" ? pers : R.periodoDaVisao(modo, referencia);
  const vis = useMemo(() => R.tecnicosVisiveis(tecnicos, periodo, f), [tecnicos, periodo, f]);
  const resumo = R.resumoHoras(vis, periodo);
  const opcoes = useMemo(() => ({ centro: R.distintos(tecnicos, (t) => t.centro), turno: R.distintos(tecnicos, (t) => t.turno),
    area: R.distintos(tecnicos, (t) => t.area) }), [tecnicos]);
  const filtrado = !!(f.centro || f.turno || f.area || f.busca);

  const mudarModo = (m: Modo) => {
    if (m === "personalizado" && modo !== "personalizado") setPers(periodo);
    setModo(m);
  };
  const mudarPers = (campo: "ini" | "fim", v: string) => {
    const novo = { ...pers, [campo]: v };
    if (!R.isoValida(novo.ini) || !R.isoValida(novo.fim)) return;
    if (novo.ini > novo.fim) { setAviso({ tipo: "erro", texto: "A data final deve ser igual ou posterior à data inicial." }); return; }
    setAviso(null);
    setPers(novo);
  };
  const trazer = () => {
    if (!window.confirm("Trazer da equipe da Gestão de HH as pessoas que ainda não estão cadastradas aqui (pelo NP)?")) return;
    iniciar(async () => {
      const r = await trazerDaEquipe();
      setAviso(r.ok ? { tipo: "ok", texto: r.msg } : { tipo: "erro", texto: r.erro });
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {edita && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BOTAO_PRIMARIO} onClick={() => setForm({ aberto: true })}><UserPlus className="size-4" aria-hidden />Cadastrar técnico</button>
          <button type="button" className={BOTAO_SECUNDARIO} onClick={trazer} disabled={trazendo}>
            <UsersRound className="size-4" aria-hidden />{trazendo ? "Trazendo…" : "Trazer da equipe da Gestão de HH"}
          </button>
        </div>
      )}
      {aviso && <Mensagem tipo={aviso.tipo}>{aviso.texto}</Mensagem>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="HH disponíveis" valor={R.formatarHoras(resumo.total)} icone={Clock3} tom="verde"
          detalhe={`${R.formatarDataCurta(periodo.ini)} a ${R.formatarDataCurta(periodo.fim)}`} />
        <Kpi rotulo="Técnicos exibidos" valor={String(resumo.exibidos)} icone={Users} tom="azul"
          detalhe={`${tecnicos.length} ${tecnicos.length === 1 ? "cadastrado" : "cadastrados"}`} />
        <Kpi rotulo="Ausências no período" valor={String(resumo.ausencias)} icone={CalendarOff} tom="amarelo" detalhe="Férias, folgas ou ausências com impacto" />
        <Kpi rotulo="Média por técnico" valor={R.formatarHoras(resumo.media)} icone={TrendingUp} tom="ciano" detalhe="Após desconto das ausências" />
      </div>

      <div className="space-y-3 rounded-cartao border border-borda bg-superficie p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0">
            <span className="mb-1 block text-[12.5px] font-semibold text-texto-2">Visão da disponibilidade</span>
            <Segmentos opcoes={MODOS} valor={modo} aoMudar={mudarModo} />
          </div>
          {modo === "personalizado" ? (
            <div className="grid grid-cols-2 gap-2">
              <Filtro rotulo="Início"><input type="date" className={CONTROLE} value={pers.ini} onChange={(e) => mudarPers("ini", e.target.value)} /></Filtro>
              <Filtro rotulo="Fim"><input type="date" className={CONTROLE} value={pers.fim} onChange={(e) => mudarPers("fim", e.target.value)} /></Filtro>
            </div>
          ) : (
            <Filtro rotulo="Data de referência" className="w-44">
              <input type="date" className={CONTROLE} value={referencia} onChange={(e) => R.isoValida(e.target.value) && setReferencia(e.target.value)} />
            </Filtro>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.4fr)_auto] lg:items-end">
          {([["centro", "Centro", "Todos os centros"], ["turno", "Turno", "Todos os turnos"], ["area", "Área de atuação", "Todas as áreas"]] as const).map(([k, r, todos]) => (
            <Filtro key={k} rotulo={r}>
              <select className={CONTROLE} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
                <option value="">{todos}</option>
                {opcoes[k].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Filtro>
          ))}
          <div className="min-w-0">
            <span className="mb-1 block text-[12.5px] font-semibold text-texto-2">Buscar técnico</span>
            <CampoBusca valor={f.busca} aoMudar={(v) => setF({ ...f, busca: v })} placeholder="Digite um nome" />
          </div>
          <button type="button" onClick={() => setF({ centro: "", turno: "", area: "", busca: "", ordem: "maior" })} disabled={!filtrado}
            className={clsx(BOTAO_SECUNDARIO, "disabled:opacity-50")}><RotateCcw className="size-4" aria-hidden />Limpar</button>
        </div>
        <p className="flex items-start gap-2 text-[13px] text-texto-3">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span><b className="text-texto-2">Cálculo:</b> dias úteis do período × jornada diária − férias − folga cadastrada − ausências lançadas na Gestão de HH (cada dia conta uma vez só).</span>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Grafico titulo="Horas por centro de trabalho" subtitulo={`Soma da disponibilidade dos técnicos de cada centro · ${ROTULO_MODO[modo]}`}
          tabela={{ colunas: ["Centro", "HH"], linhas: R.horasPorCentro(vis, periodo).map((i) => [i.rotulo, R.formatarHoras(i.valor)]) }}>
          {vis.length ? <Barras itens={R.horasPorCentro(vis, periodo)} formato="h" />
            : <p className="py-6 text-center text-[13px] text-texto-3">Nenhum centro de trabalho para os filtros selecionados.</p>}
        </Grafico>
        <Grafico titulo="Horas por técnico" subtitulo="Comparativo individual após o desconto das ausências"
          tabela={{ colunas: ["Técnico", "HH"], linhas: R.horasPorTecnico(vis, periodo).map((i) => [i.rotulo, R.formatarHoras(i.valor)]) }}>
          {vis.length ? <Barras itens={R.horasPorTecnico(vis, periodo)} formato="h" larguraRotulo={200} />
            : <p className="py-6 text-center text-[13px] text-texto-3">Cadastre técnicos para ver o comparativo individual.</p>}
        </Grafico>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-display text-[18px] font-medium">Capacidade por técnico</h3>
        <Filtro rotulo="Ordenar" className="w-56">
          <select className={CONTROLE} value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value as R.FiltrosTecnicos["ordem"] & string })}>
            <option value="maior">Maior disponibilidade</option>
            <option value="menor">Menor disponibilidade</option>
            <option value="nome">Nome (A–Z)</option>
          </select>
        </Filtro>
      </div>

      {vis.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {vis.map((t) => <CartaoTecnico key={t.id} t={t} periodo={periodo} edita={edita} aoEditar={() => setForm({ aberto: true, tecnico: t })} />)}
        </ul>
      ) : (
        <div className="rounded-cartao border border-dashed border-borda px-5 py-10 text-center">
          <p className="font-display text-[17px] font-medium">{tecnicos.length ? "Nenhum técnico encontrado" : "Cadastre o primeiro técnico"}</p>
          <p className="mt-1 text-[13.5px] text-texto-3">{tecnicos.length && filtrado ? "Ajuste ou limpe os filtros para ver a equipe."
            : "Adicione os dados da equipe para calcular a disponibilidade de HH."}</p>
        </div>
      )}

      <FormTecnico chave={form.tecnico?.id ?? (form.aberto ? "novo" : "")} aberto={form.aberto} tecnico={form.tecnico}
        aoFechar={() => setForm({ aberto: false })} aoSalvar={(msg) => { setForm({ aberto: false }); setAviso({ tipo: "ok", texto: msg }); router.refresh(); }} />
    </div>
  );
}

function CartaoTecnico({ t, periodo, edita, aoEditar }: { t: R.Tecnico; periodo: R.Periodo; edita: boolean; aoEditar: () => void }) {
  const c = R.disponibilidade(t, periodo);
  const pct = c.teorico ? Math.round((c.disponivel / c.teorico) * 100) : 0;
  const s = R.situacao(c);
  const ferias = t.feriasInicio && t.feriasFim ? `${R.formatarData(t.feriasInicio)} a ${R.formatarData(t.feriasFim)}` : "Não programadas";
  return (
    <li className="flex flex-col gap-4 rounded-cartao border border-borda bg-superficie p-4">
      <div className="flex items-start gap-3">
        <Avatar nome={t.nome} foto={t.foto} />
        <div className="min-w-0 flex-1">
          <h4 className="truncate font-display text-[15.5px] font-medium" title={t.nome}>{t.nome}</h4>
          <p className="text-[12.5px] leading-snug text-texto-3">NP {t.np || "Não informado"} • {t.centro} • {t.turno} • {t.area || "Não informado"}</p>
        </div>
        {edita && (
          <button type="button" onClick={aoEditar} aria-label={`Editar ${t.nome}`} title="Editar cadastro"
            className="grid size-11 shrink-0 place-items-center rounded-xl text-texto-3 hover:bg-superficie-2 hover:text-texto">
            <Pencil className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[12.5px] text-texto-3">Disponível no período</div>
          <div className="num font-display text-[26px] font-medium leading-none">{R.formatarHoras(c.disponivel)}</div>
        </div>
        <Selo cor={COR_SITUACAO[s]}>{R.ROTULO_SITUACAO[s]}</Selo>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-superficie-3" role="img" aria-label={`${pct}% da capacidade teórica disponível`}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct < 100 ? "var(--st-atencao)" : "var(--st-bom)" }} />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-[12.5px]">
        <div><dt className="text-texto-3">Jornada</dt><dd className="font-medium">{R.formatarHoras(t.jornada)}/dia</dd></div>
        <div className="min-w-0"><dt className="text-texto-3">Férias previstas</dt><dd className="truncate font-medium" title={ferias}>{ferias}</dd></div>
        <div><dt className="text-texto-3">Folga</dt><dd className="font-medium">{t.folga ? R.formatarData(t.folga) : "Não cadastrada"}</dd></div>
      </dl>
      {c.horasOutras > 0 && (
        <p className="text-[12.5px] text-texto-3">Gestão de HH: −{R.formatarHoras(c.horasOutras)} de ausências ({(t.ausenciasHh ?? [])
          .filter((a) => a.ate >= periodo.ini && a.de <= periodo.fim).map((a) => a.tipo).filter((x, i, l) => l.indexOf(x) === i).join(", ")})</p>
      )}
    </li>
  );
}

type Rascunho = { nome: string; np: string; centro: string; area: string; turno: string; jornada: string; feriasInicio: string; feriasFim: string; folga: string; foto: string };
const vazio = (t?: R.Tecnico): Rascunho => ({ nome: t?.nome ?? "", np: t?.np ?? "", centro: t?.centro ?? "", area: t?.area ?? "", turno: t?.turno ?? "",
  jornada: t ? String(t.jornada) : "8", feriasInicio: t?.feriasInicio ?? "", feriasFim: t?.feriasFim ?? "", folga: t?.folga ?? "", foto: t?.foto ?? "" });

function FormTecnico({ chave, ...p }: { chave: string; aberto: boolean; tecnico?: R.Tecnico; aoFechar: () => void; aoSalvar: (msg: string) => void }) {
  // remonta a cada técnico aberto (o rascunho começa dos dados dele)
  return <FormTecnicoInterno key={chave} {...p} />;
}

function FormTecnicoInterno({ aberto, tecnico, aoFechar, aoSalvar }: { aberto: boolean; tecnico?: R.Tecnico; aoFechar: () => void; aoSalvar: (msg: string) => void }) {
  const [d, setD] = useState<Rascunho>(() => vazio(tecnico));
  const [erros, setErros] = useState<R.Erros>({});
  const [erro, setErro] = useState("");
  const [ocupado, iniciar] = useTransition();
  const mudar = (k: keyof Rascunho) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD({ ...d, [k]: e.target.value });

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    if (!/^image\/(jpeg|png|webp)$/.test(arq.type)) { setErro("Selecione uma imagem JPG, PNG ou WebP."); return; }
    if (arq.size > 8 * 1024 * 1024) { setErro("A imagem deve ter no máximo 8 MB."); return; }
    try {
      const url = await reduzirImagem(arq);
      if (url.length > R.LIMITE_FOTO) throw new Error();
      setErro("");
      setD((x) => ({ ...x, foto: url }));
    } catch {
      setErro("Não foi possível processar essa imagem. Escolha uma foto menor.");
    }
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const v = R.validarTecnico(d);
    if (!v.ok) { setErros(v.erros); setErro("Confira os campos destacados."); return; }
    setErros({});
    iniciar(async () => {
      const r = await salvarTecnico(d, tecnico?.id);
      if (r.ok) aoSalvar(r.msg);
      else { setErros(r.erros ?? {}); setErro(r.erro); }
    });
  }
  function excluir() {
    if (!tecnico || !window.confirm(`Excluir o cadastro de ${tecnico.nome}? Esta ação não pode ser desfeita.`)) return;
    iniciar(async () => {
      const r = await excluirTecnico(tecnico.id);
      if (r.ok) aoSalvar(r.msg); else setErro(r.erro);
    });
  }

  return (
    <Gaveta aberta={aberto} aoFechar={aoFechar} titulo={tecnico ? "Editar técnico" : "Cadastrar técnico"} subtitulo="Equipe PCM">
      <form onSubmit={salvar} noValidate className="space-y-4" aria-label={tecnico ? "Editar técnico" : "Cadastrar técnico"}>
        <div className="flex items-center gap-4">
          <Avatar nome={d.nome} foto={d.foto} tamanho={72} />
          <div className="space-y-1">
            <label className={clsx(BOTAO_SECUNDARIO, "cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-[var(--foco)]")}>
              Escolher foto
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={escolherFoto} />
            </label>
            {d.foto && <button type="button" className="block text-[12.5px] text-texto-3 underline" onClick={() => setD({ ...d, foto: "" })}>Remover foto</button>}
            <p className="text-[12px] text-texto-3">JPG, PNG ou WebP. A imagem é reduzida automaticamente.</p>
          </div>
        </div>
        <Campo rotulo="Nome completo *" name="nome" value={d.nome} onChange={mudar("nome")} maxLength={80} erro={erros.nome} placeholder="Ex.: Nome Sobrenome" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="NP — Número pessoal *" name="np" inputMode="numeric" value={d.np} onChange={mudar("np")} maxLength={20} erro={erros.np} />
          <Campo rotulo="Centro de trabalho *" name="centro" list="agenda-centros" value={d.centro} onChange={mudar("centro")} maxLength={40} erro={erros.centro} />
          <Seletor rotulo="Turno *" name="turno" vazio="Selecione" opcoes={Object.fromEntries(R.TURNOS_TECNICO.map((t) => [t, t]))}
            value={d.turno} onChange={mudar("turno")} erro={erros.turno} />
          <Campo rotulo="Área de atuação *" name="area" value={d.area} onChange={mudar("area")} maxLength={60} erro={erros.area} placeholder="Ex.: Mecânica" />
          <Campo rotulo="Jornada diária (horas) *" name="jornada" type="number" min={1} max={24} step={0.5} value={d.jornada} onChange={mudar("jornada")} erro={erros.jornada} />
          <Campo rotulo="Data de folga" name="folga" type="date" value={d.folga} onChange={mudar("folga")} erro={erros.folga}
            dica="A jornada dessa data é descontada da disponibilidade." />
        </div>
        <datalist id="agenda-centros">{R.CENTROS_SUGERIDOS.map((c) => <option key={c} value={c} />)}</datalist>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-[13px] font-semibold">Férias previstas <span className="font-normal text-texto-3">(opcional)</span></legend>
          <Campo rotulo="Início" name="feriasInicio" type="date" value={d.feriasInicio} onChange={mudar("feriasInicio")} />
          <Campo rotulo="Fim" name="feriasFim" type="date" value={d.feriasFim} onChange={mudar("feriasFim")} erro={erros.feriasFim} />
        </fieldset>
        {erros.foto && <Mensagem>{erros.foto}</Mensagem>}
        {erro && <Mensagem>{erro}</Mensagem>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {tecnico ? <button type="button" className={BOTAO_PERIGO} onClick={excluir} disabled={ocupado}>Excluir</button> : <span />}
          <div className="flex gap-2">
            <button type="button" className={BOTAO_SECUNDARIO} onClick={aoFechar}>Cancelar</button>
            <button type="submit" className={BOTAO_PRIMARIO} disabled={ocupado}>{ocupado ? "Salvando…" : "Salvar técnico"}</button>
          </div>
        </div>
      </form>
    </Gaveta>
  );
}
