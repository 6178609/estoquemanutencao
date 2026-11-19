"use client";

import { CalendarRange, Clock3, ClipboardList, ImageDown, Printer, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BOTAO_SECUNDARIO, Cartao, Selo, Titulo } from "@/components/ui";
import { MultiEscolha } from "@/components/Filtros";
import { Campo, Mensagem, Seletor } from "@/components/Campos";
import {
  chavePessoa, deIso, distintos, filtrarCobertura, formatarData, formatarMinutos, iniciais, isoValida, motivoDoDia,
  periodoDaVisao, pessoasCobertura, tecnicoDaProgramacao, type MotivoDia, type PessoaCobertura,
  type Programacao, type Tecnico,
} from "@/lib/agendaHh/regras";

import { Avatar } from "./comum";

/**
 * Folha de cobertura (antiga "Folha de rosto da programação" do Controle de HH | PCM): as ordens programadas para as
 * pessoas, a área e o período escolhidos, agrupadas por dia, com o total por pessoa e aviso de férias/folga/ausência.
 * Sai na impressão (só a folha, A4 paisagem) e como imagem PNG desenhada num canvas (para mandar aos técnicos).
 */

const DIA_SEMANA = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });
const diaSemana = (iso: string) => { const d = deIso(iso); return d ? DIA_SEMANA.format(d) : ""; };
const somaMinutos = (lista: Programacao[]) => lista.reduce((s, p) => s + (Number(p.minutos) || 0), 0);
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

/** Motivos que geram aviso na folha (fim de semana não: pode ser serviço programado de propósito). */
const MOTIVOS_AVISO: MotivoDia[] = ["férias", "folga", "ausência"];

interface Linha { p: Programacao; tecnico: Tecnico | null; nome: string; aviso: MotivoDia | null }
interface Dia { data: string; linhas: Linha[]; minutos: number; avisos: { nome: string; motivo: MotivoDia }[] }
interface TotalPessoa { chave: string; nome: string; np: string; foto: string; ordens: number; minutos: number }

export function Cobertura({ tecnicos, programacoes, hoje }: { tecnicos: Tecnico[]; programacoes: Programacao[]; hoje: string }) {
  const semana = useMemo(() => periodoDaVisao("semana", hoje), [hoje]);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [area, setArea] = useState("");
  const [ini, setIni] = useState(semana.ini);
  const [fim, setFim] = useState(semana.fim);
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);

  const pessoas = useMemo(() => pessoasCobertura(tecnicos, programacoes), [tecnicos, programacoes]);
  const porChave = useMemo(() => new Map(pessoas.map((p) => [p.chave, p])), [pessoas]);
  // pessoa que sumiu do cadastro e da programação sai da seleção
  const selecionadas = useMemo(() => escolhidas.filter((k) => porChave.has(k)), [escolhidas, porChave]);
  const pessoasSel = selecionadas.map((k) => porChave.get(k)).filter((p): p is PessoaCobertura => !!p);
  const areas = useMemo(() => distintos(programacoes, (p) => p.area), [programacoes]);
  const areaValida = area && areas.includes(area) ? area : "";

  const periodoOk = isoValida(ini) && isoValida(fim) && ini <= fim;

  const itens = useMemo(() => periodoOk ? filtrarCobertura(programacoes, tecnicos, { periodo: { ini, fim }, pessoas: selecionadas, area: areaValida }) : [],
    [programacoes, tecnicos, ini, fim, periodoOk, areaValida, selecionadas]);

  const { dias, totais, minutos } = useMemo(() => {
    const dias = new Map<string, Dia>();
    const totais = new Map<string, TotalPessoa>();
    for (const p of itens) {
      const tecnico = tecnicoDaProgramacao(p, tecnicos);
      const nome = tecnico?.nome || p.tecnicoNome || "Não atribuído";
      const motivo = tecnico ? motivoDoDia(tecnico, p.data, tecnico.ausenciasHh ?? []) : null;
      const aviso = motivo && MOTIVOS_AVISO.includes(motivo) ? motivo : null;
      const dia = dias.get(p.data) ?? dias.set(p.data, { data: p.data, linhas: [], minutos: 0, avisos: [] }).get(p.data)!;
      dia.linhas.push({ p, tecnico, nome, aviso });
      dia.minutos += Number(p.minutos) || 0;
      if (aviso && !dia.avisos.some((a) => a.nome === nome)) dia.avisos.push({ nome, motivo: aviso });
      const k = chavePessoa(p, tecnicos);
      const t = totais.get(k) ?? totais.set(k, { chave: k, nome, np: tecnico?.np || p.np || "", foto: tecnico?.foto || "", ordens: 0, minutos: 0 }).get(k)!;
      t.ordens++;
      t.minutos += Number(p.minutos) || 0;
    }
    return { dias: [...dias.values()], totais: [...totais.values()].sort((a, b) => b.minutos - a.minutos || a.nome.localeCompare(b.nome, "pt-BR")),
      minutos: somaMinutos(itens) };
  }, [itens, tecnicos]);

  const rotuloPessoas = pessoasSel.length ? pessoasSel.map((p) => p.nome).join(", ") : "Todas as pessoas";
  const linhaSelecao = [
    `Período: ${formatarData(ini)} a ${formatarData(fim)}`,
    `Pessoa: ${rotuloPessoas}`,
    `Área: ${areaValida || "Todas as áreas"}`,
  ].join("  •  ");
  const totalAvisos = dias.reduce((s, d) => s + d.avisos.length, 0);

  // impressão: só a folha (a classe no <html> esconde o resto do site; sai depois de imprimir)
  useEffect(() => {
    const limpar = () => document.documentElement.classList.remove("imprimir-cobertura");
    window.addEventListener("afterprint", limpar);
    return () => { window.removeEventListener("afterprint", limpar); limpar(); };
  }, []);
  const imprimir = () => {
    document.documentElement.classList.add("imprimir-cobertura");
    window.print();
  };

  async function exportarImagem() {
    if (!itens.length || gerando) return;
    setGerando(true);
    setMsg(null);
    try {
      const blob = await desenharFolha({ dias, totais, linhaSelecao, ordens: itens.length, minutos });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `folha-de-cobertura-${ini}-a-${fim}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMsg({ tipo: "ok", texto: "Imagem PNG baixada com a programação filtrada." });
    } catch (e) {
      setMsg({ tipo: "erro", texto: e instanceof Error && e.message ? e.message : "Não foi possível baixar a imagem." });
    } finally {
      setGerando(false);
    }
  }

  const vazioTitulo = !programacoes.length ? "Nenhuma atividade cadastrada" : "Nenhuma atividade para os filtros";
  const vazioTexto = !periodoOk ? "Confira as datas: o fim do período deve ser igual ou posterior ao início."
    : !programacoes.length ? "Cadastre as atividades na Programação para montar esta folha."
      : "Altere a pessoa, a área ou o período para consultar outras atividades.";

  return (
    <section aria-labelledby="titulo-cobertura" className="space-y-5">
      <style>{"@media print{@page{size:A4 landscape;margin:8mm}"
        // esconde tudo o que não é a folha nem um ancestral dela (só enquanto imprime pela folha)
        + "html.imprimir-cobertura body *:not(:has(.folha-cobertura)):not(.folha-cobertura):not(.folha-cobertura *){display:none!important}"
        + "html.imprimir-cobertura main,html.imprimir-cobertura main *:has(.folha-cobertura){padding:0!important;margin:0!important;max-width:none!important}"
        + ".folha-cobertura{border:0!important;box-shadow:none!important;padding:0!important;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}"
        + ".folha-cobertura tr,.folha-cobertura .fc-cab-dia,.folha-cobertura .fc-bloco-topo{break-inside:avoid}"
        + ".folha-cobertura thead{display:table-header-group}}"}</style>

      <div className="nao-imprimir flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-acao">Divulgação aos técnicos</p>
          <Titulo nivel={2} titulo="Folha de" destaque="cobertura" />
          <p className="max-w-2xl text-[14px] leading-relaxed text-texto-3">
            Consulte as atividades programadas para a equipe e o período escolhidos; imprima ou baixe a imagem para divulgar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportarImagem} disabled={!itens.length || gerando} aria-busy={gerando}
            className={`${BOTAO_SECUNDARIO} disabled:cursor-not-allowed disabled:opacity-60`}>
            <ImageDown className="size-4" aria-hidden />{gerando ? "Preparando imagem…" : "Baixar imagem PNG"}
          </button>
          <button type="button" onClick={imprimir} disabled={!itens.length}
            className={`${BOTAO_SECUNDARIO} disabled:cursor-not-allowed disabled:opacity-60`}>
            <Printer className="size-4" aria-hidden />Imprimir / salvar PDF
          </button>
        </div>
      </div>

      <div className="nao-imprimir grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Filtros da folha de cobertura">
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-texto">Pessoas</span>
          <MultiEscolha rotulo={pessoasSel.length === 1 ? pessoasSel[0].nome : pessoasSel.length ? "Pessoas" : "Todas as pessoas"}
            opcoes={pessoas.map((p) => ({ valor: p.chave, rotulo: p.np ? `${p.nome} · NP ${p.np}` : p.nome }))}
            valor={selecionadas} aoMudar={setEscolhidas} />
        </div>
        <Seletor rotulo="Área de atuação" name="cobertura-area" value={areaValida} onChange={(e) => setArea(e.target.value)}
          vazio="Todas as áreas" opcoes={Object.fromEntries(areas.map((a) => [a, a]))} />
        <Campo rotulo="Início do período" name="cobertura-inicio" type="date" value={ini} max={fim || undefined}
          onChange={(e) => setIni(e.target.value)} erro={isoValida(ini) ? undefined : "Informe a data de início."} />
        <Campo rotulo="Fim do período" name="cobertura-fim" type="date" value={fim} min={ini || undefined}
          onChange={(e) => setFim(e.target.value)}
          erro={!isoValida(fim) ? "Informe a data de fim." : isoValida(ini) && ini > fim ? "O fim deve ser igual ou posterior ao início." : undefined} />
      </div>
      {(ini !== semana.ini || fim !== semana.fim) && (
        <button type="button" onClick={() => { setIni(semana.ini); setFim(semana.fim); }}
          className="nao-imprimir inline-flex min-h-11 items-center gap-1.5 text-[13.5px] font-medium text-acao hover:text-[var(--acao-forte)]">
          <CalendarRange className="size-4" aria-hidden />Voltar para a semana atual ({formatarData(semana.ini)} a {formatarData(semana.fim)})
        </button>
      )}
      {msg && <div className="nao-imprimir"><Mensagem tipo={msg.tipo}>{msg.texto}</Mensagem></div>}

      <Cartao className="folha-cobertura overflow-hidden p-4 sm:p-6">
        <article aria-label="Folha de cobertura da programação" className="space-y-5">
          <header className="fc-bloco-topo flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-borda pb-4">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- logos estáticas pequenas, iguais às da imagem exportada */}
              <img src="/logo_alpargatas.png" alt="Alpargatas" className="h-9 w-auto" />
              <span aria-hidden className="h-8 w-px bg-borda-forte" />
              {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
              <img src="/logo_sim.svg" alt="SIM Manutenção Profissional" className="h-10 w-auto" />
            </div>
            <div className="min-w-0">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-texto-3">PCM • Programação de manutenção</p>
              <h3 id="titulo-cobertura" className="font-display text-[19px] font-semibold leading-tight text-texto sm:text-[22px]">Folha de cobertura da programação</h3>
            </div>
          </header>

          <p className="text-[13px] font-medium leading-relaxed text-texto-2" aria-live="polite">{linhaSelecao}</p>

          <div className="fc-bloco-topo flex flex-wrap gap-2" aria-live="polite">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-borda bg-superficie-2 px-3 py-1.5 text-[13.5px]">
              <ClipboardList className="size-4 text-texto-3" aria-hidden /><strong className="num">{itens.length.toLocaleString("pt-BR")}</strong>
              {itens.length === 1 ? "ordem" : "ordens"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-borda bg-superficie-2 px-3 py-1.5 text-[13.5px]">
              <Clock3 className="size-4 text-texto-3" aria-hidden /><strong className="num">{formatarMinutos(minutos)}</strong> de execução prevista
            </span>
            {totalAvisos > 0 && (
              <Selo cor="laranja" className="px-3 py-1.5 text-[13px]">
                <TriangleAlert className="size-3.5" aria-hidden />{plural(totalAvisos, "aviso de ausência", "avisos de ausência")}
              </Selo>
            )}
          </div>

          {totais.length > 0 && (
            <div className="fc-bloco-topo">
              <h4 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-texto-3">Total por pessoa</h4>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
                {totais.map((t) => (
                  <li key={t.chave} className="flex min-w-0 items-center gap-3 rounded-xl border border-borda px-3 py-2">
                    <Avatar nome={t.nome} foto={t.foto} tamanho={32} />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-[13.5px] text-texto">{t.nome}</strong>
                      {t.np && <small className="block text-[12px] text-texto-3">NP {t.np}</small>}
                    </span>
                    <span className="shrink-0 text-right text-[12.5px] text-texto-2">
                      <strong className="num block text-[14px] text-texto">{formatarMinutos(t.minutos)}</strong>
                      {plural(t.ordens, "ordem", "ordens")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!itens.length ? (
            <div className="rounded-xl border border-dashed border-borda-forte px-4 py-8 text-center">
              <h4 className="font-display text-[16px] font-semibold text-texto">{vazioTitulo}</h4>
              <p className="mt-1 text-[13.5px] text-texto-3">{vazioTexto}</p>
            </div>
          ) : (
            <div className="space-y-5">
              {dias.map((d) => (
                <section key={d.data} aria-label={`${diaSemana(d.data)}, ${formatarData(d.data)}`}>
                  <div className="fc-cab-dia flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-t-xl bg-superficie-2 px-3 py-2">
                    <h4 className="font-display text-[15px] font-semibold capitalize text-texto">
                      {diaSemana(d.data)}, <span className="num">{formatarData(d.data)}</span>
                    </h4>
                    <span className="text-[12.5px] text-texto-2">
                      {plural(d.linhas.length, "ordem", "ordens")} · <span className="num">{formatarMinutos(d.minutos)}</span>
                    </span>
                  </div>
                  {d.avisos.length > 0 && (
                    <ul className="space-y-1 border-x border-borda bg-[var(--selo-serio-fundo)] px-3 py-2 text-[12.5px] font-medium text-[var(--selo-serio-texto)]">
                      {d.avisos.map((a) => (
                        <li key={a.nome} className="flex items-start gap-1.5">
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          <span>{a.nome} está {a.motivo === "férias" ? "de férias" : a.motivo === "folga" ? "de folga" : "com ausência lançada na Gestão de HH"} neste dia.</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <table className="w-full border-collapse text-left text-[13.5px]">
                    <caption className="sr-only">Ordens de {formatarData(d.data)}</caption>
                    <thead className="hidden sm:table-header-group">
                      <tr className="border-b-2 border-borda-forte text-[11.5px] uppercase tracking-[0.06em] text-texto-3">
                        <th scope="col" className="w-[16%] px-3 py-2 font-bold">Ordem de manutenção</th>
                        <th scope="col" className="w-[16%] px-3 py-2 font-bold">Máquina</th>
                        <th scope="col" className="px-3 py-2 font-bold">Descrição da atividade</th>
                        <th scope="col" className="w-[11%] px-3 py-2 font-bold">Tempo</th>
                        <th scope="col" className="w-[24%] px-3 py-2 font-bold">Executor / técnico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.linhas.map(({ p, tecnico, nome, aviso }) => (
                        <tr key={p.id} className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-borda px-3 py-3 sm:table-row sm:p-0">
                          <td className="sm:px-3 sm:py-2.5 sm:align-top">
                            <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-texto-3 sm:hidden">Ordem</span>
                            <strong className="num block break-words text-texto">{p.ordem || "—"}</strong>
                            {p.tipoOrdem && <small className="block text-[12px] text-texto-3">{p.tipoOrdem}</small>}
                            {p.status === "reprogramada" && <Selo cor="amarelo" className="mt-1">Reprogramada</Selo>}
                            {p.status === "concluida" && <Selo cor="verde" className="mt-1">Concluída</Selo>}
                          </td>
                          <td className="sm:px-3 sm:py-2.5 sm:align-top">
                            <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-texto-3 sm:hidden">Máquina</span>
                            <strong className="block break-words text-texto">{p.equipamento || "—"}</strong>
                          </td>
                          <td className="col-span-2 break-words text-texto-2 sm:px-3 sm:py-2.5 sm:align-top">
                            <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-texto-3 sm:hidden">Descrição da atividade</span>
                            {p.descricao || "—"}
                          </td>
                          <td className="sm:px-3 sm:py-2.5 sm:align-top">
                            <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-texto-3 sm:hidden">Tempo</span>
                            <strong className="num block text-texto">{formatarMinutos(p.minutos)}</strong>
                            {p.turno && <small className="block text-[12px] text-texto-3">{p.turno}</small>}
                          </td>
                          <td className="sm:px-3 sm:py-2.5 sm:align-top">
                            <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-texto-3 sm:hidden">Executor</span>
                            <div className="flex min-w-0 items-center gap-2.5">
                              <Avatar nome={nome} foto={tecnico?.foto} tamanho={32} />
                              <span className="min-w-0">
                                <strong className="block break-words text-texto">{nome}</strong>
                                <small className="block text-[12px] text-texto-3">
                                  {[(tecnico?.np || p.np) ? `NP ${tecnico?.np || p.np}` : "", p.area].filter(Boolean).join(" • ")}
                                </small>
                                {aviso && <Selo cor="laranja" className="mt-1">{aviso === "ausência" ? "Ausência" : aviso === "férias" ? "Férias" : "Folga"}</Selo>}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          )}
        </article>
      </Cartao>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Imagem PNG (canvas), como a exportação do app original, agora agrupada por dia e com o total por pessoa
// ----------------------------------------------------------------------------
type Ctx = CanvasRenderingContext2D;
const FONTE = "Arial, Helvetica, sans-serif";
const COR = { titulo: "#111311", texto: "#2A2D2F", apoio: "#45494B", fraco: "#6D6E71", borda: "#E2E7E3", faixa: "#F1F4F2",
  verde: "#009C48", aviso: "#9A4705", avisoFundo: "#FDEBDD", reprog: "#7A5600", avatar: "#E2EEF8", avatarTexto: "#005799" };

/** Quebra o texto em linhas que cabem na largura (palavra longa é quebrada por caractere). */
function quebrarTexto(ctx: Ctx, valor: string, largura: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of String(valor || "—").split(/\r?\n/)) {
    let linha = "";
    for (const palavra of paragrafo.trim().split(/\s+/).filter(Boolean)) {
      if (ctx.measureText(palavra).width > largura) {
        if (linha) { linhas.push(linha); linha = ""; }
        let parte = "";
        for (const c of palavra) {
          if (parte && ctx.measureText(parte + c).width > largura) { linhas.push(parte); parte = ""; }
          parte += c;
        }
        linha = parte;
      } else if (!linha || ctx.measureText(`${linha} ${palavra}`).width <= largura) {
        linha = linha ? `${linha} ${palavra}` : palavra;
      } else {
        linhas.push(linha);
        linha = palavra;
      }
    }
    linhas.push(linha || " ");
  }
  return linhas;
}

function escrever(ctx: Ctx, linhas: string[], x: number, y: number, altura: number, cor: string, fonte: string) {
  ctx.fillStyle = cor;
  ctx.font = fonte;
  linhas.forEach((l, i) => ctx.fillText(l, x, y + i * altura));
}

function carregarImagem(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

/** Logo SVG sem width/height não tem tamanho próprio em todo navegador: recebe as medidas do viewBox antes de virar imagem. */
async function carregarSvg(src: string): Promise<HTMLImageElement | null> {
  try {
    const texto = await (await fetch(src)).text();
    const vb = /viewBox="[\d.\s-]*?\s([\d.]+)\s([\d.]+)"/.exec(texto);
    const comMedida = vb && !/<svg[^>]*\swidth=/.test(texto) ? texto.replace("<svg", `<svg width="${vb[1]}" height="${vb[2]}"`) : texto;
    const url = URL.createObjectURL(new Blob([comMedida], { type: "image/svg+xml" }));
    const img = await carregarImagem(url);
    URL.revokeObjectURL(url);
    return img;
  } catch {
    return null;
  }
}

function desenharLogo(ctx: Ctx, img: HTMLImageElement | null, x: number, y: number, w: number, h: number) {
  if (!img || !img.width || !img.height) return;
  const e = Math.min(w / img.width, h / img.height);
  ctx.drawImage(img, x + (w - img.width * e) / 2, y + (h - img.height * e) / 2, img.width * e, img.height * e);
}

function desenharAvatar(ctx: Ctx, foto: HTMLImageElement | null | undefined, nome: string, x: number, y: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  if (foto) {
    ctx.clip();
    const e = Math.max((2 * r) / foto.width, (2 * r) / foto.height);
    ctx.drawImage(foto, x + r - (foto.width * e) / 2, y + r - (foto.height * e) / 2, foto.width * e, foto.height * e);
  } else {
    ctx.fillStyle = COR.avatar;
    ctx.fill();
    ctx.fillStyle = COR.avatarTexto;
    ctx.font = `700 ${Math.round(r * 0.75)}px ${FONTE}`;
    ctx.textAlign = "center";
    ctx.fillText(iniciais(nome), x + r, y + r - Math.round(r * 0.42));
  }
  ctx.restore();
}

async function desenharFolha({ dias, totais, linhaSelecao, ordens, minutos }: { dias: Dia[]; totais: TotalPessoa[]; linhaSelecao: string;
  ordens: number; minutos: number }): Promise<Blob> {
  const L = 1600, M = 46;
  const canvas = document.createElement("canvas");
  canvas.width = L;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não conseguiu criar a imagem.");
  const col = { ordem: M, maquina: 236, descricao: 466, tempo: 1046, executor: 1176 };

  // medidas
  ctx.font = `600 18px ${FONTE}`;
  const selecao = quebrarTexto(ctx, linhaSelecao, L - 2 * M);
  const porLinhaTotal = 3, larguraTotal = (L - 2 * M - 20 * (porLinhaTotal - 1)) / porLinhaTotal;
  const linhasTotais = Math.ceil(totais.length / porLinhaTotal);
  const blocos = dias.map((d) => ({
    dia: d,
    linhas: d.linhas.map((l) => {
      ctx.font = `700 18px ${FONTE}`;
      const ordem = quebrarTexto(ctx, l.p.ordem || "—", 175);
      ctx.font = `600 18px ${FONTE}`;
      const maquina = quebrarTexto(ctx, l.p.equipamento || "—", 210);
      ctx.font = `18px ${FONTE}`;
      const descricao = quebrarTexto(ctx, l.p.descricao || "—", 560);
      ctx.font = `700 18px ${FONTE}`;
      const nome = quebrarTexto(ctx, l.nome, 330);
      ctx.font = `15px ${FONTE}`;
      const np = l.tecnico?.np || l.p.np;
      const meta = quebrarTexto(ctx, [np ? `NP ${np}` : "", l.p.area, l.aviso ? `⚠ ${l.aviso === "ausência" ? "Ausência" : l.aviso === "férias" ? "Férias" : "Folga"} neste dia` : ""]
        .filter(Boolean).join(" · ") || " ", 330);
      const extraOrdem = (l.p.tipoOrdem ? 1 : 0) + (l.p.status === "reprogramada" || l.p.status === "concluida" ? 1 : 0);
      const altura = Math.max(72, 24 + Math.max(ordem.length + extraOrdem, maquina.length, descricao.length, nome.length + meta.length) * 23);
      return { l, ordem, maquina, descricao, nome, meta, altura };
    }),
    avisos: d.avisos.map((a) => `⚠ ${a.nome} está ${a.motivo === "férias" ? "de férias" : a.motivo === "folga" ? "de folga" : "com ausência lançada na Gestão de HH"} neste dia.`),
  }));
  const topoTotais = 181 + selecao.length * 27 + 12;
  const alturaTotais = totais.length ? 34 + linhasTotais * 64 : 0;
  const topoTabela = topoTotais + alturaTotais + 20;
  const alturaCab = 46;
  const alturaBlocos = blocos.reduce((s, b) => s + 50 + b.avisos.length * 26 + (b.avisos.length ? 10 : 0) + b.linhas.reduce((t, x) => t + x.altura, 0) + 18, 0);
  const altura = topoTabela + alturaCab + alturaBlocos + 28;
  if (altura > 15_000) throw new Error("A imagem ficou muito alta. Escolha um período menor e exporte novamente.");
  canvas.height = altura;

  // fundo, faixa e cabeçalho
  ctx.textBaseline = "top";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, L, altura);
  const faixa = ["#E41824", "#F07818", "#FCB40C", "#A8C024", "#009C48", "#009CD8", "#006CB4"];
  faixa.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect((L / faixa.length) * i, 0, L / faixa.length + 1, 9); });
  const [alpargatas, sim] = await Promise.all([carregarImagem("/logo_alpargatas.png"), carregarSvg("/logo_sim.svg")]);
  desenharLogo(ctx, alpargatas, 48, 30, 95, 52);
  ctx.fillStyle = COR.borda;
  ctx.fillRect(156, 34, 1, 44);
  desenharLogo(ctx, sim, 170, 26, 110, 60);
  escrever(ctx, ["PCM · PROGRAMAÇÃO DE MANUTENÇÃO"], 300, 27, 22, COR.apoio, `700 16px ${FONTE}`);
  escrever(ctx, ["Folha de cobertura da programação"], 300, 53, 36, COR.titulo, `700 32px ${FONTE}`);
  ctx.fillStyle = COR.borda;
  ctx.fillRect(M, 104, L - 2 * M, 1);
  escrever(ctx, selecao, M, 118, 27, COR.apoio, `600 18px ${FONTE}`);
  escrever(ctx, [`${ordens} ${ordens === 1 ? "ordem" : "ordens"}  ·  ${formatarMinutos(minutos)} de execução prevista`], M, 118 + selecao.length * 27 + 10, 24,
    COR.titulo, `700 18px ${FONTE}`);

  // total por pessoa
  const fotosSrc = [...new Set([...totais.map((t) => t.foto), ...dias.flatMap((d) => d.linhas.map((l) => l.tecnico?.foto || ""))].filter(Boolean))];
  const fotos = new Map(await Promise.all(fotosSrc.map(async (s) => [s, await carregarImagem(s)] as const)));
  if (totais.length) {
    escrever(ctx, ["TOTAL POR PESSOA"], M, topoTotais, 20, COR.fraco, `700 14px ${FONTE}`);
    totais.forEach((t, i) => {
      const x = M + (i % porLinhaTotal) * (larguraTotal + 20), y = topoTotais + 26 + Math.floor(i / porLinhaTotal) * 64;
      ctx.strokeStyle = COR.borda;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, larguraTotal - 1, 54);
      desenharAvatar(ctx, fotos.get(t.foto), t.nome, x + 10, y + 9, 18);
      ctx.font = `700 17px ${FONTE}`;
      const nome = quebrarTexto(ctx, t.nome, larguraTotal - 190)[0];
      escrever(ctx, [nome], x + 56, y + 9, 20, COR.titulo, `700 17px ${FONTE}`);
      escrever(ctx, [t.np ? `NP ${t.np}` : " "], x + 56, y + 31, 18, COR.fraco, `14px ${FONTE}`);
      ctx.textAlign = "right";
      escrever(ctx, [formatarMinutos(t.minutos)], x + larguraTotal - 12, y + 9, 20, COR.titulo, `700 17px ${FONTE}`);
      escrever(ctx, [`${t.ordens} ${t.ordens === 1 ? "ordem" : "ordens"}`], x + larguraTotal - 12, y + 31, 18, COR.fraco, `14px ${FONTE}`);
      ctx.textAlign = "left";
    });
  }

  // cabeçalho da tabela
  ctx.fillStyle = COR.faixa;
  ctx.fillRect(M, topoTabela, L - 2 * M, alturaCab);
  const titulos: [number, string][] = [[col.ordem, "ORDEM"], [col.maquina, "MÁQUINA"], [col.descricao, "DESCRIÇÃO DA ATIVIDADE"], [col.tempo, "TEMPO"],
    [col.executor, "EXECUTOR / TÉCNICO"]];
  titulos.forEach(([x, t]) => escrever(ctx, [t], x === M ? M + 10 : x, topoTabela + 15, 19, COR.apoio, `700 15px ${FONTE}`));

  let y = topoTabela + alturaCab + 8;
  for (const b of blocos) {
    // faixa do dia
    ctx.fillStyle = COR.verde;
    ctx.fillRect(M, y, 5, 40);
    ctx.fillStyle = COR.faixa;
    ctx.fillRect(M + 5, y, L - 2 * M - 5, 40);
    const dia = diaSemana(b.dia.data);
    escrever(ctx, [`${dia.charAt(0).toLocaleUpperCase("pt-BR")}${dia.slice(1)}, ${formatarData(b.dia.data)}`], M + 16, y + 10, 22, COR.titulo, `700 19px ${FONTE}`);
    ctx.textAlign = "right";
    escrever(ctx, [`${b.linhas.length} ${b.linhas.length === 1 ? "ordem" : "ordens"} · ${formatarMinutos(b.dia.minutos)}`], L - M - 14, y + 11, 22, COR.apoio,
      `600 17px ${FONTE}`);
    ctx.textAlign = "left";
    y += 50;
    if (b.avisos.length) {
      ctx.fillStyle = COR.avisoFundo;
      ctx.fillRect(M, y - 6, L - 2 * M, b.avisos.length * 26 + 8);
      escrever(ctx, b.avisos, M + 14, y - 1, 26, COR.aviso, `700 16px ${FONTE}`);
      y += b.avisos.length * 26 + 10;
    }
    b.linhas.forEach((r, i) => {
      if (i % 2) { ctx.fillStyle = "#FAFBFA"; ctx.fillRect(M, y, L - 2 * M, r.altura); }
      ctx.fillStyle = COR.borda;
      ctx.fillRect(M, y + r.altura - 1, L - 2 * M, 1);
      const ty = y + 12;
      escrever(ctx, r.ordem, col.ordem + 10, ty, 23, COR.titulo, `700 18px ${FONTE}`);
      let yo = ty + r.ordem.length * 23 + 2;
      if (r.l.p.tipoOrdem) { escrever(ctx, [r.l.p.tipoOrdem], col.ordem + 10, yo, 20, COR.fraco, `15px ${FONTE}`); yo += 22; }
      if (r.l.p.status === "reprogramada") escrever(ctx, ["Reprogramada"], col.ordem + 10, yo, 20, COR.reprog, `700 15px ${FONTE}`);
      else if (r.l.p.status === "concluida") escrever(ctx, ["Concluída"], col.ordem + 10, yo, 20, COR.verde, `700 15px ${FONTE}`);
      escrever(ctx, r.maquina, col.maquina, ty, 23, COR.titulo, `600 18px ${FONTE}`);
      escrever(ctx, r.descricao, col.descricao, ty, 23, COR.texto, `18px ${FONTE}`);
      escrever(ctx, [formatarMinutos(r.l.p.minutos)], col.tempo, ty, 23, COR.titulo, `700 18px ${FONTE}`);
      if (r.l.p.turno) escrever(ctx, [r.l.p.turno], col.tempo, ty + 25, 20, COR.fraco, `15px ${FONTE}`);
      desenharAvatar(ctx, fotos.get(r.l.tecnico?.foto || ""), r.l.nome, col.executor, y + 13, 18);
      escrever(ctx, r.nome, col.executor + 47, ty, 23, COR.titulo, `700 18px ${FONTE}`);
      escrever(ctx, r.meta, col.executor + 47, ty + r.nome.length * 23 + 2, 20, r.l.aviso ? COR.aviso : COR.fraco, `15px ${FONTE}`);
      y += r.altura;
    });
    y += 18;
  }

  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
  if (!blob) throw new Error("Não foi possível finalizar a imagem. Reduza o período e tente novamente.");
  return blob;
}
