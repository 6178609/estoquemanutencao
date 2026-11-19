import {
  CENTROS_SUGERIDOS, TURNOS_PROGRAMACAO, TURNOS_TECNICO, datasDoPeriodo, diaDaSemana, hojeIso, isoValida, periodoDaVisao,
  somarDias, type Periodo, type Programacao, type Status, type Tecnico,
} from "./regras";

/**
 * Dados FICTÍCIOS da Controle de HH, para a demonstração (nada daqui é da empresa). Gerador com semente fixa: o mesmo
 * `hoje` sempre dá os mesmos técnicos e programações.
 */

const AREAS = ["Mecânica", "Elétrica", "Instrumentação", "Utilidades"];
const EQUIPAMENTOS = ["PRENSA-01", "PRENSA-02", "PRENSA-03", "MISTURADOR-01", "MISTURADOR-02", "EXTRUSORA-01", "INJETORA-01",
  "INJETORA-02", "VULCANIZADORA-01", "COMPRESSOR-01"];
const TIPOS_ORDEM = ["YM11", "YM12", "YM13", "YM14", "YM15", "YM16", "YM17", "YM18", "YM19", "YM20"];
const DESCRICOES = ["Troca de rolamento", "Inspeção de vazamento", "Ajuste de pressão", "Lubrificação geral",
  "Substituição de correia", "Calibração de sensor", "Revisão do painel elétrico", "Troca de mangueira hidráulica",
  "Limpeza do filtro", "Alinhamento de eixo"];

/** Gerador pseudoaleatório com semente (mulberry32): mesma semente, mesma sequência. */
function geradorComSemente(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function agendaDemo(hoje: string): { tecnicos: Tecnico[]; programacoes: Programacao[] } {
  const ref = isoValida(hoje) ? hoje : hojeIso();
  const rnd = geradorComSemente(20261119);
  const semana: Periodo = periodoDaVisao("semana", ref);
  const mes: Periodo = periodoDaVisao("mes", ref);

  const tecnicos: Tecnico[] = ["A", "B", "C", "D", "E", "F", "G", "H"].map((letra, i) => {
    const de_ferias = i === 2; // Técnico C: férias na semana de referência
    return {
      id: `demo_t${i + 1}`,
      nome: `Técnico ${letra}`,
      np: String(1000001 + i),
      centro: CENTROS_SUGERIDOS[i % CENTROS_SUGERIDOS.length],
      area: AREAS[i % AREAS.length],
      turno: TURNOS_TECNICO[i % TURNOS_TECNICO.length],
      jornada: i % 2 === 0 ? 8 : 8.8,
      feriasInicio: de_ferias ? semana.ini : null,
      feriasFim: de_ferias ? semana.fim : null,
      folga: i === 5 ? somarDias(semana.ini, 3) : null, // Técnico F: folga na quinta da semana
      foto: "",
    };
  });

  const estaDeFerias = (t: Tecnico, data: string) => !!t.feriasInicio && !!t.feriasFim && data >= t.feriasInicio && data <= t.feriasFim;

  const criar = (n: number, data: string, t: Tecnico, minutos: number): Programacao => {
    const passado = data < ref;
    const r = rnd();
    const status: Status = passado ? (r < 0.85 ? "concluida" : "reprogramada") : (r < 0.2 ? "reprogramada" : "programada");
    const criadoEm = `${somarDias(data, -6)}T10:00:00.000Z`;
    const historico = status === "reprogramada"
      ? [{ de: somarDias(data, -2), para: data, em: `${somarDias(data, -3)}T15:00:00.000Z`, por: "Planejador Demo" }]
      : [];
    return {
      id: `demo_p${n}`,
      equipamento: EQUIPAMENTOS[Math.floor(rnd() * EQUIPAMENTOS.length)],
      tipoOrdem: TIPOS_ORDEM[Math.floor(rnd() * TIPOS_ORDEM.length)],
      ordem: String(9000000 + n),
      descricao: DESCRICOES[Math.floor(rnd() * DESCRICOES.length)],
      area: t.area,
      data,
      turno: TURNOS_PROGRAMACAO[Math.floor(rnd() * TURNOS_PROGRAMACAO.length)],
      status,
      minutos,
      tecnicoId: t.id,
      tecnicoNome: t.nome,
      np: t.np,
      criadoEm,
      historico,
    };
  };

  // dias úteis do mês (segunda a sexta)
  const diasUteis = datasDoPeriodo(mes).filter((d) => diaDaSemana(d) % 6 !== 0);
  const programacoes: Programacao[] = [];
  for (let i = 0; i < 37; i++) {
    const data = diasUteis[Math.floor(rnd() * diasUteis.length)];
    let t = tecnicos[Math.floor(rnd() * tecnicos.length)];
    if (estaDeFerias(t, data)) t = tecnicos[0];
    const minutos = 30 + 15 * Math.floor(rnd() * 31); // 30 a 480 min, de 15 em 15
    programacoes.push(criar(i + 1, data, t, minutos));
  }
  // sobrecarga: três ordens do Técnico A no mesmo dia (720 min em jornada de 8 h)
  const diaSobrecarga = diasUteis[3];
  [300, 240, 180].forEach((minutos, k) => programacoes.push(criar(38 + k, diaSobrecarga, tecnicos[0], minutos)));

  programacoes.sort((a, b) => a.data.localeCompare(b.data) || a.ordem.localeCompare(b.ordem));
  return { tecnicos, programacoes };
}
