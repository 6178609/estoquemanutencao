/**
 * Frases motivacionais do astronauta da tela de entrada. A cada vez que o balão aparece, sai a próxima de uma ordem
 * sorteada: nenhuma se repete até todas terem saído, e a primeira de uma nova volta nunca é a última da anterior.
 * A posição fica no navegador (localStorage), então recarregar a página continua a sequência sem repetir.
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

export interface Sorteio { ordem: number[]; pos: number }

/** Embaralha 0..n-1 (Fisher-Yates) com o gerador `rnd` (0 ≤ x < 1). */
export function embaralhar(n: number, rnd: () => number): number[] {
  const ordem = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  }
  return ordem;
}

/** Sorteio guardado é válido para uma lista de `n` frases? */
const valido = (s: unknown, n: number): s is Sorteio => {
  const o = s as Sorteio | null;
  return !!o && Array.isArray(o.ordem) && o.ordem.length === n && Number.isInteger(o.pos) && o.pos >= 0 && o.pos <= n
    && new Set(o.ordem).size === n && o.ordem.every((i) => Number.isInteger(i) && i >= 0 && i < n);
};

/**
 * A próxima frase e o novo estado do sorteio. Terminada a volta (ou sem estado válido), sorteia outra ordem, sem começar
 * pela frase que acabou de sair.
 */
export function proximaFrase(estado: unknown, rnd: () => number = Math.random, n = FRASES.length): { indice: number; estado: Sorteio } {
  let s: Sorteio = valido(estado, n) ? { ordem: [...estado.ordem], pos: estado.pos } : { ordem: embaralhar(n, rnd), pos: 0 };
  if (s.pos >= n) {
    const ultima = s.ordem[n - 1];
    const ordem = embaralhar(n, rnd);
    if (n > 1 && ordem[0] === ultima) [ordem[0], ordem[1]] = [ordem[1], ordem[0]];
    s = { ordem, pos: 0 };
  }
  return { indice: s.ordem[s.pos], estado: { ordem: s.ordem, pos: s.pos + 1 } };
}
