/**
 * Frase motivacional do dia (o astronauta da tela de entrada fala uma por dia). Sorteio repetível pela data de Brasília:
 * a lista é embaralhada a cada volta, então nenhuma frase se repete até todas terem saído, e duas voltas seguidas nunca
 * emendam a mesma frase (sem repetir em dias seguidos).
 */
export const FRASES: readonly string[] = [
  "Manutenção bem feita hoje é a máquina rodando amanhã.",
  "Segurança em primeiro lugar: nenhuma meta vale um acidente.",
  "Quem conhece o equipamento escuta o que ele está dizendo.",
  "Cada ordem fechada com capricho é um problema a menos amanhã.",
  "Prevenir custa menos do que consertar às pressas.",
  "Equipe que se ajuda resolve mais rápido e com menos risco.",
  "O detalhe que você confere hoje evita a parada de amanhã.",
  "Bom dia, time! Hoje é dia de fazer bem feito na primeira vez.",
  "Registrar o que foi feito também é manutenção.",
  "A causa raiz vale mais do que a troca rápida.",
  "Ferramenta no lugar, área limpa, trabalho seguro.",
  "Um bom diagnóstico é metade do conserto.",
  "Pergunte, confira, bloqueie: energia zero antes de começar.",
  "Pequenas melhorias todos os dias viram grandes resultados.",
  "Quem cuida da máquina cuida de quem trabalha nela.",
  "Planejar bem é ganhar tempo na execução.",
  "Lubrificação em dia é vida longa para o equipamento.",
  "A melhor quebra é aquela que nunca aconteceu.",
  "Compartilhe o que você aprendeu: o time inteiro fica mais forte.",
  "Peça certa, no lugar certo, na hora certa.",
  "Inspeção feita com atenção encontra o problema ainda pequeno.",
  "O padrão é o ponto de partida para melhorar.",
  "Cada ativo confiável é uma linha produzindo com tranquilidade.",
  "Faça hoje a manutenção que você gostaria de encontrar amanhã.",
  "Sem pressa para a segurança, com foco para a solução.",
  "Ouvir o operador é o primeiro passo do diagnóstico.",
  "Organização economiza tempo que ninguém vê, mas todo mundo sente.",
  "Disciplina nas pequenas tarefas sustenta os grandes resultados.",
  "Toda falha ensina algo: anote, analise e não repita.",
  "Confiabilidade se constrói um dia de cada vez.",
  "Um time alinhado vale mais do que qualquer ferramenta.",
  "Qualidade é fazer certo mesmo quando ninguém está olhando.",
  "Antes de apertar o botão, olhe em volta.",
  "Hoje é um ótimo dia para deixar algo melhor do que encontrou.",
  "Manutenção é cuidado: com a máquina, com o produto e com as pessoas.",
  "Os números do painel contam a história do nosso trabalho.",
  "Atenção aos sinais: ruído, vibração e temperatura falam.",
  "Material bem cadastrado é estoque que aparece quando precisa.",
  "Cada preventiva cumprida é uma corretiva a menos.",
  "Comunicação clara evita retrabalho.",
  "Respeite o bloqueio: ele protege você e quem está ao lado.",
  "Ninguém sabe tudo, mas juntos a gente resolve.",
  "O conserto termina quando a causa não volta.",
  "Seja a referência de segurança que você quer ver na fábrica.",
  "Planejamento, execução e registro: o ciclo que faz a diferença.",
  "Uma boa troca de turno começa com informação completa.",
  "Cuide do seu EPI como ele cuida de você.",
  "Persistência resolve o que a pressa só esconde.",
  "Melhoria contínua começa com uma pergunta: dá para fazer melhor?",
  "A fábrica funciona porque a manutenção não para.",
  "Rumo ao espaço: cada pilar forte leva o foguete mais longe.",
  "Zero acidente é escolha de todo dia.",
  "Bom trabalho é aquele que deixa a próxima equipe tranquila.",
  "Conhecimento técnico cresce quando é dividido.",
  "Antecipe-se: o melhor momento de agir é antes da falha.",
  "Orgulho do trabalho bem feito não tem preço.",
  "Máquina limpa mostra o problema antes que ele cresça.",
  "Confie no processo, confira o resultado.",
  "Cada dia sem parada não planejada é uma vitória do time.",
  "Vamos juntos: manutenção forte, produção segura.",
];

/** Data de Brasília no formato AAAA-MM-DD. */
export const hojeBrasil = (agora = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);

function embaralhar(n: number, semente: number): number[] {
  const ordem = Array.from({ length: n }, (_, i) => i);
  let s = (semente * 2654435761) % 2147483647 || 1;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  }
  return ordem;
}

/** Ordem da volta `volta`, garantindo que não começa com a frase que terminou a volta anterior. */
function ordemDaVolta(volta: number, n: number): number[] {
  const ordem = embaralhar(n, volta + 1);
  if (volta > 0 && n > 1) {
    const anterior = embaralhar(n, volta);
    if (ordem[0] === anterior[n - 1]) [ordem[0], ordem[1]] = [ordem[1], ordem[0]];
  }
  return ordem;
}

/** A frase do dia `data` (AAAA-MM-DD): cada volta pela lista inteira, sem repetir. */
export function fraseDoDia(data: string, frases: readonly string[] = FRASES): string {
  const dia = Math.floor(Date.parse(`${data}T12:00:00Z`) / 86_400_000);
  const n = frases.length;
  const volta = Math.floor(dia / n);
  return frases[ordemDaVolta(volta, n)[((dia % n) + n) % n]];
}
