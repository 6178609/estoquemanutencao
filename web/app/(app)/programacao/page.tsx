import { Bot, CircleAlert, CircleCheck, Info } from "lucide-react";
import type { Metadata } from "next";

import { Aviso, PaginaWcm, Secao } from "@/components/PaginaWcm";
import { Cabecalho, Cartao } from "@/components/ui";
import { podeEditar } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { lerCadastro } from "@/lib/dados/cadastros";
import { dataHora, inteiro } from "@/lib/formato";
import { barra, contexto } from "@/lib/wcm/contexto";
import { descrever } from "@/lib/wcm/filtros";
import { dataBr, partes, type Dia } from "@/lib/wcm/util";

import { Controles } from "../planos/_comum/Controles";
import { GavetaUrl } from "../planos/_comum/GavetaUrl";
import { atalhos, hrefCom, iso, ligado, periodo, um, type Params } from "../planos/_comum/params";
import { TabelaLonga } from "../planos/_comum/TabelaLonga";
import { camposDeOrdenacao } from "./campos";
import { AutoAtualizar, BotoesLote, FormExecutar, FormTeste, MesEditavel, type DiaMes } from "./Interativo";
import * as md from "./logica";

export const metadata: Metadata = { title: "Programação do mês" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COMO_ATIVAR = [
  "No PC que tem o SAP, na pasta do sistema (a mesma do iniciar.bat), dê duplo clique em atualizar.bat: ele baixa a versão nova e reinicia o sincronizador.",
  "Se ainda não fez: automacao\\configurar_robo.bat (guarda o usuário do SAP no Windows) e sincronizador\\configurar.bat.",
  "Volte aqui e clique em Testar o robô: ele confere cada passo no SAP sem alterar nada. Depois disso o sincronizador se atualiza sozinho (a cada 6 h) e avisa o site que está ligado.",
];

const ler = async (nome: string) => { try { return await lerCadastro(nome); } catch { return {}; } };

export default async function Programacao(props: { searchParams: Promise<Params> }) {
  const u = await exigir("programacao");
  const pode = podeEditar(u);
  const params = await props.searchParams;
  const c = await contexto(params);
  const hoje = c.b.hoje;

  const [lotesCru, progCru, sinais] = await Promise.all([ler(md.ARQ_LOTES), ler(md.ARQ_PROGRAMACAO), ler(md.ARQ_ROBO_PC)]);
  const lotes = Object.fromEntries(Object.entries(lotesCru).filter(([, v]) => v && typeof v === "object")) as Record<string, md.Lote>;
  const abertos = Object.entries(lotes).filter(([, v]) => md.ABERTOS.includes(String(v.status)));
  const prog = md.programacaoValida(progCru);
  const robo = md.situacaoRobo(sinais);
  const pronto = robo.find((x) => x.estado === "ok");

  // referências: ordens do IW38 com campo de ordenação, concluídas pela IW47 e nomes dos ativos
  const ordens = c.b.ordens.dados ?? [];
  const campoDe = await camposDeOrdenacao(c.b.ordens.dados);
  const tokens = new Map<string, Set<string>>();
  for (const x of c.b.confirmacoes.dados ?? []) {
    const t = tokens.get(x.ordem) ?? tokens.set(x.ordem, new Set()).get(x.ordem)!;
    for (const s of x.statusSistema.split(/\s+/)) if (s) t.add(s);
  }
  const concluidas = new Set([...tokens].filter(([, t]) => t.has("CONF") && t.has("ENTE")).map(([o]) => o));
  const ordensCampo: md.OrdemCampo[] = ordens.filter((o) => campoDe.has(o.ordem)).map((o) => ({ ordem: o.ordem, campo: campoDe.get(o.ordem)!,
    texto: o.texto, tipo: o.tipo, situacao: o.situacao, inicio: o.inicio, fim: o.fim }));
  const nomes = nomesDeAtivos(ordens.map((o) => ({ equipamento: o.equipamento, campo: campoDe.get(o.ordem) ?? "", objeto: o.objeto })),
    (c.b.equipamentos.dados ?? []).map((e) => [e.equipamento, e.denominacao]));

  // mês escolhido (15 meses: 2 antes do atual e 12 depois)
  const mesAtual = hoje - (partes(hoje).dia - 1);
  const meses: Dia[] = [];
  for (let m = md.deIso(`${isoMes(mesAtual, -2)}-01`)!, i = 0; i < 15; i++, m = md.fimDoMes(m) + 1) meses.push(m);
  const pedido = /^\d{4}-\d{2}$/.test(um(params, "mes")) ? md.deIso(`${um(params, "mes")}-01`) : null;
  const mes = pedido != null && meses.includes(pedido) ? pedido : mesAtual;
  const fimMes = md.fimDoMes(mes);
  const pm = partes(mes);

  // ordens abertas do mês por máquina (só para orientar)
  const noMes = new Map<string, number>();
  for (const o of ordensCampo)
    if ((o.situacao === "Aberta" || o.situacao === "Liberada") && !concluidas.has(o.ordem) && o.inicio != null && o.inicio >= mes && o.inicio <= fimMes)
      noMes.set(o.campo, (noMes.get(o.campo) ?? 0) + 1);
  const dias: DiaMes[] = [];
  const iniGrade = mes - partes(mes).semana, fimGrade = fimMes + (6 - partes(fimMes).semana);
  for (let d = iniGrade; d <= fimGrade; d++) {
    const k = md.isoDe(d);
    dias.push({ iso: k, numero: partes(d).dia, hoje: d === hoje, fora: d < mes || d > fimMes,
      campos: (prog[k] ?? []).map((x) => ({ campo: x, nome: nomes[x] ?? null, n: noMes.get(x) ?? 0 })) });
  }
  const diasProgramados = Object.keys(prog).filter((k) => k >= md.isoDe(mes) && k <= md.isoDe(fimMes)).length;

  // dias a executar
  const padrao: [Dia, Dia] = fimMes >= hoje ? [Math.max(hoje, mes), fimMes] : [mes, fimMes];
  const [xIni, xFim] = periodo(params, "xde", "xate", padrao);
  const atrasadas = ligado(params, "xatr");
  const cons = md.consultas(prog, xIni, xFim, atrasadas);
  const est = md.estimativa(ordensCampo, cons, concluidas, nomes);
  const porDia = new Map<string, number>();
  for (const e of est) porDia.set(e.dia, (porDia.get(e.dia) ?? 0) + 1);
  const bloqueio = !pode ? "Só administrador ou editor pode iniciar." : abertos.length ? "Já há um lote em andamento." : "";

  // histórico e lote aberto na gaveta
  const tab = md.tabelaLotes(lotes);
  const ultimoTeste = tab.find((l) => l.diagnostico && (l.status === md.CONCLUIDA || l.status === md.COM_ERROS));
  const idLote = um(params, "lote");
  const lote = idLote ? lotes[idLote] : undefined;

  return (
    <PaginaWcm barra={{ ...barra(c), recorte: "Os filtros globais não se aplicam a esta aba" }} periodo={false} dimensoes={false}>
      {abertos.length > 0 && <AutoAtualizar />}
      <Cabecalho titulo="Programação do mês," destaque="a previsão das paradas das máquinas."
        sobre="Programação · previsão manual" subtitulo="Calendário manual das paradas das máquinas (campo de ordenação), à parte do calendário da IW38. Daqui sai o pedido para o robô do SAP mudar as datas das ordens na IW38; o calendário de ordens se atualiza com o resultado." />

      <Secao titulo={`${md.MESES[pm.mes - 1]} de ${pm.ano}`} destaque={`· ${diasProgramados} dia(s) com parada`}
        sub={`Digite em cada dia os campos de ordenação das máquinas que vão parar (separe por vírgula ou espaço) e tecle Enter: o nome do ativo aparece embaixo e a programação fica salva para todos (o mesmo arquivo do site atual).${pode ? "" : " Só administrador ou editor pode alterar."}`}
        acoes={<Controles limpar={["xde", "xate", "lote"]} controles={[{ tipo: "escolha", chave: "mes", rotulo: "Mês", valor: isoMes(mes, 0),
          opcoes: meses.map((m) => ({ valor: isoMes(m, 0), rotulo: `${md.MESES[partes(m).mes - 1]} de ${partes(m).ano}` })) }]} />}>
        <MesEditavel semanas={dias.length / 7} dias={dias} pode={pode} />
      </Secao>

      <Secao titulo="Mudar as datas no SAP" destaque="· pedido ao robô"
        sub="Para cada dia, o robô abre a IW38, usa a seta à direita do Campo de ordenação para colocar os campos do dia, filtra o período das ordens e executa. Em cada ordem da lista, InícioBase e Fim-base recebem a data do dia; o robô grava e confere. Quando uma máquina para mais de uma vez no mês, cada parada leva as ordens até ela (a última leva até o fim do mês).">
        <Aviso tom="azul">
          <b>Este site não tem acesso ao SAP.</b> O pedido fica guardado no repositório de dados (mudancas_datas.json, o mesmo do site atual) e o
          robô do PC do PCM — sincronizador ligado e robô configurado — pega o pedido em até 1 minuto, executa no SAP e devolve o resultado aqui.
        </Aviso>
        <div className="grid gap-4 lg:grid-cols-2">
          <Cartao className="space-y-3 p-5">
            <div className="flex items-center gap-2 font-display text-[15px] font-medium"><Bot className="size-4" />Situação do robô do SAP</div>
            {pronto ? (
              <p className="flex items-start gap-2 text-[13.5px]"><CircleCheck className="mt-0.5 size-4 shrink-0" style={{ color: "var(--st-bom)" }} />
                <span>Robô <b>pronto</b> no PC <b>{pronto.pc}</b> · visto há {md.tempo(pronto.vistoMin)} · código {pronto.versao} · pega cada pedido em até 1 minuto.</span></p>
            ) : (
              <>
                {!robo.length && <p className="flex items-start gap-2 text-[13.5px]"><CircleAlert className="mt-0.5 size-4 shrink-0" style={{ color: "var(--st-critico)" }} />
                  <span><b>Nenhum PC com o robô do SAP deu sinal ao site.</b> O PC do SAP está com o código antigo ou o sincronizador está desligado — por isso os pedidos ficam em &quot;Aguardando o robô do SAP&quot;.</span></p>}
                {robo.slice(0, 3).map((x) => (
                  <p key={x.pc} className="flex items-start gap-2 text-[13.5px]"><CircleAlert className="mt-0.5 size-4 shrink-0" style={{ color: x.estado === "nao_configurado" ? "var(--st-atencao)" : "var(--st-critico)" }} />
                    <span>PC <b>{x.pc}</b>: {x.texto}</span></p>
                ))}
                <details className="rounded-lg border border-borda bg-superficie-2 px-3 py-2 text-[13px]" open={!robo.length}>
                  <summary className="cursor-pointer font-medium">Como colocar o robô para funcionar</summary>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-texto-2">{COMO_ATIVAR.map((t) => <li key={t}>{t}</li>)}</ol>
                </details>
              </>
            )}
            {abertos.map(([id, l]) => {
              const parado = md.paradoHa(l);
              const oque = l.tipo === md.DIAGNOSTICO ? "Teste do robô" : `Lote ${id}`;
              const alerta = (l.status === md.SOLICITADA && !pronto && (parado ?? 0) >= 2) || (l.status === md.EM_EXECUCAO && (parado ?? 0) >= 40);
              return (
                <div key={id} className="rounded-lg border border-borda px-3 py-2 text-[13px]" style={alerta ? { borderColor: "var(--st-critico)" } : undefined}>
                  <b>{oque}: {md.ROTULO_STATUS[String(l.status)]}</b>{l.progresso?.texto ? ` · ${l.progresso.texto}` : ""}
                  {alerta && l.status === md.SOLICITADA && <div className="mt-1 text-texto-2">Há {parado} min e nenhum robô do SAP pegou o pedido. Cancele no histórico se não for mais preciso.</div>}
                  {alerta && l.status === md.EM_EXECUCAO && <div className="mt-1 text-texto-2">Sem notícias do robô há {parado} min: ele pode ter parado. Confira o SAP no PC do robô; se for o caso, cancele no histórico e rode de novo.</div>}
                  {!alerta && l.status === md.SOLICITADA && <div className="mt-1 text-texto-3">O robô do PC com o SAP pega o pedido em até 1 minuto · esta página se atualiza sozinha.</div>}
                </div>
              );
            })}
          </Cartao>
          <Cartao className="space-y-3 p-5">
            <div className="font-display text-[15px] font-medium">Testar o robô</div>
            {ultimoTeste ? (
              <p className="flex items-start gap-2 text-[13.5px]">
                {ultimoTeste.status === md.CONCLUIDA ? <CircleCheck className="mt-0.5 size-4 shrink-0" style={{ color: "var(--st-bom)" }} /> : <CircleAlert className="mt-0.5 size-4 shrink-0" style={{ color: "var(--st-critico)" }} />}
                <span>Último teste ({dataHora(lotes[ultimoTeste.lote].executado_em || ultimoTeste.criadoEm)}): {ultimoTeste.resumo}{" "}
                  <a className="underline" href={hrefCom(params, { lote: ultimoTeste.lote })}>ver etapas</a></span>
              </p>
            ) : <p className="text-[13.5px] text-texto-3">Nenhum teste do robô ainda.</p>}
            <FormTeste mes={md.isoDe(mes)} bloqueio={!pode ? "Só administrador ou editor." : abertos.length ? "Já há um pedido em andamento." : ""} />
          </Cartao>
        </div>

        <Cartao className="space-y-4 p-5">
          <Controles controles={[
            { tipo: "periodo", de: "xde", ate: "xate", valorDe: iso(xIni), valorAte: iso(xFim), rotulo: "Dias a executar",
              atalhos: atalhos(hoje, ["Esta semana (seg–dom)", "Próxima semana (seg–dom)", "Este mês", "Próximo mês"]) },
            { tipo: "alternar", chave: "xatr", rotulo: "Trazer também as ordens atrasadas de meses anteriores", valor: atrasadas,
              dica: "Na primeira parada de cada máquina no mês, a IW38 busca desde sempre, e não só a partir do dia 1º do mês." },
          ]} />
          {!cons.length ? <p className="text-[13.5px] text-texto-3">Nenhum dia com campo de ordenação entre {descrever(xIni, xFim)}.</p> : (
            <>
              <TabelaLonga altura={300} colunas={[{ titulo: "Dia", largura: 96 }, { titulo: "Campos de ordenação", largura: 360, flex: true },
                { titulo: "Ordens buscadas na IW38 com data de", largura: 260 }, { titulo: "Ordens previstas", largura: 130, num: true }]}
                linhas={cons.map((x) => [dataBr(md.deIso(x.dia)), x.campos.map((k) => `${k} · ${(nomes[k] ?? "?").slice(0, 30)}`).join(", "),
                  x.de !== md.DESDE_SEMPRE ? `${dataBr(md.deIso(x.de))} a ${dataBr(md.deIso(x.ate))}` : `até ${dataBr(md.deIso(x.ate))} (com atrasadas)`,
                  porDia.get(x.dia) ?? 0])} />
              <p className="flex items-start gap-2 text-[12.5px] text-texto-3"><Info className="mt-0.5 size-3.5 shrink-0" />
                Previsão pelo IW38 exportado: {inteiro(est.length)} ordem(ns) em {cons.length} consulta(s). O robô consulta a IW38 na hora, então o número real pode ser outro.</p>
              {est.length > 0 && (
                <details className="rounded-lg border border-borda px-3 py-2">
                  <summary className="cursor-pointer text-[13.5px] font-medium">Ordens previstas ({inteiro(est.length)})</summary>
                  <div className="mt-3">
                    <TabelaLonga altura={340} csv="ordens_previstas" colunas={[{ titulo: "Novo início e fim", largura: 130 }, { titulo: "Ordem", largura: 100 },
                      { titulo: "Campo de ordenação", largura: 150 }, { titulo: "Ativo", largura: 200 }, { titulo: "Texto", largura: 240 }, { titulo: "Tipo", largura: 64 },
                      { titulo: "Situação", largura: 100 }, { titulo: "Início atual", largura: 104 }, { titulo: "Fim atual", largura: 104 }]}
                      linhas={est.slice(0, 5000).map((e) => [dataBr(md.deIso(e.dia)), e.ordem, e.campo, e.ativo, e.texto, e.tipo, e.situacao, dataBr(e.inicioAtual), dataBr(e.fimAtual)])} />
                  </div>
                </details>
              )}
              {est.length > md.MAX_ORDENS_LOTE && <Aviso>Mais de {md.MAX_ORDENS_LOTE} ordens previstas: o robô para nesse limite. Rode por partes (menos dias por vez).</Aviso>}
              <FormExecutar de={iso(xIni)} ate={iso(xFim)} atrasadas={atrasadas} consultas={cons.length} bloqueio={bloqueio} />
            </>
          )}
        </Cartao>
      </Secao>

      {tab.length > 0 && (
        <Secao titulo="Histórico de mudanças de datas" destaque={`· ${tab.length}`} sub="Clique num lote para ver as ordens, o resultado do SAP e desfazer ou cancelar.">
          <TabelaLonga altura={380} csv="historico_mudancas_datas"
            links={tab.map((l) => hrefCom(params, { lote: l.lote }))}
            colunas={[{ titulo: "Lote", largura: 170 }, { titulo: "Criado em", largura: 130 }, { titulo: "Por", largura: 140 }, { titulo: "Situação", largura: 170 },
              { titulo: "Simulação", largura: 90, centro: true }, { titulo: "Origem", largura: 140 }, { titulo: "Dias", largura: 160 }, { titulo: "Ordens", largura: 76, num: true },
              { titulo: "OK", largura: 60, num: true }, { titulo: "Erros", largura: 64, num: true }, { titulo: "Resumo", largura: 320, flex: true }]}
            linhas={tab.map((l) => [l.lote, dataHora(l.criadoEm), l.por, situacaoCelula(l.status, l.situacao), l.simulacao ? "sim" : "", l.origem, l.dias, l.ordens, l.ok, l.erros, l.resumo])} />
        </Secao>
      )}

      {idLote && (
        <GavetaUrl parametro="lote" titulo={`${lote?.tipo === md.DIAGNOSTICO ? "Teste do robô" : "Lote"} ${idLote}`}
          subtitulo={lote ? `${md.ROTULO_STATUS[String(lote.status)] ?? lote.status} · ${lote.resumo || "sem resumo ainda"}` : "Lote não encontrado."}>
          {lote && <DetalheLote id={idLote} l={lote} pode={pode} haAbertos={abertos.length > 0} />}
        </GavetaUrl>
      )}
    </PaginaWcm>
  );
}

const isoMes = (d: Dia, n: number) => { const p = partes(d); const m = p.mes - 1 + n; const a = p.ano + Math.floor(m / 12); return `${a}-${String(((m % 12) + 12) % 12 + 1).padStart(2, "0")}`; };

function situacaoCelula(status: string, rotulo: string) {
  const cor = status === md.CONCLUIDA ? "var(--st-bom)" : status === md.COM_ERROS ? "var(--st-critico)" : md.ABERTOS.includes(status) ? "var(--serie-1)" : "var(--texto-4)";
  return { t: rotulo, fundo: `color-mix(in srgb, ${cor} 18%, transparent)`, cor: "var(--texto)" };
}

/** Código → nome do ativo: o objeto técnico mais comum das ordens (o campo de ordenação vence o equipamento); o IH08 por cima. */
function nomesDeAtivos(ordens: { equipamento: string; campo: string; objeto: string }[], ih08: [string, string][]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of ["equipamento", "campo"] as const) {
    const cont = new Map<string, Map<string, number>>();
    for (const o of ordens) {
      const k = (o[col] ?? "").trim().toUpperCase();
      if (!k || !o.objeto) continue;
      const m = cont.get(k) ?? cont.set(k, new Map()).get(k)!;
      m.set(o.objeto, (m.get(o.objeto) ?? 0) + 1);
    }
    for (const [k, m] of cont) {
      let melhor = "", n = -1;
      for (const [v, q] of m) if (q > n || (q === n && v < melhor)) { melhor = v; n = q; }
      out[k] = melhor;
    }
  }
  for (const [e, nome] of ih08) if (nome.trim()) out[e.trim().toUpperCase()] = nome;
  return out;
}

function DetalheLote({ id, l, pode, haAbertos }: { id: string; l: md.Lote; pode: boolean; haAbertos: boolean }) {
  const itens = l.itens ?? [];
  const podeDesfazer = [md.CONCLUIDA, md.COM_ERROS].includes(String(l.status)) && !l.simular && l.tipo !== md.DIAGNOSTICO && pode;
  const podeCancelar = md.ABERTOS.includes(String(l.status)) && pode;
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <dt className="text-texto-3">Criado em</dt><dd>{dataHora(l.criado_em)}</dd>
        <dt className="text-texto-3">Por</dt><dd>{l.criado_por || "—"}</dd>
        <dt className="text-texto-3">Origem</dt><dd>{l.origem || "—"}{l.simular && l.tipo !== md.DIAGNOSTICO ? " · simulação" : ""}</dd>
        {l.executado_em && <><dt className="text-texto-3">Executado em</dt><dd>{dataHora(l.executado_em)}</dd></>}
      </dl>
      <BotoesLote id={id} podeDesfazer={podeDesfazer} podeCancelar={podeCancelar} bloqueioDesfazer={haAbertos ? "Já há um lote em andamento." : ""} />
      {!!l.etapas?.length && (
        <div className="space-y-2">
          <div className="text-[13px] font-medium text-texto-2">Etapas do teste</div>
          <TabelaLonga altura={300} colunas={[{ titulo: "", largura: 44, centro: true }, { titulo: "Etapa", largura: 200 }, { titulo: "Detalhe", largura: 320, flex: true }]}
            linhas={l.etapas.map((e) => [e.ok ? { t: "✓", fundo: "color-mix(in srgb, var(--st-bom) 20%, transparent)", cor: "var(--texto)" }
              : { t: "✕", fundo: "color-mix(in srgb, var(--st-critico) 20%, transparent)", cor: "var(--texto)" }, e.etapa ?? "", e.detalhe ?? ""])} />
          {!!l.ordens_encontradas?.length && <p className="text-[12.5px] text-texto-3">Ordens que a IW38 trouxe no teste: {l.ordens_encontradas.slice(0, 60).join(", ")}</p>}
          {!!l.campos_tela?.length && (
            <details className="text-[13px]"><summary className="cursor-pointer font-medium">Campos da tela de seleção da IW38 ({l.campos_tela.length})</summary>
              <p className="my-2 text-[12px] text-texto-3">Para conferir os IDs usados pelo robô em automacao/transacoes.toml.</p>
              <TabelaLonga altura={260} colunas={[{ titulo: "ID", largura: 260 }, { titulo: "Tipo", largura: 100 }, { titulo: "Texto", largura: 200 }]}
                linhas={l.campos_tela.map((x) => [x.id ?? "", x.tipo ?? "", x.texto ?? ""])} />
            </details>
          )}
        </div>
      )}
      {(l.consultas_resultado ?? []).filter((x) => x.erro).map((x, i) => (
        <Aviso key={i}>IW38 de {x.dia ? dataBr(md.deIso(x.dia)) : "?"} ({(x.campos ?? []).join(", ")}): {x.erro}</Aviso>
      ))}
      {!!l.consultas?.length && (
        <div className="space-y-2">
          <div className="text-[13px] font-medium text-texto-2">Consultas pedidas ({l.consultas.length})</div>
          <TabelaLonga altura={220} colunas={[{ titulo: "Dia", largura: 96 }, { titulo: "Campos", largura: 220, flex: true }, { titulo: "Ordens de", largura: 100 }, { titulo: "até", largura: 100 }]}
            linhas={l.consultas.map((x) => [dataBr(md.deIso(x.dia)), x.campos.join(", "), x.de === md.DESDE_SEMPRE ? "sempre" : dataBr(md.deIso(x.de)), dataBr(md.deIso(x.ate))])} />
        </div>
      )}
      {itens.length > 0 && (
        <div className="space-y-2">
          <div className="text-[13px] font-medium text-texto-2">Ordens ({itens.length})</div>
          <TabelaLonga altura={360} csv={`mudanca_datas_${id}`}
            colunas={[{ titulo: "Ordem", largura: 100 }, { titulo: "Campo", largura: 110 }, { titulo: "Dia", largura: 96 }, { titulo: "Início antes", largura: 104 },
              { titulo: "Fim antes", largura: 104 }, { titulo: "Novo início", largura: 104 }, { titulo: "Novo fim", largura: 104 }, { titulo: "Resultado", largura: 90 },
              { titulo: "Mensagem do SAP", largura: 280 }]}
            linhas={itens.map((x) => [x.ordem, x.campo ?? "", fmt(x.dia), fmt(x.de_inicio), fmt(x.de_fim), fmt(x.para_inicio), fmt(x.para_fim),
              x.resultado === "ok" ? { t: "ok", fundo: "color-mix(in srgb, var(--st-bom) 20%, transparent)", cor: "var(--texto)" }
                : x.resultado === "erro" ? { t: "erro", fundo: "color-mix(in srgb, var(--st-critico) 20%, transparent)", cor: "var(--texto)" } : "—",
              x.mensagem ?? ""])} />
        </div>
      )}
    </>
  );
}

const fmt = (s?: string) => { const d = md.deIso(String(s ?? "").slice(0, 10)); return d != null ? dataBr(d) : s ?? ""; };
