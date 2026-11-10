import type { AbaXlsx } from "@/lib/exportacao/xlsx";
import { semanaIso } from "@/lib/wcm/planos";
import { dataBr, partes } from "@/lib/wcm/util";

import { NOME_DIA } from "./calendario";
import type { Calculo, Montado } from "./montar";
import { ativosSemHh, camposPorDia } from "./visoes";

/** "Baixar Excel" da Programação de paradas: uma aba por visão (Programação, Saldo HH, Campos por dia, Ativos sem HH…). */

const r1 = (x: number) => Math.round(x * 100) / 100;

export function abasDaProgramacao(m: Montado, c: Calculo): AbaXlsx[] {
  const e = m.entrada;
  const alertas = new Map<string, string[]>();
  for (const a of c.alertas) alertas.set(a.linhaId, [...(alertas.get(a.linhaId) ?? []), a.texto]);
  const col = (...ts: [string, number?][]) => ts.map(([titulo, largura]) => ({ titulo, largura }));
  const abas: AbaXlsx[] = [
    {
      nome: "Programação",
      colunas: col(["Data", 11], ["Dia", 6], ["Semana", 8], ["Turno", 6], ["Ativo", 22], ["Equipamentos", 30], ["Mês IP19", 9], ["HH MEC", 9], ["HH ELE", 9],
        ["HH total", 9], ["Parada", 9], ["Situação", 30], ["Itens IP19", 9], ["Tipo", 14], ["Grupo crítico", 18], ["Acima MEC", 9], ["Acima ELE", 9],
        ["Campo(s)", 24], ["Alerta", 40]),
      linhas: c.r.linhas.map((l) => [dataBr(l.data), NOME_DIA[partes(l.data).semana], semanaIso(l.data).semana, `${l.turno}º`, l.ativo,
        (e.ativos[l.ativo]?.equipamentos ?? []).join(", "), l.mes, r1(l.hh.mec), r1(l.hh.ele), r1(l.hh.mec + l.hh.ele),
        l.parada === 3 ? "extra" : `${l.parada} de ${l.paradasNoMes}`, l.marcas.join(" · "), l.itens.length, l.tipo, l.grupo ?? "", r1(l.acima.mec),
        r1(l.acima.ele), l.campos.join(", "), (alertas.get(l.id) ?? []).join("; ")]),
    },
    {
      nome: "Saldo HH",
      colunas: col(["Data", 11], ["Dia", 6], ["Situação", 22], ["1º turno: ativos", 30], ["1º cap. MEC"], ["1º cap. ELE"], ["1º HH MEC"], ["1º HH ELE"],
        ["1º saldo MEC"], ["1º saldo ELE"], ["2º turno: ativos", 30], ["2º cap. MEC"], ["2º cap. ELE"], ["2º HH MEC"], ["2º HH ELE"], ["2º saldo MEC"],
        ["2º saldo ELE"], ["Saldo p/ backlog MEC"], ["Saldo p/ backlog ELE"], ["Saldo p/ backlog total"], ["Acima MEC"], ["Acima ELE"]).map((x) => ({ ...x, largura: x.largura ?? 12 })),
      linhas: c.saldo.map((s) => [dataBr(s.data), s.dia, s.situacao,
        ...[s.t1, s.t2].flatMap((t) => [t.ativos.map((a) => a.ativo).join(", "), r1(t.cap.mec), r1(t.cap.ele), r1(t.hh.mec), r1(t.hh.ele), r1(t.saldo.mec), r1(t.saldo.ele)]),
        r1(s.backlog.mec), r1(s.backlog.ele), r1(s.total), r1(s.acima.mec), r1(s.acima.ele)]),
    },
    {
      nome: "Campos por dia",
      colunas: col(["Data", 11], ["Dia", 6], ["Semana", 8], ["Situação", 22], ["Máquinas", 9], ["1º turno", 50], ["2º turno", 50], ["Lista (colar no SAP)", 50]),
      linhas: camposPorDia(c.r, c.dias, e.ativos, e.parametros).map((d) => [dataBr(d.data), d.dia, d.semana, d.situacao, d.maquinas, d.t1.join(" | "), d.t2.join(" | "), d.lista]),
    },
    {
      nome: "Ativos sem HH",
      colunas: col(["Ativo", 22], ["Campo(s)", 24], ["Equipamentos", 30], ["Mês", 9], ["1ª data IP19", 11], ["HH MEC", 9], ["HH ELE", 9], ["HH total", 9], ["Itens", 7], ["Motivo", 60]),
      linhas: ativosSemHh(c.r, e.ativos).map((a) => [a.ativo, a.campos.join(", "), a.equipamentos.join(", "), a.mes, dataBr(a.primeiraData), r1(a.hh.mec),
        r1(a.hh.ele), r1(a.total), a.itens, a.motivo]),
    },
    {
      nome: "Retirados",
      colunas: col(["Ativo", 22], ["Mês", 9], ["HH MEC", 9], ["HH ELE", 9], ["Motivo", 60]),
      linhas: c.r.retirados.map((x) => [x.ativo, x.mes, r1(x.hh.mec), r1(x.hh.ele), x.motivo]),
    },
  ];
  if (m.foraDasClasses.length) {
    abas.push({
      nome: "Fora das classes",
      colunas: col(["Ativo", 30], ["Denominação", 36], ["Campo(s)", 24], ["Equipamentos", 30], ["HH MEC", 9], ["HH ELE", 9], ["Itens", 7]),
      linhas: m.foraDasClasses.map((a) => [a.ativo, a.denominacao, a.campos.join(", "), a.equipamentos.join(", "), r1(a.hh.mec), r1(a.hh.ele), a.itens]),
    });
  }
  abas.push({
    nome: "Verificação",
    colunas: col(["Conferência", 11], ["O que confere", 60], ["Resultado", 11], ["Detalhe", 70], ["Onde conferir", 30]),
    linhas: c.conferencias.map((x) => [x.id, x.texto, x.resultado, x.detalhe ?? "", x.abas]),
  });
  return abas;
}
