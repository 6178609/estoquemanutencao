import type { Base } from "../dados/bases";
import {
  marcarQuebras, prepararConfirmacoes, prepararEquipamentos, prepararEquipe, prepararIw38, prepararNotas, prepararOperacoes,
  prepararRequisicoes, tiposPorOrdem, type Crua,
} from "./preparo";
import { dataBr, type Dia } from "./util";

/**
 * Demonstração: exports do SAP FICTÍCIOS (nomes, equipamentos e números inventados), gerados no mesmo formato dos
 * arquivos reais e passados pelo mesmo preparo — o site em modo demo mostra todas as abas funcionando.
 * Determinístico (semente fixa) para a tela não mudar a cada recarga.
 */
function gerador(semente: number) {
  let a = semente >>> 0;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, int: (min: number, max: number) => min + Math.floor(r() * (max - min + 1)), um: <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)] };
}

const AREAS = ["GAL1", "GAL2", "GAL3", "UTIL"];
const CENTROS = ["MEC_COMP", "ELE_COMP", "MEC_MONT", "ELE_MONT", "MEC_UTIL", "ELE_UTIL", "MEC_CORT", "LUBRIF"];
const FAMILIAS = ["Prensa hidráulica", "Injetora", "Esteira de montagem", "Compressor", "Caldeira", "Máquina de corte",
  "Robô de cola", "Forno de vulcanização", "Torre de resfriamento", "Bomba de recalque"];
const SERVICOS = ["Trocar rolamento", "Ajustar correia", "Inspecionar painel elétrico", "Lubrificar redutor", "Substituir vedação",
  "Calibrar sensor", "Reapertar conexões", "Trocar resistência", "Limpar trocador de calor", "Revisar cilindro"];
const NOMES = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabriela", "Hugo", "Íris", "João", "Karen", "Lucas",
  "Marina", "Nilo", "Olga", "Paulo", "Quitéria", "Rafael", "Sara", "Tiago", "Úrsula", "Vítor"];
const CARGOS = ["Mecânico de manutenção", "Eletricista de manutenção", "Eletromecânico", "Lubrificador", "Supervisor de manutenção", "Analista de PCM"];

const memo: { dia?: number; valor?: ReturnType<typeof gerar> } = {};

function gerar(hoje: Dia) {
  const g = gerador(26);
  const equipamentos = Array.from({ length: 48 }, (_, i) => {
    const fam = FAMILIAS[i % FAMILIAS.length];
    return { codigo: String(10_000_100 + i), nome: `${fam} ${String(Math.floor(i / FAMILIAS.length) + 1).padStart(2, "0")}`,
      area: AREAS[i % AREAS.length], abc: i % 5 === 0 ? "A" : i % 3 === 0 ? "C" : "B", centro: CENTROS[i % CENTROS.length] };
  });
  const ih08: Crua[] = equipamentos.map((e) => ({ Equipamento: e.codigo, "Denominação": e.nome, "Localização": e.area,
    "Código ABC": e.abc, "Local de instalação": `F26-${e.area}-${e.codigo.slice(-3)}` }));
  const equipe = Array.from({ length: 22 }, (_, i) => ({ np: String(7_000_100 + i), nome: `${NOMES[i]} ${String.fromCharCode(65 + (i * 7) % 26)}. Exemplo`,
    cargo: i < 2 ? CARGOS[4 + i] : CARGOS[i % 4], centro: CENTROS[i % CENTROS.length] }));
  const equipeCrua: Crua[] = equipe.map((p, i) => ({ "Nº pessoal": p.np, Nome: p.nome, Cargo: p.cargo, "Centro trabalho": p.centro,
    "Área": AREAS[i % 4], Turma: ["A", "B", "C"][i % 3], Supervisor: equipe[0].nome }));

  const iw38: Crua[] = [], iw38op: Crua[] = [], iw47: Crua[] = [], iw28: Crua[] = [], ip19: Crua[] = [];
  let numOrdem = 4_100_000, numNota = 10_500_000;
  const inicio = hoje - 470;
  for (let d = inicio; d <= hoje + 45; d++) {
    const porDia = d > hoje ? g.int(0, 3) : g.int(3, 9);
    for (let k = 0; k < porDia; k++) {
      const e = g.um(equipamentos);
      const r = g.r();
      const tipo = r < 0.52 ? "YM01" : r < 0.62 ? "YM03" : r < 0.78 ? "YM11" : r < 0.92 ? "YM12" : "YM13";
      const comPlano = tipo === "YM01" || tipo === "YM03";
      const ordem = String(++numOrdem);
      const fimBase = d + (comPlano ? g.int(0, 3) : g.int(1, 10));
      const passado = d < hoje - 3;
      const concluida = passado && g.r() < (comPlano ? 0.9 : 0.82);
      const status = d > hoje ? "ABER" : concluida ? "LIB CONF ENTE" : g.r() < 0.12 ? "LIB ENCE" : g.r() < 0.6 ? "LIB" : "ABER";
      const servico = g.um(SERVICOS);
      const custo = Math.round((comPlano ? 300 + g.r() * 1800 : 600 + g.r() * 6500) * 100) / 100;
      iw38.push({ Ordem: ordem, "Tipo de ordem": tipo, Prioridade: tipo === "YM11" ? "1" : "3", "Texto breve": `${servico} ${e.nome}`.toUpperCase(),
        Equipamento: e.codigo, "Denominação do objeto técnico": e.nome, "Denominação do loc.instalação": `${e.area} - linha ${e.codigo.slice(-1)}`,
        "Centro trab.responsável": e.centro, "Localização": e.area, Centro: "F26",
        "Plano de manutenção": comPlano ? String(80_000 + (Number(e.codigo) % 97)) : "", "Status do sistema": status,
        "Status usuário": d > hoje ? "PRO" : "", "Data-base do início": dataBr(d), "Data-base do fim": dataBr(fimBase),
        "Data de entrada": dataBr(d - g.int(0, 12)), "Criado por": `PCM${(Number(ordem) % 4) + 1}`,
        "Custos tot.reais": concluida || status.includes("LIB") ? custo.toFixed(2).replace(".", ",") : "0",
        "Custos tot.planejados": (custo * 0.9).toFixed(2).replace(".", ",") });
      const nOps = g.int(1, 3);
      for (let o = 1; o <= nOps; o++) {
        const horas = comPlano ? g.int(1, 4) : g.int(2, 8);
        const pessoas = g.int(1, 2);
        const fimReal = concluida ? d + g.int(0, fimBase - d + (g.r() < 0.15 ? 4 : 0)) : null;
        iw38op.push({ Ordem: ordem, "Operação": String(o * 10).padStart(4, "0"), "Tipo de ordem": tipo, "Centro de trabalho": e.centro,
          Equipamento: e.codigo, "Denominação do objeto técnico": e.nome, "Txt.breve operação": servico, Trabalho: String(horas),
          "Unidade do trabalho": "H", "Número": String(pessoas), "Status do sistema": concluida ? "CONF" : "LIB",
          "1ª data de início": dataBr(d), "Data do fim real": fimReal != null ? dataBr(fimReal) : "" });
        if (fimReal != null) {
          for (let p = 0; p < pessoas; p++) {
            const pes = equipe[(Number(ordem) + p * 5) % equipe.length];
            iw47.push({ "Nº pessoal": pes.np, "Nome do empregado": pes.nome, Ordem: ordem, "Operação": String(o * 10).padStart(4, "0"),
              "Status do sistema": "CONF", "Trabalho real": (horas * (0.8 + g.r() * 0.5)).toFixed(1).replace(".", ","), "Unid.trabalho real": "H",
              "Centro trab.real": e.centro, "Tp.atividade real": "MANUT", "Data lançamento": dataBr(fimReal), "Tipo ordem": tipo,
              Equipamento: e.codigo, "Texto de confirmação": "Serviço executado" });
          }
        }
      }
      // notas: quebras (Y1 → YM11) e solicitações (Y2)
      if (tipo === "YM11" || (!comPlano && g.r() < 0.3)) {
        const parada = tipo === "YM11" ? (0.5 + g.r() * 5).toFixed(1).replace(".", ",") : "";
        iw28.push({ Nota: String(++numNota), Ordem: ordem, "Tipo de nota": tipo === "YM11" ? "Y1" : "Y2", "Descrição": `${servico} - falha`.toUpperCase(),
          Equipamento: e.codigo, "Denominação do objeto técnico": e.nome, "Denominação do loc.instalação": `${e.area} - linha ${e.codigo.slice(-1)}`,
          "Centro trab.respons.": e.centro, "Localização": e.area, Notificador: "OPERADOR", Parada: tipo === "YM11" ? "X" : "",
          "Duração da parada": parada, "Início avaria": dataBr(d), "Fim avaria": dataBr(d), "Data da nota": dataBr(d),
          "Criado por": "OPER1", "Código ABC": e.abc });
      }
    }
    // preditiva: anomalias SEMEQ (nota de detecção; algumas já com ordem de tratativa)
    if (d <= hoje && d > hoje - 300 && g.r() < 0.12) {
      const e = g.um(equipamentos);
      const tec = g.um(["AVB", "TMP", "AOL", "UTS"]);
      const achado = g.um(["DESALINHAMENTO", "DESBALANCEAMENTO", "AQUECIMENTO EM CONEXÃO", "FOLGA MECÂNICA", "CONTAMINAÇÃO DO ÓLEO"]);
      const comOrdem = g.r() < 0.75;
      const ordem = comOrdem ? String(++numOrdem) : "";
      const texto = `SEMEQ-${tec}-${String(g.int(1, 9999)).padStart(4, "0")} ${achado}`;
      if (comOrdem) {
        const tratada = d < hoje - 20 && g.r() < 0.7;
        iw38.push({ Ordem: ordem, "Tipo de ordem": "YM03", Prioridade: "2", "Texto breve": texto, Equipamento: e.codigo,
          "Denominação do objeto técnico": e.nome, "Centro trab.responsável": e.centro, "Localização": e.area, Centro: "F26",
          "Plano de manutenção": "", "Status do sistema": tratada ? "LIB CONF ENTE" : "LIB", "Data-base do início": dataBr(d + 2),
          "Data-base do fim": dataBr(d + 15), "Data de entrada": dataBr(d), "Custos tot.reais": tratada ? "850,00" : "0" });
        iw38op.push({ Ordem: ordem, "Operação": "0010", "Tipo de ordem": "YM03", "Centro de trabalho": e.centro, Equipamento: e.codigo,
          "Txt.breve operação": achado, Trabalho: "3", "Unidade do trabalho": "H", "Número": "1", "Status do sistema": tratada ? "CONF" : "LIB",
          "1ª data de início": dataBr(d + 2), "Data do fim real": tratada ? dataBr(d + g.int(4, 25)) : "" });
      }
      iw28.push({ Nota: String(++numNota), Ordem: ordem, "Tipo de nota": "Y3", "Descrição": texto, Equipamento: e.codigo,
        "Denominação do objeto técnico": e.nome, "Centro trab.respons.": e.centro, "Localização": e.area, "Data da nota": dataBr(d),
        "Código ABC": e.abc });
    }
    if (d <= hoje && g.r() < 0.35) {
      const e = g.um(equipamentos);
      iw28.push({ Nota: String(++numNota), Ordem: "", "Tipo de nota": "Y2", "Descrição": "SOLICITAÇÃO DE SERVIÇO", Equipamento: e.codigo,
        "Denominação do objeto técnico": e.nome, "Centro trab.respons.": e.centro, "Localização": e.area, "Data da nota": dataBr(d),
        "Código ABC": e.abc });
    }
  }
  // planos: chamadas semanais/quinzenais dos últimos meses e as próximas
  for (let p = 0; p < 30; p++) {
    const e = equipamentos[p];
    const ciclo = p % 3 === 0 ? 14 : p % 3 === 1 ? 28 : 7;
    for (let d = hoje - 180 + (p % 7); d <= hoje + 60; d += ciclo) {
      const vencida = d < hoje;
      const tp = !vencida ? "Espera" : g.r() < 0.06 ? "Saltado" : g.r() < 0.86 ? "Concluído" : "Chamado";
      ip19.push({ "Plano de manutenção": String(80_000 + p), "Item de manutenção": "1", "Texto do plano": `Preventiva ${e.nome}`,
        Equipamento: e.codigo, "Denominação do objeto": e.nome, "Centro de trabalho": e.centro, Ciclo: `${ciclo} DIA`,
        "Tipo de ordem": "YM01", Trabalho: String(2 + (p % 4)), "Unidade do trabalho": "H", "Data planejada": dataBr(d),
        "Data de chamada": dataBr(d - 7), "Data de conclusão": tp === "Concluído" ? dataBr(d + (p % 3)) : "", "Tipo de programação": tp, Ordem: "" });
    }
  }
  const req: Crua[] = Array.from({ length: 60 }, (_, i) => {
    const env = hoje - ((i * 11) % 75);
    const pend = i % 3 !== 0;
    return { "Número da requisição": String(1_200_000 + i), "Número da PO": pend ? "" : String(4_500_000 + i),
      Status: pend ? "Pendente de aprovação" : "Aprovado", "Aprovador atual": pend ? `Aprovador ${(i % 4) + 1}` : "",
      "Solicitado por": equipe[i % equipe.length].nome, Itens: `${g.um(SERVICOS)} - peças`, Justificativa: "Reposição de estoque",
      "Enviado em": dataBr(env), "Último envio": dataBr(env + (i % 2)), Total: (800 + ((i * 937) % 24_000)).toFixed(2).replace(".", ",") };
  });
  const af: Crua[] = [], acoes: Crua[] = [];
  const quebrasA = iw28.filter((n) => n["Tipo de nota"] === "Y1").filter((_, i) => i % 6 === 0);
  quebrasA.forEach((n, i) => {
    const falha = diaDe(String(n["Data da nota"]));
    const limite = falha + 15;
    const analisada = limite < hoje - 3 ? g.r() < 0.85 : g.r() < 0.4;
    const dataAnalise = analisada ? falha + g.int(3, 20) : null;
    const num = `AF-${String(i + 1).padStart(4, "0")}`;
    af.push({ "Nº da análise": num, "Tipo de análise": "5 Porquês", "Área": String(n["Localização"]), "Área da falha": String(n["Localização"]),
      "Cód. SAP": String(n.Equipamento), Equipamento: String(n["Denominação do objeto técnico"]), Pilar: "MP", "Causa raiz": "Desgaste natural",
      Especialidade: i % 2 ? "Mecânica" : "Elétrica", Criticidade: String(n["Código ABC"] || "B"), "O.S corretiva": String(n.Ordem),
      "Resumo da falha": String(n["Descrição"]), "Duração da parada": String(n["Duração da parada"] || "1"), Supervisor: equipe[0].nome,
      Turno: "A", "Status da análise": analisada ? (dataAnalise! <= limite ? "AP" : "AFP") : "", "Data da falha": dataBr(falha),
      "Data limite": dataBr(limite), "Data da análise": dataAnalise != null ? dataBr(dataAnalise) : "", "Status das ações": analisada ? "0,6" : "0" });
    if (analisada) for (let a = 1; a <= 2; a++) {
      const lim = dataAnalise! + 20 * a;
      const feita = lim < hoje ? g.r() < 0.8 : g.r() < 0.3;
      acoes.push({ "Nº da análise": num, "Nº da ação": String(a), "Tipo de análise": "5 Porquês", "Área": String(n["Localização"]),
        "Cód. SAP": String(n.Equipamento), Equipamento: String(n["Denominação do objeto técnico"]), Especialidade: "Mecânica",
        "Ação": a === 1 ? "Substituir componente por modelo reforçado" : "Incluir inspeção no plano preventivo", "Causa raiz": a === 1 ? "X" : "",
        Padronização: a === 2 ? "X" : "", Supervisor: equipe[0].nome, "Responsável": equipe[(i + a) % equipe.length].nome,
        Status: feita ? "Concluída" : "Em andamento", "Data de início": dataBr(dataAnalise!), "Data limite": dataBr(lim),
        "Data realizada": feita ? dataBr(lim - g.int(0, 8) + (g.r() < 0.2 ? 10 : 0)) : "" });
    }
  });
  return { ih08, equipeCrua, iw38, iw38op, iw47, iw28, ip19, req, af, acoes };
}

function diaDe(s: string): Dia {
  const [d, m, a] = s.split("/").map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / 86_400_000);
}

const base = <T,>(dados: T, hoje: Dia): Base<T> => ({ dados, atualizado: new Date((hoje - 1) * 86_400_000 + 9 * 3_600_000).toISOString(), origem: "demonstração" });

export function basesDemo(hoje: Dia) {
  if (memo.dia !== hoje) { memo.valor = gerar(hoje); memo.dia = hoje; }
  const g = memo.valor!;
  const ordens = prepararIw38(g.iw38, hoje).ordens, oper = prepararOperacoes(g.iw38op), conf = prepararConfirmacoes(g.iw47);
  const notas = marcarQuebras(prepararNotas(g.iw28, hoje), tiposPorOrdem(ordens, oper, conf));
  return {
    ordens: base(ordens, hoje), notas: base(notas, hoje), operacoes: base(oper, hoje), confirmacoes: base(conf, hoje),
    equipamentos: base(prepararEquipamentos(g.ih08), hoje), equipe: base(prepararEquipe(g.equipeCrua), hoje),
    requisicoes: base(prepararRequisicoes(g.req, hoje), hoje),
    cruas: { ip19: base(g.ip19, hoje), af: base(g.af, hoje), acoesAf: base(g.acoes, hoje) }, hoje,
  };
}
