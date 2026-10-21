/**
 * Base de conhecimento técnico da aba Suporte Técnico.
 * Conteúdo genérico de manutenção industrial (nada da empresa): sintomas, causas prováveis, verificações em ordem,
 * ações e boas práticas. Valores de referência citados são os usuais; prevalece sempre o manual do fabricante.
 */

export type Area =
  | "mecanica"
  | "lubrificacao"
  | "eletrica"
  | "fluidos"
  | "seguranca"
  | "metodos"
  | "pcm_sap"
  | "indicadores";

export const AREAS: { id: Area; titulo: string; descricao: string }[] = [
  { id: "mecanica", titulo: "Mecânica", descricao: "Rolamentos, correias, alinhamento, acoplamentos, redutores e vibração." },
  { id: "lubrificacao", titulo: "Lubrificação", descricao: "Graxas, óleos, intervalos, quantidades e contaminação." },
  { id: "eletrica", titulo: "Elétrica", descricao: "Motores, inversores, contatores, aterramento, medições e NR-10." },
  { id: "fluidos", titulo: "Pneumática e hidráulica", descricao: "FRL, cilindros, válvulas, vazamentos de ar e unidades hidráulicas." },
  { id: "seguranca", titulo: "Segurança", descricao: "NR-12, bloqueio e etiquetagem (LOTO), permissão de trabalho e EPIs." },
  { id: "metodos", titulo: "Métodos e ferramentas", descricao: "TPM e pilares WCM, 5 Porquês, Ishikawa, análise de falha, FMEA, PDCA e Kaizen." },
  { id: "pcm_sap", titulo: "PCM e SAP", descricao: "Tipos de ordem, transações, fluxo da nota ao encerramento e planos de manutenção." },
  { id: "indicadores", titulo: "Indicadores", descricao: "MTBF, MTTR, disponibilidade, backlog, aderência à programação e custo." },
];

export interface Guia {
  id: string;
  area: Area;
  titulo: string;
  resumo: string;
  palavras: string[];
  sintomas?: string[];
  causas?: string[];
  verificar?: string[];
  acoes?: string[];
  praticas?: string[];
  texto?: string[];
  links?: { rotulo: string; rota: string }[];
}

export const GUIAS: Guia[] = [
  // ───────────── Mecânica ─────────────
  {
    id: "rolamentos",
    area: "mecanica",
    titulo: "Rolamentos e mancais",
    resumo: "Falhas mais comuns de rolamentos: lubrificação, contaminação, desalinhamento, sobrecarga, ajuste errado e erosão elétrica.",
    palavras: ["rolamento", "mancal", "esferas", "rolos", "aquecimento do mancal", "ruido no rolamento"],
    sintomas: [
      "Aquecimento do mancal acima do normal (ou que sobe com o tempo).",
      "Ruído de rolamento: zumbido, chiado ou batida metálica.",
      "Vibração crescente na direção radial ou em um só ponto.",
      "Graxa escura, endurecida ou com partículas metálicas; marcas de corrosão na pista.",
    ],
    causas: [
      "Falta ou excesso de lubrificante (falha de lubrificação é a causa mais comum).",
      "Contaminação por poeira, água ou partículas abrasivas.",
      "Desalinhamento de eixo ou de carcaça, ou eixo empenado.",
      "Sobrecarga: tensão de correia ou de acoplamento acima do projeto.",
      "Ajuste errado: aperto excessivo no eixo ou na caixa, ou folga inadequada.",
      "Passagem de corrente elétrica pelo rolamento (erosão elétrica), comum em motores acionados por inversor sem proteção.",
    ],
    verificar: [
      "Desligar e bloquear o equipamento (LOTO) antes de qualquer toque.",
      "Conferir o nível e o tipo de lubrificante, e a data do último reengraxe.",
      "Medir temperatura e vibração do mancal e comparar com a leitura anterior.",
      "Observar o lubrificante: cor, consistência e presença de água ou partículas.",
      "Medir o alinhamento do acoplamento e a folga do rolamento.",
      "Verificar a tensão de correias e a carga real do motor (corrente).",
      "Inspecionar pistas e esferas/rolos na desmontagem: descoloração, escamação, marcas de corrente elétrica (microcrateras).",
    ],
    acoes: [
      "Lubrificação sem contaminação: limpar o bico de graxa antes, usar o tipo e a quantidade do manual.",
      "Corrigir a causa antes de trocar: alinhar, ajustar a carga, vedar o mancal contra água e poeira.",
      "Trocar o rolamento com ferramenta adequada e aquecimento controlado (sem bater no anel).",
      "Erosão elétrica: aterrar o eixo (anel de aterramento), usar rolamento isolado no lado não acionado e filtro dV/dt na saída do inversor.",
      "Registrar a causa raiz na nota e no histórico do equipamento.",
    ],
    praticas: [
      "Mantenha uma rotina de medição de vibração e temperatura, com tendência, para antecipar a falha.",
      "Monte o rolamento com peça de encaixe (não pelas esferas ou rolos) e confira a folga de montagem.",
      "Guarde o rolamento novo na embalagem até a hora da montagem.",
    ],
    links: [
      { rotulo: "Saúde dos ativos", rota: "/saude" },
      { rotulo: "Preditiva (SEMEQ)", rota: "/preditiva" },
    ],
  },
  {
    id: "correias_polias",
    area: "mecanica",
    titulo: "Correias em V e polias",
    resumo: "Correias patinando, trincadas ou desgastadas; tensão, alinhamento de polias e sinais de falha.",
    palavras: ["correia", "correias", "polia", "polias", "transmissao", "correia em v", "patinando"],
    sintomas: [
      "Correia patinando, ruído agudo na partida ou queda de rotação.",
      "Desgaste lateral ou trincas na correia; correia que escorrega para fora da polia.",
      "Vibração do conjunto e aquecimento dos rolamentos do motor ou do redutor.",
      "Polia com desgaste nos canais ou trincada.",
    ],
    causas: [
      "Tensão insuficiente (patinagem) ou excessiva (sobrecarrega rolamentos e eixo).",
      "Polias desalinhadas ou com eixos não paralelos.",
      "Correias de perfis ou comprimentos misturados em um mesmo conjunto.",
      "Óleo, graxa ou água nas correias e nas polias.",
      "Polia com canal gasto, o que faz a correia afundar e perder tração.",
    ],
    verificar: [
      "Desligar e bloquear o equipamento.",
      "Verificar a tensão: a flecha usual é de cerca de 1,6 % do vão entre os centros, com a força indicada pelo fabricante.",
      "Alinhar as polias com régua ou fio: o desvio entre os canais deve ser mínimo.",
      "Conferir se todas as correias do conjunto são do mesmo tipo, marca e comprimento.",
      "Olhar os canais das polias: desgaste em degraus ou ombros indica correia errada.",
    ],
    acoes: [
      "Ajustar a tensão e alinhar as polias antes de colocar nova correia.",
      "Trocar o conjunto completo quando houver correias de comprimento diferente ou desgastadas.",
      "Limpar óleo e graxa das polias e da correia; corrigir a fonte do vazamento.",
      "Substituir a polia quando o canal estiver gasto.",
    ],
    praticas: [
      "Registre a tensão e a data da troca na ficha do equipamento.",
      "Não use spray de silicone para fazer a correia parar de patinar: ele reduz a aderência e contamina o conjunto.",
    ],
    links: [{ rotulo: "Equipamentos", rota: "/equipamentos" }],
  },
  {
    id: "alinhamento_eixos",
    area: "mecanica",
    titulo: "Alinhamento de eixos",
    resumo: "Desalinhamento angular e paralelo entre motor e máquina: causas, medição e correção.",
    palavras: ["alinhamento", "desalinhamento", "eixo", "eixos", "laser", "paralelo", "angular"],
    sintomas: [
      "Vibração alta no sentido axial, com harmônicos da rotação (1x, 2x).",
      "Aquecimento e desgaste dos rolamentos e das vedações nos dois lados do acoplamento.",
      "Quebra recorrente do acoplamento ou da chaveta.",
    ],
    causas: [
      "Base ou pés do motor com folga ou apoio irregular (pé manco).",
      "Calços desgastados, quebrados ou empilhados sem critério.",
      "Tubulação ou dutos que forçam a máquina depois da montagem.",
      "Dilatação térmica não considerada no alinhamento a frio.",
      "Desgaste ou folga na fixação da máquina.",
    ],
    verificar: [
      "Verificar o pé manco: soltar cada parafuso e medir a folga antes de apertar.",
      "Conferir a folga do acoplamento e o estado da bucha ou elemento elástico.",
      "Medir o alinhamento com relógio comparador ou laser, nas duas direções (paralelo e angular).",
      "Checar a folga de todos os parafusos da base e dos mancais.",
      "Medir o alinhamento com a máquina na temperatura de operação, quando possível.",
    ],
    acoes: [
      "Corrigir a base e os calços antes de alinhar; evite empilhar muitos calços em um mesmo pé (em geral, não mais que 3), e use a menor espessura possível.",
      "Alinhar até as tolerâncias do fabricante do acoplamento e registrar os valores finais.",
      "Só reapertar os parafusos com o equipamento alinhado e com os tubos sem tensão.",
    ],
    praticas: [
      "Faça o alinhamento depois de qualquer troca de motor, rolamento, acoplamento ou base.",
      "Confira o alinhamento de novo após a primeira semana de operação.",
    ],
    links: [{ rotulo: "Análise de falhas: planos", rota: "/af_planos" }],
  },
  {
    id: "acoplamentos",
    area: "mecanica",
    titulo: "Acoplamentos",
    resumo: "Acoplamentos flexíveis e de disco: desgaste do elemento, folgas, quebras e como identificar a causa.",
    palavras: ["acoplamento", "acoplamentos", "luva", "elemento elastico", "junta", "cardan", "flexivel"],
    sintomas: [
      "Folga ou batida no acoplamento na partida e na parada.",
      "Elemento de borracha ou de disco trincado, rasgado ou com pó.",
      "Parafusos soltos ou quebrados no cubo.",
    ],
    causas: [
      "Desalinhamento acima da tolerância do fabricante.",
      "Torque ou rotação acima do nominal (partidas frequentes com carga).",
      "Lubrificação ausente ou errada nos acoplamentos de engrenagem.",
      "Folga de montagem: cubo mal encaixado no eixo.",
    ],
    verificar: [
      "Bloquear o equipamento e girar o acoplamento à mão: procurar folga ou ponto preso.",
      "Verificar o elemento elástico (trincas, deformação, cor).",
      "Medir o alinhamento e comparar com a tolerância do acoplamento.",
      "Conferir o torque dos parafusos e a folga do cubo no eixo.",
    ],
    acoes: [
      "Trocar o elemento elástico com o mesmo modelo e dureza do original.",
      "Corrigir o alinhamento antes de montar o novo elemento.",
      "Acoplamento de engrenagem: lubrificar com o lubrificante indicado e manter a graxa no nível.",
    ],
    praticas: ["Guarde o modelo e a dureza do elemento na ficha do equipamento, para a compra certa."],
  },
  {
    id: "redutores",
    area: "mecanica",
    titulo: "Redutores de engrenagens",
    resumo: "Aquecimento, ruído, vazamento de óleo e perda de rendimento em redutores: causas e primeiros cuidados.",
    palavras: ["redutor", "redutores", "caixa de engrenagem", "engrenagem", "vazamento de oleo redutor", "rosca sem fim"],
    sintomas: [
      "Aquecimento da carcaça acima da temperatura normal.",
      "Ruído de engrenamento, batida ou chiado.",
      "Vazamento de óleo pelos retentores ou respiro.",
      "Redução de torque ou patinagem da carga.",
    ],
    causas: [
      "Nível de óleo baixo ou alto (o alto também aquece e vaza pelo respiro).",
      "Óleo errado (viscosidade ou aditivo fora do indicado) ou contaminado com água e partículas.",
      "Desgaste de dentes, rolamentos ou folga excessiva.",
      "Sobrecarga e partidas repetidas com carga.",
      "Respiro entupido, o que aumenta a pressão interna e expulsa óleo pelas vedações.",
    ],
    verificar: [
      "Conferir o nível no visor, com o redutor parado e frio.",
      "Observar o óleo: cor, cheiro e presença de água (emulsão) ou partículas no dreno.",
      "Verificar o respiro e limpá-lo ou trocá-lo.",
      "Medir a temperatura da carcaça e comparar com a leitura normal da máquina.",
      "Medir a corrente do motor: comparar com a placa e com o histórico.",
      "Conferir o alinhamento com o motor e a fixação da base.",
    ],
    acoes: [
      "Ajustar o nível e trocar o óleo pelo tipo do manual, com drenagem completa e flushing quando houver contaminação.",
      "Trocar retentores quando houver vazamento, com o eixo sem marca profunda.",
      "Abrir o redutor só com diagnóstico que aponte dente ou rolamento danificado (análise de óleo ou vibração).",
    ],
    praticas: [
      "Faça análise de óleo periódica (partículas, água e viscosidade) para antecipar desgaste.",
      "Não misture óleos de tipos diferentes no mesmo redutor.",
    ],
    links: [{ rotulo: "Equipamentos", rota: "/equipamentos" }],
  },
  {
    id: "analise_vibracao",
    area: "mecanica",
    titulo: "Análise de vibração (ISO 10816)",
    resumo: "Como medir, interpretar as zonas de severidade e identificar a falha pela frequência da vibração.",
    palavras: ["vibracao", "vibração", "ISO 10816", "severidade", "espectro", "envelope", "mm/s", "preditiva"],
    sintomas: [
      "Nível global de vibração subindo em relação à linha de base.",
      "Pico em frequência específica no espectro (1x, 2x, passagem de palheta, frequência de engrenamento).",
    ],
    causas: [
      "Desbalanceamento: pico em 1x da rotação, sobretudo radial.",
      "Desalinhamento: 2x alto e 1x com componente axial.",
      "Folga mecânica ou base solta: vários harmônicos e subharmônicos.",
      "Defeito em rolamento: picos nas frequências de defeito da pista, esfera ou gaiola (frequência de envelope).",
      "Problemas elétricos: 2x da frequência da rede em motores.",
    ],
    verificar: [
      "Medir a velocidade RMS (mm/s) nas três direções em cada mancal, sempre no mesmo ponto e com a mesma condição de carga.",
      "Comparar com a linha de base e com a tendência, não só com um único valor.",
      "Na suspeita de rolamento, pedir análise de envelope de aceleração.",
      "Confirmar a zona da ISO 10816 aplicável ao tipo e ao porte da máquina (fixação rígida ou flexível).",
    ],
    acoes: [
      "Zona A (novo ou recém-comissionado): sem ação.",
      "Zona B (aceitável para operação contínua): acompanhar a tendência.",
      "Zona C (não recomendável para operação contínua): planejar intervenção e analisar a causa.",
      "Zona D (causa danos): parar e corrigir antes de voltar a operar.",
    ],
    praticas: [
      "Crie a linha de base com o equipamento novo ou recém-revisado e grave a rota de medição.",
      "Os limites numéricos de velocidade dependem do porte e da fixação: use a tabela da ISO 10816 aplicável ao equipamento.",
      "A ISO 20816-3 substitui a ISO 10816-3; confira a parte da norma aplicável ao equipamento.",
    ],
    links: [
      { rotulo: "Preditiva (SEMEQ)", rota: "/preditiva" },
      { rotulo: "Saúde dos ativos", rota: "/saude" },
    ],
  },

  // ───────────── Lubrificação ─────────────
  {
    id: "graxas",
    area: "lubrificacao",
    titulo: "Graxas: escolha e reengraxe",
    resumo: "Tipo de graxa (NLGI e espessante), quando reengraxar e como fazê-lo sem contaminar o mancal.",
    palavras: ["graxa", "graxas", "reengraxe", "NLGI", "lubrificacao", "engraxar"],
    sintomas: [
      "Mancal aquecendo logo após o reengraxe.",
      "Graxa vazando pelas vedações ou sem sair pelo dreno.",
      "Graxa endurecida, seca ou com aspecto de borra.",
    ],
    causas: [
      "a agitação do excesso de graxa gera atrito e aquece o mancal",
      "Graxa incompatível com a que já está no mancal (espessantes diferentes).",
      "Graxa inadequada para a temperatura ou a velocidade de operação.",
      "Bico de graxa sujo, que introduz poeira junto com a graxa.",
    ],
    verificar: [
      "Conferir o tipo de graxa indicado no manual e na placa da máquina (consistência NLGI e espessante).",
      "Verificar se o mancal tem dreno e se ele está desobstruído.",
      "Limpar o bico antes de aplicar.",
      "Anotar a data e a quantidade aplicada na ficha do equipamento.",
    ],
    acoes: [
      "Reengraxar com a quantidade do manual e girar o eixo durante a aplicação, se possível.",
      "Não misturar graxas de espessantes diferentes: trocar toda a graxa do mancal antes de usar a nova.",
      "Quando não houver dreno, usar a quantidade mínima e reduzir o intervalo.",
    ],
    praticas: [
      "Padronize um único tipo de graxa por área da planta, para reduzir erro de estoque e de aplicação.",
      "Use pistola com contador ou medida fixa, para aplicar sempre a mesma quantidade.",
    ],
    links: [
      { rotulo: "Estoque", rota: "/estoque" },
      { rotulo: "Planos", rota: "/planos" },
    ],
  },
  {
    id: "oleos",
    area: "lubrificacao",
    titulo: "Óleos lubrificantes e troca",
    resumo: "Viscosidade, aditivos e troca de óleo em redutores, sistemas circulantes e compressores.",
    palavras: ["oleo", "óleo", "viscosidade", "ISO VG", "troca de oleo", "dreno", "lubrificante"],
    sintomas: [
      "Óleo escuro, com cheiro de queimado ou com borra.",
      "Óleo leitoso (emulsão), o que indica água.",
      "Nível que cai sem vazamento visível.",
    ],
    causas: [
      "Oxidação por temperatura alta ou tempo de uso acima do recomendado.",
      "Entrada de água por respiro, vedação ou condensação.",
      "Vazamento interno ou externo não identificado.",
      "Óleo de viscosidade errada, que não forma película adequada.",
    ],
    verificar: [
      "Conferir a viscosidade (ISO VG) e o tipo de óleo no manual e na placa.",
      "Coletar amostra para análise (água, viscosidade, partículas) antes de trocar.",
      "Procurar a origem da perda de nível: retentores, bujões, juntas, respiro.",
      "Verificar a temperatura de operação do sistema.",
    ],
    acoes: [
      "Trocar o óleo com o equipamento quente e drenar por completo, incluindo o fundo do reservatório.",
      "Encher até o nível indicado no visor, sem exceder o máximo.",
      "Limpar o filtro e o respiro na troca.",
      "Eliminar a causa da água antes de encher com óleo novo.",
    ],
    praticas: [
      "Registre o intervalo de troca pela análise de óleo, não só pela data.",
      "Guarde os recipientes de óleo tampados e em local seco para evitar contaminação.",
    ],
    links: [{ rotulo: "Estoque", rota: "/estoque" }],
  },
  {
    id: "intervalos_quantidade",
    area: "lubrificacao",
    titulo: "Intervalos e quantidade de lubrificante",
    resumo: "Como definir a frequência de reengraxe e a quantidade por mancal, com a fórmula de referência.",
    palavras: ["intervalo", "quantidade", "frequencia", "reengraxe", "gramas", "plano de lubrificacao"],
    sintomas: [
      "Mancais secos entre duas rotas de lubrificação.",
      "Excesso de graxa em mancais mais recentes, após a troca de equipamento.",
    ],
    causas: [
      "Intervalo definido sem considerar temperatura, velocidade e ambiente sujo.",
      "Quantidade fixa para todos os tamanhos de rolamento.",
      "Plano de lubrificação antigo, sem revisão após mudança de carga.",
    ],
    verificar: [
      "Confirmar o intervalo do fabricante do rolamento ou da máquina.",
      "Calcular a quantidade de reengraxe: G (g) = 0,005 × D × B, com D (diâmetro externo do rolamento) e B (largura), em mm. É a fórmula de referência usual de fabricantes de rolamentos.",
      "Conferir se o ambiente é sujo, úmido ou quente: nesses casos, reduzir o intervalo.",
    ],
    acoes: [
      "Ajustar o plano de lubrificação no sistema, com intervalo e quantidade por ponto.",
      "Em ambiente severo, aplicar em intervalos menores e em quantidade pequena.",
      "Revisar o plano depois de qualquer mudança de carga, rotação ou temperatura.",
    ],
    praticas: [
      "Use o plano de lubrificação como base da rota: cada ponto com tipo, quantidade e intervalo.",
      "Acompanhe a temperatura do mancal logo após o reengraxe, para confirmar a quantidade.",
    ],
    links: [{ rotulo: "Planos", rota: "/planos" }],
  },
  {
    id: "contaminacao_lubrificante",
    area: "lubrificacao",
    titulo: "Contaminação de lubrificantes",
    resumo: "Água, poeira e partículas no óleo e na graxa: como identificar, medir e controlar.",
    palavras: ["contaminacao", "contaminação", "agua no oleo", "particulas", "limpeza", "ISO 4406", "filtragem"],
    sintomas: [
      "Óleo com aspecto leitoso ou com gotas de água no fundo.",
      "Partículas metálicas no filtro ou no dreno.",
      "Desgaste acelerado de rolamentos, engrenagens ou válvulas.",
    ],
    causas: [
      "Respiro sem filtro ou com filtro entupido, em área com poeira ou umidade.",
      "Vedações gastas que deixam entrar água de lavagem.",
      "Condensação em reservatórios com grande variação de temperatura.",
      "Armazenamento inadequado do óleo ou da graxa.",
      "Abrasivo de desgaste de outras peças que circula no sistema.",
    ],
    verificar: [
      "Coletar amostra de óleo ou graxa e pedir análise de água e de partículas (classe de limpeza ISO 4406, quando houver).",
      "Verificar o respiro, o filtro e a vedação do equipamento.",
      "Verificar o armazenamento do lubrificante de reserva.",
    ],
    acoes: [
      "Trocar o lubrificante contaminado e limpar o reservatório antes de encher.",
      "Instalar respiro com filtro de ar e secador quando o ambiente for úmido.",
      "Trocar as vedações gastas e manter a lavagem longe dos mancais.",
      "Filtrar o óleo novo antes de entrar no sistema.",
    ],
    praticas: [
      "Mantenha os lubrificantes tampados e identificados; nunca transfira para recipiente sem identificação.",
      "Use a análise de óleo como indicador de desgaste e como controle da limpeza.",
    ],
    links: [{ rotulo: "Saúde dos ativos", rota: "/saude" }],
  },

  // ───────────── Elétrica ─────────────
  {
    id: "motores_inducao",
    area: "eletrica",
    titulo: "Motores de indução trifásicos",
    resumo: "Aquecimento, não partida, ruído e desarme em motores: causas, medições e critérios de aceitação.",
    palavras: ["motor", "motores", "inducao", "trifasico", "motor eletrico", "bobina", "isolamento", "megohmetro"],
    sintomas: [
      "Motor aquecendo mais que o normal ou cheirando a verniz queimado.",
      "Motor que não parte, ou parte com ruído e demora.",
      "Corrente desbalanceada entre as fases.",
      "Ruído magnético (zumbido) ou vibração elevada com carga normal.",
    ],
    causas: [
      "Desequilíbrio de tensão entre as fases (acima de 1 % já exige atenção, porque reduz a potência útil).",
      "Falta de fase, com o motor operando em duas fases e sobrecarregado.",
      "Ventilação obstruída (sujeira, aleta do ventilador quebrada) ou motor sobrecarregado.",
      "Degradação do isolamento por umidade, sujeira ou sobretemperatura repetida.",
      "Rolamento com defeito, que aumenta o atrito e o consumo.",
      "Conexão frouxa ou mal feita, que gera aquecimento localizado nos terminais.",
    ],
    verificar: [
      "Bloquear e desenergizar (LOTO) e medir a resistência de isolamento (ver o guia de medições).",
      "Medir a tensão e a corrente nas três fases, com o motor em carga: comparar com a placa.",
      "Verificar a ventilação: grade, aleta do ventilador e limpeza da carcaça.",
      "Verificar os terminais e as conexões da caixa de ligação, apertados e sem marca de aquecimento.",
      "Conferir a temperatura do enrolamento (termistor, se houver) e da carcaça.",
      "Medir a resistência ôhmica entre fases: valores equilibrados.",
    ],
    acoes: [
      "Corrigir a causa elétrica (fase, conexão, tensão) antes de religar.",
      "Limpar e desobstruir a ventilação; trocar a aleta quebrada.",
      "Rebobinar ou trocar o motor quando o isolamento estiver abaixo do mínimo e não houver causa externa a corrigir.",
      "Verificar a causa mecânica (carga, alinhamento, rolamento) antes de voltar a operar.",
    ],
    praticas: [
      "Regra prática: para cada 10 °C acima da temperatura da classe de isolamento, a vida do enrolamento cai pela metade.",
      "Classe de isolamento usual: B (130 °C), F (155 °C) e H (180 °C). Confira na placa.",
      "Use proteção térmica ou sensor PTC no enrolamento em motores críticos.",
    ],
    links: [
      { rotulo: "Equipamentos", rota: "/equipamentos" },
      { rotulo: "Preditiva (SEMEQ)", rota: "/preditiva" },
    ],
  },
  {
    id: "inversores",
    area: "eletrica",
    titulo: "Inversores de frequência: falhas comuns",
    resumo: "Falhas de sobrecorrente, sobretensão, subtensão, sobretemperatura e falta de fase em inversores, com o roteiro de diagnóstico.",
    palavras: ["inversor", "inversores", "VFD", "frequencia", "sobrecorrente", "sobretensao", "subtensao", "falha no inversor"],
    sintomas: [
      "Inversor desarma com código de sobrecorrente (OC) na partida ou na aceleração.",
      "Desarme por sobretensão (OV) na desaceleração.",
      "Desarme por subtensão (UV) ou por falta de fase.",
      "Desarme por sobretemperatura do módulo ou do dissipador.",
      "Motor que trepida ou não atinge a rotação de referência.",
    ],
    causas: [
      "Sobrecorrente: rampa de aceleração curta demais, carga acima do nominal, curto no cabo ou no motor.",
      "Sobretensão: energia regenerada na desaceleração sem resistor de frenagem, ou tempo de desaceleração curto.",
      "Subtensão: rede instável, queda de tensão em partida de outro motor ou cabo subdimensionado.",
      "Sobretemperatura: ventilação do painel ou do dissipador obstruída, ventilador parado ou ambiente quente.",
      "Falta de fase: fusível, contator ou cabo de entrada aberto.",
      "Parâmetros do motor (potência, corrente nominal, tensão) fora da placa.",
    ],
    verificar: [
      "Ler o histórico de falhas do inversor e anotar o código e o momento do desarme.",
      "Com o inversor desenergizado e descarregado (aguardar o tempo indicado no manual), medir a resistência de isolamento do cabo e do motor.",
      "Desconectar os cabos do motor dos bornes de saída do inversor antes de aplicar o megôhmetro.",
      "Medir tensão de entrada nas três fases, com o inversor em carga, e o desequilíbrio entre elas.",
      "Verificar ventiladores do inversor, filtros do painel e temperatura do dissipador.",
      "Conferir os parâmetros de corrente nominal, tensão e frequência com a placa do motor.",
      "Conferir os tempos de rampa de aceleração e desaceleração.",
    ],
    acoes: [
      "Sobrecorrente: aumentar a rampa, revisar a carga e a mecânica; trocar o cabo ou o motor se houver defeito de isolamento.",
      "Sobretensão: instalar resistor de frenagem ou aumentar o tempo de desaceleração, conforme o projeto.",
      "Subtensão e falta de fase: corrigir a alimentação, fusível e contator antes de religar.",
      "Sobretemperatura: limpar filtros e ventiladores e melhorar a ventilação do painel.",
      "Trocar o módulo ou o inversor somente após confirmar a causa, sem repetir o problema no novo equipamento.",
    ],
    praticas: [
      "Use cabo blindado e curto entre inversor e motor, dentro do limite do fabricante, e aterre a blindagem nas duas pontas.",
      "Para erosão elétrica nos mancais, use anel de aterramento do eixo ou rolamento isolado, e filtro dV/dt quando indicado.",
    ],
    links: [{ rotulo: "Equipamentos", rota: "/equipamentos" }],
  },
  {
    id: "contatores_rele_termico",
    area: "eletrica",
    titulo: "Contatores e relés térmicos",
    resumo: "Contator que não fecha ou aquece, relé térmico que desarma, e como ajustar a corrente de cada um.",
    palavras: ["contator", "contatores", "rele termico", "relé térmico", "bobina do contator", "disjuntor motor", "desarme"],
    sintomas: [
      "Contator que não fecha ou fecha e abre (chatter).",
      "Contatos queimados, com marca de arco ou aquecidos.",
      "Relé térmico que desarma com o motor frio ou sem carga.",
      "Ruído de zumbido no contator (bobina ou núcleo).",
    ],
    causas: [
      "Tensão da bobina fora da faixa (baixa tensão na bobina ou queda da alimentação de comando).",
      "Núcleo sujo ou com ferrugem, o que impede o fechamento completo.",
      "Contatos gastos, oxidados ou com mau aperto nos terminais.",
      "Ajuste do relé térmico abaixo da corrente real ou da corrente nominal do motor.",
      "Partidas muito frequentes, que reduzem a vida dos contatos.",
    ],
    verificar: [
      "Medir a tensão na bobina do contator com o comando energizado.",
      "Verificar a queda de tensão nas conexões de comando e nos bornes.",
      "Conferir o estado dos contatos principais e o aperto dos terminais.",
      "Conferir o ajuste do relé térmico com a corrente da placa do motor.",
      "Medir a corrente real do motor e comparar com o ajuste.",
    ],
    acoes: [
      "Limpar o núcleo e os contatos; trocar o contato quando houver queima.",
      "Corrigir o aperto e a conexão antes de religar.",
      "Ajustar o relé térmico à corrente nominal do motor (ou In × fator de serviço), sem ficar acima dela.",
      "Trocar o contator quando a bobina ou os contatos estiverem fora da especificação.",
    ],
    praticas: [
      "Use terminais com torque conferido e registre a data da última verificação do painel.",
      "Para partidas frequentes, escolha o contator pela categoria de utilização AC-3 ou AC-4, conforme a carga.",
    ],
    links: [{ rotulo: "Equipamentos", rota: "/equipamentos" }],
  },
  {
    id: "aterramento",
    area: "eletrica",
    titulo: "Aterramento e continuidade",
    resumo: "Medição de resistência de aterramento e de continuidade de equipamentos e carcaças.",
    palavras: ["aterramento", "terra", "ground", "continuidade", "equipotencial", "resistencia de aterramento"],
    sintomas: [
      "Choque leve ao tocar a carcaça ou a máquina.",
      "Ruído ou erro em instrumentos e sensores, com a suspeita de falha de terra.",
      "Desarme de DR (diferencial) sem causa aparente.",
    ],
    causas: [
      "Conexão de terra solta, corroída ou pintada.",
      "Haste de aterramento seca ou com resistência alta do solo.",
      "Falta de equipotencialização entre máquinas, painéis e estruturas.",
      "Emenda ou cabo de terra interrompido.",
    ],
    verificar: [
      "Com o equipamento desenergizado, medir a continuidade entre a carcaça e o barramento de terra.",
      "Medir a resistência de aterramento com o terrômetro (valor de referência usual: até 10 Ω, conforme o projeto).",
      "Inspecionar as conexões, os terminais e as hastes.",
      "Verificar se há corrente de fuga com medidor de corrente de fuga ou alicate.",
    ],
    acoes: [
      "Refazer a conexão com terminal adequado e limpo, sem tinta e sem oxidação.",
      "Tratar o solo ou acrescentar haste quando a resistência estiver alta.",
      "Interligar as partes metálicas ao barramento de equipotencial conforme o projeto.",
    ],
    praticas: [
      "Não use o neutro como terra de proteção de equipamento.",
      "Registre as medições de terra no plano de manutenção, com data e valor.",
    ],
    links: [{ rotulo: "Gestão de MRO", rota: "/mro" }],
  },
  {
    id: "medicoes_isolamento",
    area: "eletrica",
    titulo: "Medições: multímetro e megôhmetro",
    resumo: "Roteiro de medições elétricas com multímetro e megôhmetro, com valores de referência e cuidados de segurança.",
    palavras: ["megohmetro", "megôhmetro", "multimetro", "medicao", "resistencia de isolamento", "tensao", "corrente", "5 megaohm"],
    sintomas: [
      "Dúvida sobre o estado do isolamento de motor, cabo ou painel.",
      "Suspeita de fuga para a terra ou curto entre espiras.",
    ],
    causas: [
      "Umidade ou contaminação no enrolamento ou no cabo.",
      "Isolamento envelhecido por temperatura.",
      "Dano mecânico no cabo, na caixa de ligação ou no enrolamento.",
    ],
    verificar: [
      "Desenergizar, bloquear e descarregar o equipamento antes de medir.",
      "Megôhmetro em motor de baixa tensão: aplicar 500 V DC entre cada fase e a carcaça, e entre as fases. Valor mínimo (IEEE 43, enrolamento de baixa tensão): 5 MΩ, corrigido para 40 °C; abaixo disso, não energizar.",
      "Índice de polarização (IP = R 10 min ÷ R 1 min): valores acima de 2 indicam isolamento em boas condições.",
      "Multímetro: conferir a tensão de alimentação, a resistência ôhmica entre fases (valores equilibrados) e a continuidade dos cabos.",
      "Anotar as medições com data, temperatura do equipamento e umidade do ambiente.",
    ],
    acoes: [
      "Se o isolamento estiver abaixo de 5 MΩ, secar o motor e repetir a medição antes de decidir a rebobinagem.",
      "Registrar a tendência: queda de valor entre medições é o sinal mais importante.",
      "Trocar o cabo ou o componente quando a medição não se recuperar após a secagem.",
    ],
    praticas: [
      "Use multímetro com categoria de medição adequada (CAT) para o nível de tensão.",
      "Medições em rede energizada só por profissional habilitado e com procedimento aprovado (NR-10).",
    ],
    links: [{ rotulo: "Preditiva (SEMEQ)", rota: "/preditiva" }],
  },
  {
    id: "nr10",
    area: "eletrica",
    titulo: "NR-10: trabalho com eletricidade",
    resumo: "Princípios da NR-10 para a manutenção elétrica: desenergização, bloqueio, procedimentos e habilitação.",
    palavras: ["NR-10", "NR10", "eletricidade", "tensao", "trabalho eletrico", "desenergizar", "habilitacao"],
    sintomas: [
      "Serviço elétrico que começa sem desenergizar o circuito.",
      "Trabalho em painel energizado sem procedimento ou sem equipe qualificada.",
    ],
    causas: [
      "Pressa e falta de procedimento específico para o serviço.",
      "Falta de habilitação, capacitação ou autorização do executante.",
      "Ferramenta ou EPI inadequado para o nível de tensão.",
    ],
    verificar: [
      "Confirmar a permissão de trabalho e o procedimento do serviço antes de começar.",
      "Confirmar que os executantes são habilitados e capacitados para o nível de tensão.",
      "Seccionar, impedir a reenergização (bloqueio), constatar a ausência de tensão, instalar aterramento temporário com equipotencialização, proteger os elementos energizados próximos e sinalizar o impedimento.",
      "Conferir as ferramentas isoladas e os EPIs para o nível de tensão.",
    ],
    acoes: [
      "Só trabalhar energizado quando for tecnicamente justificado, com procedimento e autorização, e por equipe qualificada.",
      "Manter distância de segurança das partes energizadas.",
      "Ao terminar, retirar o bloqueio somente por quem o colocou e sinalizar a liberação.",
    ],
    praticas: [
      "Treine o executante antes do primeiro serviço, com prática e reciclagem periódica.",
      "Tenha sempre um responsável no local durante o serviço elétrico.",
    ],
    links: [{ rotulo: "Gestão de MRO", rota: "/mro" }],
  },

  // ───────────── Pneumática e hidráulica ─────────────
  {
    id: "frl",
    area: "fluidos",
    titulo: "Unidade FRL (filtro, regulador e lubrificador)",
    resumo: "Pressão instável, água no ar e lubrificador vazio: como verificar o conjunto FRL.",
    palavras: ["FRL", "filtro regulador lubrificador", "unidade de tratamento", "pressao de ar", "lubrificador", "agua no ar"],
    sintomas: [
      "Pressão de saída oscila ou cai com o consumo.",
      "Água condensada no copo do filtro ou no sistema.",
      "Cilindros e válvulas travando ou gastando rápido.",
      "Lubrificador sem gotejar.",
    ],
    causas: [
      "Filtro entupido ou com dreno cheio.",
      "Regulador com mola ou diafragma gasto.",
      "Ar úmido, sem secagem na linha.",
      "Óleo do lubrificador no nível mínimo ou com regulagem de gotejamento errada.",
    ],
    verificar: [
      "Despressurizar a linha antes de abrir o copo.",
      "Verificar o dreno do filtro e esvaziar a água.",
      "Ler a pressão de entrada e de saída com manômetro, em consumo normal.",
      "Verificar o nível e o gotejamento do lubrificador (cerca de 1 gota a cada 300–1000 L de ar, conforme o fabricante).",
    ],
    acoes: [
      "Limpar ou trocar o elemento filtrante e instalar dreno automático.",
      "Trocar o regulador quando a pressão não se mantém.",
      "Reabastecer o lubrificador com o óleo indicado pelo fabricante.",
    ],
    praticas: [
      "Mantenha o FRL depois do secador e do reservatório, com dreno automático na linha.",
      "Uma vez lubrificado, o componente deve continuar sendo lubrificado.",
    ],
    links: [{ rotulo: "Equipamentos", rota: "/equipamentos" }],
  },
  {
    id: "cilindros_pneumaticos",
    area: "fluidos",
    titulo: "Cilindros pneumáticos",
    resumo: "Cilindro lento, sem força, com vazamento pela haste ou com curso incompleto: causas e roteiro.",
    palavras: ["cilindro", "cilindros", "cilindro pneumatico", "haste", "vedacao", "curso", "pneumatico"],
    sintomas: [
      "Cilindro lento ou sem força suficiente.",
      "Vazamento de ar pela haste ou pela tampa.",
      "Curso incompleto ou movimento irregular.",
      "Haste riscada ou com corrosão.",
    ],
    causas: [
      "Pressão de trabalho abaixo do necessário.",
      "Vedação gasta (gaxeta ou o-ring) ou parte em contato com sujeira.",
      "Haste com risco ou corrosão, que destrói a vedação.",
      "Carga desalinhada, com o cilindro sendo forçado lateralmente.",
      "Velocidade controlada por reguladores de vazão fechados demais.",
    ],
    verificar: [
      "Medir a pressão na entrada do cilindro, com o movimento em andamento.",
      "Procurar vazamento com spray de espuma em haste, tampa e conexões.",
      "Verificar o alinhamento da carga e a fixação do cilindro.",
      "Inspecionar a haste para riscos e corrosão.",
    ],
    acoes: [
      "Trocar o kit de vedação, com o cilindro desmontado e limpo.",
      "Substituir a haste quando houver risco profundo ou corrosão.",
      "Corrigir o alinhamento da carga e os reguladores de vazão.",
    ],
    praticas: [
      "Mantenha a haste protegida de respingo e de poeira com fole ou raspador.",
      "Use kit de reparo original ou equivalente, com a mesma especificação de material.",
    ],
    links: [{ rotulo: "Equipamentos", rota: "/equipamentos" }],
  },
  {
    id: "valvulas_direcionais",
    area: "fluidos",
    titulo: "Válvulas direcionais e solenoides",
    resumo: "Válvula que não comuta, bobina queimada ou vazamento interno: como testar e corrigir.",
    palavras: ["valvula", "válvula", "direcional", "solenoide", "bobina", "comutar", "carretel", "piloto"],
    sintomas: [
      "Cilindro não avança ou não recua quando o comando é dado.",
      "Bobina do solenoide aquecida, sem acionar ou queimada.",
      "Vazamento de ar pela saída da válvula com o comando desligado.",
    ],
    causas: [
      "Falta de tensão na bobina ou bobina queimada.",
      "Carretel travado por sujeira, verniz ou partícula.",
      "Pressão piloto insuficiente em válvulas pilotadas.",
      "Vedação interna gasta, com passagem entre as vias.",
    ],
    verificar: [
      "Medir a tensão na bobina com o comando acionado (nominal 24 Vcc ou 220 Vca, conforme a placa).",
      "Ouvir o clique da comutação e verificar o indicador de comando (LED).",
      "Verificar a pressão de alimentação e a de pilotagem.",
      "Desmontar e inspecionar o carretel com a válvula despressurizada.",
    ],
    acoes: [
      "Trocar a bobina queimada e conferir a tensão de alimentação.",
      "Limpar o carretel com solvente adequado e substituir a vedação gasta.",
      "Corrigir a filtragem do ar para evitar nova contaminação.",
    ],
    praticas: [
      "Mantenha uma bobina e uma válvula reserva de cada modelo crítico.",
      "Confira a tensão da bobina na troca: tensão errada queima a bobina em pouco tempo.",
    ],
    links: [{ rotulo: "Estoque", rota: "/estoque" }],
  },
  {
    id: "vazamentos_ar",
    area: "fluidos",
    titulo: "Vazamentos de ar comprimido",
    resumo: "Como localizar e quantificar vazamentos de ar comprimido, e o efeito no consumo de energia.",
    palavras: ["vazamento", "ar comprimido", "compressor", "perda de ar", "ultrassom", "conexao", "mangueira"],
    sintomas: [
      "Compressor funcionando muitas horas sem consumo real aparente.",
      "Pressão da rede caindo com o sistema parado.",
      "Assobio ou ruído de ar nas conexões, mangueiras e válvulas.",
    ],
    causas: [
      "Conexões roscadas soltas ou sem vedante.",
      "Mangueiras e tubos rompidos ou com emenda gasta.",
      "Válvulas e cilindros com vedação gasta.",
      "Dreno de condensado travado aberto.",
    ],
    verificar: [
      "Com a produção parada, anotar o tempo de funcionamento do compressor (teste de vazamento).",
      "Procurar vazamentos com detector ultrassônico ou espuma de sabão nas conexões.",
      "Verificar os drenos automáticos e as válvulas de bloqueio das linhas paradas.",
    ],
    acoes: [
      "Apertar ou refazer a conexão com vedante próprio para ar comprimido.",
      "Substituir a mangueira ou o tubo danificado.",
      "Fechar os ramais que não estão em uso e trocar o dreno defeituoso.",
    ],
    praticas: [
      "Faça a ronda de vazamento periodicamente e registre o resultado.",
      "Vazamento de ar comprimido é desperdício de energia: estime o custo na rotina.",
    ],
    links: [{ rotulo: "Custos", rota: "/custos" }],
  },
  {
    id: "unidade_hidraulica",
    area: "fluidos",
    titulo: "Unidade hidráulica e óleo",
    resumo: "Pressão baixa, aquecimento, ruído da bomba e óleo contaminado em unidades hidráulicas.",
    palavras: ["hidraulica", "hidráulica", "unidade hidraulica", "bomba hidraulica", "oleo hidraulico", "pressao", "filtro hidraulico"],
    sintomas: [
      "Pressão de trabalho abaixo da regulada.",
      "Óleo aquecendo além da faixa normal.",
      "Ruído de cavitação ou de bomba.",
      "Óleo escuro, com espuma ou com água.",
    ],
    causas: [
      "Nível de óleo baixo ou sucção com ar (entrada de ar no tubo de sucção).",
      "Filtro de sucção ou de retorno entupido.",
      "Bomba com folga interna desgastada, ou válvula de alívio desajustada.",
      "Óleo contaminado ou com viscosidade errada para a temperatura de trabalho.",
      "Trocador de calor ou ventilação do reservatório obstruídos.",
    ],
    verificar: [
      "Conferir o nível no visor com o sistema frio e parado.",
      "Verificar os indicadores de pressão e de temperatura do filtro.",
      "Ouvir a bomba e procurar ar na sucção (espuma no óleo).",
      "Coletar amostra do óleo para análise de água, partículas e viscosidade.",
    ],
    acoes: [
      "Completar o nível com o óleo indicado e corrigir a entrada de ar.",
      "Trocar o filtro e limpar o respiro do reservatório.",
      "Ajustar a válvula de alívio com manômetro calibrado.",
      "Trocar o óleo quando a análise indicar contaminação ou degradação.",
    ],
    praticas: [
      "Não misture óleos de marcas ou viscosidades diferentes no mesmo sistema.",
      "Monitore a pressão do filtro: a troca pelo indicador é mais segura que a troca fixa.",
    ],
    links: [{ rotulo: "Saúde dos ativos", rota: "/saude" }],
  },

  // ───────────── Segurança ─────────────
  {
    id: "nr12",
    area: "seguranca",
    titulo: "NR-12: segurança em máquinas e equipamentos",
    resumo: "Proteções, paradas de emergência e cuidados de manutenção em máquinas, conforme a NR-12.",
    palavras: ["NR-12", "NR12", "seguranca em maquinas", "protecao", "parada de emergencia", "guarda", "intertravamento"],
    sintomas: [
      "Proteção removida ou com intertravamento burlado.",
      "Parada de emergência que não corta a energia de forma confiável.",
      "Manutenção feita com a máquina em movimento.",
    ],
    causas: [
      "Proteção removida para facilitar a manutenção e não recolocada.",
      "Intertravamento contornado para ganhar produção.",
      "Falta de procedimento para manutenção com energia isolada.",
    ],
    verificar: [
      "Conferir se todas as proteções fixas e móveis estão no lugar antes de religar.",
      "Testar a parada de emergência e o intertravamento depois de cada manutenção.",
      "Verificar a sinalização das áreas de perigo.",
    ],
    acoes: [
      "Restaurar a proteção e testar o intertravamento antes de liberar a máquina.",
      "Registrar na ordem a retirada e a reposição de cada proteção.",
      "Comunicar à segurança do trabalho qualquer contorno de proteção encontrado.",
    ],
    praticas: [
      "Manutenção só com a máquina parada, energia isolada e bloqueada (LOTO).",
      "Inclua o teste da parada de emergência no plano de manutenção preventiva.",
    ],
    links: [{ rotulo: "Ordens", rota: "/ordens" }],
  },
  {
    id: "loto",
    area: "seguranca",
    titulo: "LOTO: bloqueio e etiquetagem de energia",
    resumo: "Sequência de bloqueio e etiquetagem (lockout/tagout) para isolar todas as energias antes da manutenção.",
    palavras: ["LOTO", "bloqueio", "etiquetagem", "lockout", "tagout", "energia residual", "cadeado", "isolamento de energia"],
    sintomas: [
      "Equipamento que parte durante a manutenção.",
      "Energia residual (pneumática, hidráulica, mola, capacitor) que se libera ao abrir o circuito.",
      "Dúvida sobre quais fontes de energia alimentam a máquina.",
    ],
    causas: [
      "Só desligar pelo botão, sem isolar a fonte de energia.",
      "Falta de mapa das fontes de energia do equipamento.",
      "Energia armazenada (ar, óleo, mola, peso suspenso) não liberada.",
    ],
    verificar: [
      "Avisar a operação e identificar todas as fontes de energia (elétrica, pneumática, hidráulica, térmica, mecânica e gravidade).",
      "Desligar, isolar cada fonte e colocar cadeado e etiqueta pessoal em cada uma.",
      "Liberar a energia residual: despressurizar, escorar peças suspensas, descarregar capacitores.",
      "Testar a partida pelo comando local: a máquina não pode se mover.",
    ],
    acoes: [
      "Trabalhar somente após o teste de ausência de energia.",
      "Retirar o bloqueio só por quem o colocou, depois de confirmar que a área está livre.",
      "Registrar na permissão ou na ordem o bloqueio e o desbloqueio.",
    ],
    praticas: [
      "Cada executante usa o próprio cadeado e a própria chave.",
      "Mantenha o procedimento de LOTO por equipamento, com as fontes de energia listadas.",
    ],
    links: [{ rotulo: "Ordens", rota: "/ordens" }],
  },
  {
    id: "permissao_trabalho",
    area: "seguranca",
    titulo: "Permissão de trabalho (PT)",
    resumo: "Quando emitir, o que conferir e como encerrar uma permissão de trabalho para serviço de manutenção.",
    palavras: ["permissao de trabalho", "PT", "autorizacao", "analise de risco", "trabalho a quente", "espaco confinado"],
    sintomas: [
      "Serviço iniciado sem permissão emitida.",
      "Permissão emitida sem conferir o bloqueio ou a análise de risco.",
      "Serviço continuando depois do horário da permissão.",
    ],
    causas: [
      "Pressa e falta de hábito de emitir a permissão.",
      "Permissão genérica, que não descreve os riscos do serviço.",
      "Mudança de escopo do serviço sem nova permissão.",
    ],
    verificar: [
      "Conferir o tipo de serviço e os riscos (elétrico, altura, a quente, espaço confinado, produto químico).",
      "Confirmar o LOTO e as medidas de proteção antes de assinar.",
      "Conferir se o executante tem treinamento e os EPIs exigidos.",
    ],
    acoes: [
      "Emitir nova permissão quando o serviço mudar de escopo ou de horário.",
      "Encerrar a permissão ao final do serviço e retirar o bloqueio.",
      "Arquivar a permissão junto à ordem, para consulta futura.",
    ],
    praticas: [
      "A permissão é um controle: sem ela, o serviço não começa.",
      "Faça o diálogo de segurança com a equipe antes de cada serviço de risco.",
    ],
    links: [{ rotulo: "Ordens", rota: "/ordens" }],
  },
  {
    id: "epis",
    area: "seguranca",
    titulo: "EPIs na manutenção",
    resumo: "Escolha, uso e inspeção de EPIs para os principais riscos da manutenção industrial.",
    palavras: ["EPI", "EPIs", "equipamento de protecao", "luva", "oculos", "protetor auricular", "calcado", "capacete"],
    sintomas: [
      "EPI danificado, vencido ou sem certificado de aprovação (CA).",
      "EPI inadequado para o risco (luva comum em serviço com rebolo ou com produto químico).",
    ],
    causas: [
      "EPI não substituído após o uso ou o desgaste.",
      "Falta de definição do EPI por tipo de serviço.",
      "Conforto ruim, o que leva ao uso incorreto.",
    ],
    verificar: [
      "Conferir o CA (certificado de aprovação) do EPI no momento da entrega.",
      "Inspecionar o EPI antes de cada uso: rachaduras, costuras soltas, elástico gasto.",
      "Conferir se o EPI do serviço está na análise de risco ou na permissão.",
    ],
    acoes: [
      "Trocar o EPI danificado e registrar a entrega.",
      "Definir o EPI por tipo de serviço, em lista simples fixada no posto.",
      "Oferecer tamanhos e modelos diferentes para que a proteção seja usada de fato.",
    ],
    praticas: [
      "EPI é a última barreira: elimine e proteja primeiro (proteções, isolamento, bloqueio).",
      "Guarde os EPIs limpos e em local seco e identificado.",
    ],
    links: [{ rotulo: "Ordens", rota: "/ordens" }],
  },

  // ───────────── Métodos e ferramentas ─────────────
  {
    id: "tpm_wcm",
    area: "metodos",
    titulo: "TPM e pilares do WCM",
    resumo: "O que é TPM (manutenção produtiva total), os pilares de manutenção do WCM e como eles se aplicam no dia a dia.",
    palavras: ["TPM", "WCM", "manutencao produtiva total", "pilar", "manutencao autonoma", "manutencao planejada", "world class manufacturing"],
    sintomas: [
      "Operador esperando a manutenção para qualquer ajuste simples.",
      "Equipamentos com muitas paradas pequenas e pouca limpeza.",
      "Manutenção apagando incêndio, sem planejamento.",
    ],
    causas: [
      "Falta de participação da operação na manutenção básica.",
      "Falta de padrão de limpeza, inspeção e lubrificação.",
      "Histórico de falhas não analisado.",
    ],
    verificar: [
      "Verificar se há plano de manutenção autônoma (limpeza, inspeção, lubrificação) feito pelo operador.",
      "Conferir a relação entre manutenção planejada e corretiva.",
      "Verificar se as falhas repetidas têm análise de causa.",
    ],
    acoes: [
      "Implantar a manutenção autônoma com padrões visuais por equipamento.",
      "Usar a manutenção planejada para cobrir as preventivas e preditivas.",
      "Priorizar melhorias focadas nas perdas de maior impacto, com análise de falha.",
    ],
    praticas: [
      "Os pilares do WCM incluem manutenção planejada e autônoma, melhoria focada, segurança, qualidade e custos, entre outros.",
      "Mostre os resultados com indicadores simples (quebras, MTBF e MTTR) em painel de área.",
    ],
    links: [
      { rotulo: "Painel WCM", rota: "/painel" },
      { rotulo: "Quebras, MTBF e MTTR", rota: "/confiabilidade" },
    ],
  },
  {
    id: "cinco_porques",
    area: "metodos",
    titulo: "5 Porquês",
    resumo: "Método para encontrar a causa raiz de uma falha perguntando “por quê?” até chegar à causa que pode ser corrigida.",
    palavras: ["5 porques", "cinco porques", "causa raiz", "por que", "analise de causa"],
    sintomas: [
      "Falha que volta a acontecer depois de uma correção rápida.",
      "Causa sendo atribuída a “operador” ou “desgaste” sem prova.",
    ],
    causas: [
      "Parar na primeira causa aparente.",
      "Falta de dados (fotos, medições, histórico) para sustentar a resposta.",
    ],
    verificar: [
      "Descrever o problema com fato observado (o que, onde, quando, quanto).",
      "Perguntar “por quê?” e responder com fato, até chegar a 5 níveis ou a uma causa que possa ser corrigida.",
      "Confirmar cada resposta com evidência (medição, registro, foto).",
    ],
    acoes: [
      "Definir a ação para a causa raiz e não para o sintoma.",
      "Responsável e prazo para cada ação, registrados na análise de falha.",
      "Verificar depois de um tempo se a falha não voltou.",
    ],
    praticas: [
      "Faça a análise com quem executa o serviço e quem opera o equipamento.",
      "Quando houver mais de uma causa, use o diagrama de Ishikawa para organizar.",
    ],
    links: [{ rotulo: "Planos de análise de falha", rota: "/af_planos" }],
  },
  {
    id: "ishikawa_6m",
    area: "metodos",
    titulo: "Diagrama de Ishikawa (6M)",
    resumo: "Diagrama de causa e efeito organizado em seis famílias: método, máquina, material, mão de obra, medição e meio ambiente.",
    palavras: ["ishikawa", "espinha de peixe", "causa e efeito", "6M", "diagrama"],
    sintomas: [
      "Equipe discutindo a falha sem organizar as hipóteses.",
      "Muitas causas possíveis e nenhuma priorizada.",
    ],
    causas: [
      "Falta de estrutura para a análise.",
      "Opiniões sem verificação em campo.",
    ],
    verificar: [
      "Escrever o efeito (a falha) na cabeça do diagrama.",
      "Preencher cada família: método, máquina, material, mão de obra, medição e meio ambiente.",
      "Marcar as causas candidatas e verificar cada uma em campo ou com dados.",
    ],
    acoes: [
      "Priorizar as causas confirmadas e levar cada uma aos 5 Porquês.",
      "Registrar as ações no plano da análise de falha.",
    ],
    praticas: [
      "Faça o diagrama em grupo, com quem conhece o equipamento.",
      "Uma causa só entra como confirmada depois de checada com dado ou teste.",
    ],
    links: [{ rotulo: "Planos de análise de falha", rota: "/af_planos" }],
  },
  {
    id: "analise_falha",
    area: "metodos",
    titulo: "Análise de falha (AF)",
    resumo: "Fluxo de uma análise de falha: registro, evidências, causa raiz, ação, verificação de eficácia e encerramento.",
    palavras: ["analise de falha", "AF", "plano de AF", "acoes de AF", "falha", "causa raiz", "eficacia"],
    sintomas: [
      "Falha repetida no mesmo equipamento sem análise formal.",
      "Ação de correção feita sem registro da causa.",
    ],
    causas: [
      "Falta de registro das evidências no momento da falha.",
      "Análise iniciada tarde, quando as peças já foram trocadas.",
    ],
    verificar: [
      "Registrar a falha com data, equipamento, sintoma e tempo de parada.",
      "Preservar as peças e as evidências antes de desmontar, quando possível.",
      "Montar a análise com os 5 Porquês ou o Ishikawa.",
      "Definir a causa raiz e a ação, com responsável e prazo.",
    ],
    acoes: [
      "Executar a ação e registrar a conclusão.",
      "Verificar a eficácia: a falha não voltou no período acompanhado.",
      "Encerrar a análise somente depois da verificação de eficácia.",
    ],
    praticas: [
      "Escolha para análise as falhas de maior impacto (parada, custo, segurança).",
      "Use o plano de AF para acompanhar as ações até o encerramento.",
    ],
    links: [
      { rotulo: "Planos de AF", rota: "/af_planos" },
      { rotulo: "Ações de AF", rota: "/af_acoes" },
    ],
  },
  {
    id: "fmea",
    area: "metodos",
    titulo: "FMEA: modos de falha e efeitos",
    resumo: "Análise dos modos de falha de um equipamento com nota de severidade, ocorrência e detecção (NPR).",
    palavras: ["FMEA", "modo de falha", "efeito", "NPR", "severidade", "ocorrencia", "deteccao", "risco"],
    sintomas: [
      "Equipamento crítico sem análise de risco documentada.",
      "Prioridade das ações de manutenção decidida sem critério.",
    ],
    causas: [
      "Falta de análise prévia dos modos de falha.",
      "Critério de prioridade baseado só na intuição.",
    ],
    verificar: [
      "Listar os componentes e as funções do equipamento.",
      "Para cada modo de falha, dar nota de severidade, ocorrência e detecção, de 1 a 10.",
      "Calcular o NPR = severidade × ocorrência × detecção e ordenar do maior para o menor.",
    ],
    acoes: [
      "Definir ação para os modos de falha com maior NPR e com severidade alta.",
      "Revisar as notas depois de cada ação, para mostrar a redução do risco.",
    ],
    praticas: [
      "Faça o FMEA em equipe e revise depois de uma falha importante.",
      "Use o FMEA para montar o plano de preventiva e preditiva do equipamento.",
    ],
    links: [{ rotulo: "Planos de AF", rota: "/af_planos" }],
  },
  {
    id: "pdca_kaizen",
    area: "metodos",
    titulo: "PDCA e Kaizen",
    resumo: "Ciclo de melhoria contínua (planejar, fazer, verificar e agir) e as melhorias pequenas e frequentes do Kaizen.",
    palavras: ["PDCA", "kaizen", "melhoria continua", "ciclo", "planejar fazer verificar agir", "melhoria"],
    sintomas: [
      "Melhoria feita sem medir o resultado.",
      "Mesmo problema reaparecendo porque o padrão não foi atualizado.",
    ],
    causas: [
      "Falta de meta clara antes da mudança.",
      "Padrão antigo continuando em uso depois da melhoria.",
    ],
    verificar: [
      "Planejar: definir o problema, a meta e a causa com dado.",
      "Fazer: aplicar a melhoria em escala pequena, com responsável.",
      "Verificar: comparar o resultado com a meta, no mesmo indicador.",
      "Agir: padronizar o que deu certo ou ajustar e repetir o ciclo.",
    ],
    acoes: [
      "Atualizar o padrão de trabalho e a instrução do equipamento.",
      "Treinar a equipe no novo padrão antes de considerar a melhoria concluída.",
    ],
    praticas: [
      "Kaizen é de pequenos passos e de envolvimento de quem faz o trabalho.",
      "Registre a melhoria com antes e depois no mesmo indicador.",
    ],
    links: [{ rotulo: "Painel WCM", rota: "/painel" }],
  },

  // ───────────── PCM e SAP ─────────────
  {
    id: "tipos_ordem",
    area: "pcm_sap",
    titulo: "Tipos de ordem YM01 a YM13",
    resumo: "Tipos de ordem usados na manutenção: preventiva, preditiva, corretiva emergencial, corretiva programada e melhoria.",
    palavras: ["tipo de ordem", "YM01", "YM03", "YM11", "YM12", "YM13", "preventiva", "corretiva", "melhoria", "ordem"],
    sintomas: [
      "Ordem aberta com tipo errado, que distorce os indicadores de quebra.",
      "Corretiva criada como preventiva, sem registro de quebra.",
    ],
    causas: [
      "Escolha do tipo sem regra clara.",
      "Falta de conferência do tipo na criação da ordem.",
    ],
    verificar: [
      "YM01: preventiva (plano de manutenção).",
      "YM03: preditiva ou inspeção (condição do equipamento).",
      "YM11: corretiva emergencial (quebra, com parada da produção).",
      "YM12: corretiva programada (falha conhecida, atendida no momento planejado).",
      "YM13: melhoria (alteração que não é manutenção de rotina).",
    ],
    acoes: [
      "Conferir o tipo ao criar a ordem e corrigir o tipo quando a ordem estiver errada.",
      "Quebra registrada como YM11 para contar nos indicadores de confiabilidade.",
    ],
    praticas: [
      "Use o mesmo critério de tipo em toda a planta, definido pelo PCM.",
      "Confira os tipos no relatório de ordens antes de fechar o mês.",
    ],
    links: [
      { rotulo: "Ordens", rota: "/ordens" },
      { rotulo: "Quebras, MTBF e MTTR", rota: "/confiabilidade" },
    ],
  },
  {
    id: "transacoes_sap",
    area: "pcm_sap",
    titulo: "Transações do SAP usadas na manutenção",
    resumo: "Guia rápido das transações de manutenção: notas, ordens, confirmações, planos, listas de tarefas, equipamentos, estoque e requisições.",
    palavras: ["SAP", "transacao", "IW21", "IW28", "IW31", "IW32", "IW33", "IW38", "IW39", "IW41", "IW47", "IP10", "IP19", "IA05", "IA06", "IH08", "MB52", "ME5A"],
    sintomas: [
      "Dúvida sobre qual transação usar para cada tarefa do PCM.",
      "Consulta feita em tela errada, com dados incompletos.",
    ],
    causas: [
      "Falta de guia de referência para novos usuários.",
      "Mudança de rotina sem atualização dos treinamentos.",
    ],
    verificar: [
      "IW21 e IW28: criar nota e listar notas.",
      "IW31, IW32 e IW33: criar, modificar e exibir ordem.",
      "IW38 e IW39: listas de ordens.",
      "IW41 e IW47: apontar confirmação e listar confirmações.",
      "IP10 e IP19: planos de manutenção e programação.",
      "IP10: programar o plano; IP19: visão geral da programação.",
      "IA05 e IA06: listas de tarefas.",
      "IH08: equipamentos. MB52: estoque por material. ME5A: requisições de compra.",
    ],
    acoes: [
      "Usar a lista da transação para conferir os dados antes de decidir (ex.: IW38 antes de programar).",
      "Quando faltar acesso, pedir ao administrador do SAP a liberação da transação para a função.",
    ],
    praticas: [
      "Não crie ordem ou nota sem conferir se já existe uma aberta para o mesmo equipamento.",
      "Confira a data de referência e o filtro de centro de trabalho em cada lista.",
    ],
    links: [
      { rotulo: "Ordens", rota: "/ordens" },
      { rotulo: "Estoque", rota: "/estoque" },
      { rotulo: "Equipamentos", rota: "/equipamentos" },
    ],
  },
  {
    id: "fluxo_nota_ordem",
    area: "pcm_sap",
    titulo: "Fluxo: nota, ordem, confirmação e encerramento",
    resumo: "Caminho de uma falha ou necessidade: da nota à ordem, o planejamento, a execução, a confirmação e o encerramento.",
    palavras: ["fluxo", "nota", "ordem", "confirmacao", "encerramento", "IW21", "IW31", "IW41", "processo"],
    sintomas: [
      "Ordem executada e sem confirmação, o que distorce a HH e o custo.",
      "Nota aberta por muito tempo sem virar ordem.",
      "Ordem encerrada sem registro da causa.",
    ],
    causas: [
      "Equipe executa e não confirma no sistema.",
      "Nota sem triagem, sem prioridade e sem responsável.",
      "Encerramento feito por pressa, sem o texto de confirmação.",
    ],
    verificar: [
      "Nota (IW21): registrar o problema com equipamento, sintoma e parada.",
      "Ordem (IW31): criar a partir da nota, com tipo, prioridade e plano quando houver.",
      "Planejamento e liberação: material, mão de obra e data definidos.",
      "Execução: registrar o serviço e as paradas.",
      "Confirmação (IW41): horas e texto do que foi feito e da causa.",
      "Encerramento técnico: conferir a confirmação e encerrar a ordem.",
    ],
    acoes: [
      "Triagem diária das notas novas, com prioridade e responsável.",
      "Não encerrar ordem sem confirmação e sem causa registrada nas quebras.",
    ],
    praticas: [
      "Confirme as horas no mesmo turno da execução.",
      "Use o texto de confirmação com causa e ação, em frase curta e objetiva.",
    ],
    links: [
      { rotulo: "Notas", rota: "/notas" },
      { rotulo: "Ordens", rota: "/ordens" },
      { rotulo: "Execução das atividades", rota: "/execucao" },
    ],
  },
  {
    id: "apontamento_horas",
    area: "pcm_sap",
    titulo: "Apontamento de horas (IW41 e IW47)",
    resumo: "Como apontar horas e trabalho em uma ordem e como conferir as confirmações lançadas.",
    palavras: ["apontamento", "horas", "HH", "confirmacao", "IW41", "IW47", "trabalho realizado", "hora homem"],
    sintomas: [
      "HH de uma ordem muito abaixo ou acima do que foi executado.",
      "Ordem com confirmação de outra pessoa ou de outro turno.",
      "Custo de mão de obra sem bater com a equipe.",
    ],
    causas: [
      "Apontamento feito só no fim da semana, de memória.",
      "Mesma ordem apontada duas vezes, ou com a pessoa errada.",
      "Tempo de trabalho e tempo de espera misturados.",
    ],
    verificar: [
      "Conferir na lista de confirmações (IW47) as horas por pessoa e por ordem.",
      "Comparar com a escala e com o registro de execução do turno.",
      "Verificar se há confirmação duplicada na mesma ordem.",
    ],
    acoes: [
      "Corrigir a confirmação errada pela própria transação, com o motivo registrado.",
      "Orientar a equipe a apontar no mesmo turno, com as horas reais do serviço.",
    ],
    praticas: [
      "Aponte só o tempo de trabalho na ordem; espera e deslocamento seguem o padrão do setor.",
      "Revise os apontamentos com o líder na reunião semanal.",
    ],
    links: [{ rotulo: "Mão de obra e backlog", rota: "/mao_de_obra" }],
  },
  {
    id: "planos_manutencao",
    area: "pcm_sap",
    titulo: "Planos de manutenção e listas de tarefas",
    resumo: "Planos de manutenção (IP10 e IP19) e listas de tarefas (IA05 e IA06): como são gerados, programados e usados nas ordens.",
    palavras: ["plano de manutencao", "IP10", "IP19", "IA05", "IA06", "lista de tarefas", "programacao", "preventiva", "ciclo"],
    sintomas: [
      "Ordem preventiva que não é gerada na data prevista.",
      "Plano com tarefa que não corresponde ao equipamento atual.",
      "Lista de tarefas desatualizada, com passos que não são mais feitos.",
    ],
    causas: [
      "Ciclo do plano ou data de início errados.",
      "Equipamento trocado sem atualização do plano.",
      "Lista de tarefas criada antes de uma mudança de processo.",
    ],
    verificar: [
      "IP02/IP03: conferir o plano, o ciclo e o objeto técnico. IP10: programar o plano (iniciar o ciclo e gerar as chamadas).",
      "IP19: conferir a programação e as datas das próximas ordens.",
      "IA05 e IA06: conferir as operações da lista de tarefas e os recursos estimados.",
      "Conferir se a ordem gerada pelo plano está com o tipo YM01.",
    ],
    acoes: [
      "Corrigir o ciclo, a data de início e o vínculo do equipamento no plano.",
      "Atualizar a lista de tarefas sempre que o procedimento mudar.",
      "Revisar os planos depois de cada análise de falha que aponte mudança de rotina.",
    ],
    praticas: [
      "Cada plano tem um responsável e uma revisão periódica.",
      "Use a lista de tarefas com o passo a passo e as medições esperadas.",
    ],
    links: [
      { rotulo: "Planos", rota: "/planos" },
      { rotulo: "Semanal", rota: "/semanal" },
    ],
  },

  // ───────────── Indicadores ─────────────
  {
    id: "mtbf",
    area: "indicadores",
    titulo: "MTBF: tempo médio entre falhas",
    resumo: "Tempo médio de operação entre duas quebras consecutivas: fórmula, leitura e cuidados na interpretação.",
    palavras: ["MTBF", "tempo medio entre falhas", "confiabilidade", "quebras", "falha"],
    texto: [
      "Fórmula: MTBF = tempo de operação no período ÷ número de quebras no período.",
      "Tempo de operação: tempo disponível para produzir, menos as paradas.",
      "MTBF maior indica equipamento mais confiável.",
    ],
    praticas: [
      "Calcule por equipamento e por tipo, nunca só na média geral da planta.",
      "Com poucas quebras, o indicador varia muito: olhe a tendência em vez de um único mês.",
      "Quebra é a ordem YM11 (nota Y1 convertida em ordem).",
    ],
    links: [
      { rotulo: "Quebras, MTBF e MTTR", rota: "/confiabilidade" },
      { rotulo: "MTBF e MTTR por tipo de ordem", rota: "/confiabilidade_tipos" },
    ],
  },
  {
    id: "mttr",
    area: "indicadores",
    titulo: "MTTR: tempo médio para reparo",
    resumo: "Tempo médio para restabelecer o equipamento após uma quebra: fórmula, o que entra no tempo e como reduzir.",
    palavras: ["MTTR", "tempo medio para reparo", "reparo", "parada", "tempo de reparo"],
    texto: [
      "Fórmula: MTTR = tempo total de reparo ÷ número de reparos no período.",
      "O tempo de reparo começa na quebra e termina com o equipamento liberado para produzir.",
      "MTTR alto aponta demora de diagnóstico, de material ou de equipe.",
    ],
    praticas: [
      "Separe o tempo de espera por material, por diagnóstico e por equipe, para achar a causa do MTTR alto.",
      "Mantenha peças críticas em estoque e planos de contingência para as falhas mais comuns.",
    ],
    links: [
      { rotulo: "Quebras, MTBF e MTTR", rota: "/confiabilidade" },
      { rotulo: "Mão de obra e backlog", rota: "/mao_de_obra" },
    ],
  },
  {
    id: "disponibilidade",
    area: "indicadores",
    titulo: "Disponibilidade física",
    resumo: "Percentual do tempo em que o equipamento esteve disponível para produzir, com fórmula e exemplo.",
    palavras: ["disponibilidade", "disponibilidade fisica", "OEE", "tempo disponivel", "parada"],
    texto: [
      "Fórmula da disponibilidade física = (tempo calendário − tempo de parada) ÷ tempo calendário × 100.",
      "Disponibilidade inerente = MTBF ÷ (MTBF + MTTR) × 100.",
      "Exemplo: em 720 h de mês, com 36 h de parada, a disponibilidade física é (720 − 36) ÷ 720 = 95 %.",
    ],
    praticas: [
      "Defina o que conta como parada (quebra, ajuste, troca de linha) e use a mesma regra em todos os equipamentos.",
      "Compare a disponibilidade com a meta da área, não com outra área de processo diferente.",
    ],
    links: [
      { rotulo: "Quebras, MTBF e MTTR", rota: "/confiabilidade" },
      { rotulo: "Indicadores SIM (MP)", rota: "/indicadores_sim" },
    ],
  },
  {
    id: "backlog",
    area: "indicadores",
    titulo: "Backlog de manutenção",
    resumo: "Volume de serviços pendentes da manutenção, medido em horas de trabalho, e como interpretá-lo.",
    palavras: ["backlog", "pendencias", "ordens abertas", "atraso", "HH pendente", "fila"],
    texto: [
      "Backlog (semanas) = HH estimadas das ordens abertas ÷ HH disponíveis por semana da equipe.",
      "Backlog de ordens = quantidade de ordens abertas, por tipo e por prioridade.",
      "Backlog em semanas acima de 2 a 3 sinaliza falta de capacidade ou de planejamento, conforme a planta.",
    ],
    praticas: [
      "Separe o backlog por prioridade e por tipo: preventiva atrasada pesa mais que melhoria.",
      "Revise o backlog toda semana, junto com a programação.",
    ],
    links: [{ rotulo: "Mão de obra e backlog", rota: "/mao_de_obra" }],
  },
  {
    id: "aderencia_programacao",
    area: "indicadores",
    titulo: "Aderência à programação",
    resumo: "Percentual das atividades programadas que foram executadas no prazo, com fórmula e causas comuns de desvio.",
    palavras: ["aderencia", "programacao", "programado", "semanal", "cumprimento", "execucao"],
    texto: [
      "Fórmula: aderência = atividades programadas e executadas no prazo ÷ atividades programadas × 100.",
      "Considere a atividade executada somente quando ela foi concluída dentro da semana programada.",
    ],
    praticas: [
      "Analise os desvios: falta de material, falta de equipe, quebra não prevista ou programação irreal.",
      "Programe com folga para as quebras, para não perder a aderência por causa delas.",
    ],
    links: [
      { rotulo: "Programação semanal", rota: "/semanal" },
      { rotulo: "Execução das atividades", rota: "/execucao" },
    ],
  },
  {
    id: "custo_manutencao",
    area: "indicadores",
    titulo: "Custo de manutenção",
    resumo: "Custo total de manutenção (mão de obra, materiais e serviços) e os indicadores de custo por área ou por equipamento.",
    palavras: ["custo", "custo de manutencao", "material", "mao de obra", "servicos", "orcamento", "gasto"],
    texto: [
      "Custo total de manutenção = custo de mão de obra (HH × custo da hora) + materiais + serviços de terceiros.",
      "Custo relativo = custo total de manutenção ÷ base de referência (produção, faturamento ou ativos), no mesmo período.",
      "Compare o custo com o orçamento da área, mês a mês, e explique os desvios.",
    ],
    praticas: [
      "Classifique o custo por tipo de ordem: corretiva custa mais que preventiva para o mesmo serviço.",
      "Use o custo por equipamento para decidir reforma, troca ou manutenção contínua.",
    ],
    links: [
      { rotulo: "Custos", rota: "/custos" },
      { rotulo: "Indicadores SIM (MP)", rota: "/indicadores_sim" },
    ],
  },
];

/** Normaliza para busca: sem acento e sem diferença de caixa. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function corpoDoGuia(g: Guia): string {
  return [...(g.sintomas ?? []), ...(g.causas ?? []), ...(g.verificar ?? []), ...(g.acoes ?? []), ...(g.praticas ?? []), ...(g.texto ?? [])]
    .join(" ");
}

/** Tira o plural simples de termos longos (ROLAMENTOS → rolamento). */
function raiz(t: string): string {
  if (t.length <= 4) return t;
  if (t.endsWith("es")) return t.slice(0, -2);
  if (t.endsWith("s")) return t.slice(0, -1);
  return t;
}

/**
 * Busca guias. Cada termo precisa aparecer em algum campo do guia; a nota soma título×5, palavras×4, resumo×2 e corpo×1.
 * Consulta vazia devolve todos os guias (da área, se informada) com nota 0, na ordem de GUIAS.
 */
export function buscarGuias(q: string, area?: Area): { guia: Guia; nota: number }[] {
  return buscarEm(GUIAS, q, area);
}

/** Mesma busca de `buscarGuias`, sobre uma lista qualquer de guias. */
export function buscarEm(lista: Guia[], q: string, area?: Area): { guia: Guia; nota: number }[] {
  const base = area ? lista.filter((g) => g.area === area) : lista;
  const termos = norm(q).split(/\s+/).filter(Boolean).map(raiz);
  if (termos.length === 0) return base.map((guia) => ({ guia, nota: 0 }));

  const resultados: { guia: Guia; nota: number }[] = [];
  for (const guia of base) {
    const titulo = norm(guia.titulo);
    const palavras = guia.palavras.map(norm);
    const resumo = norm(guia.resumo);
    const corpo = norm(corpoDoGuia(guia));
    let nota = 0;
    let achou = true;
    for (const t of termos) {
      let pontos = 0;
      if (titulo.includes(t)) pontos += 5;
      if (palavras.some((p) => p.includes(t))) pontos += 4;
      if (resumo.includes(t)) pontos += 2;
      if (corpo.includes(t)) pontos += 1;
      if (pontos === 0) {
        achou = false;
        break;
      }
      nota += pontos;
    }
    if (achou) resultados.push({ guia, nota });
  }
  return resultados.sort((a, b) => b.nota - a.nota);
}

export function guiaPorId(id: string): Guia | undefined {
  return GUIAS.find((g) => g.id === id);
}
