/**
 * Diagnóstico guiado: tipo de equipamento → sintoma → causas prováveis (em ordem de frequência), verificações
 * (em ordem), cuidado de segurança e guias relacionados (ids de `GUIAS`, em guias.ts).
 */
import type { Area } from "./guias";

export interface Sintoma {
  id: string;
  titulo: string;
  causas: string[];
  verificar: string[];
  seguranca?: string;
  guias: string[];
}

interface TipoEquipamento {
  id: string;
  titulo: string;
  area: Area;
  sintomas: Sintoma[];
}

export const TIPOS_EQUIPAMENTO: TipoEquipamento[] = [
  {
    id: "motor_eletrico",
    titulo: "Motor elétrico",
    area: "eletrica",
    sintomas: [
      {
        id: "aquecimento",
        titulo: "Aquecimento",
        causas: [
          "Sobrecarga ou corrente acima da placa.",
          "Ventilação obstruída ou aleta do ventilador danificada.",
          "Desequilíbrio ou falta de tensão entre fases.",
          "Rolamento com atrito alto.",
        ],
        verificar: [
          "Medir a corrente nas três fases e comparar com a placa.",
          "Medir a tensão nas três fases, com o motor em carga.",
          "Verificar a limpeza da carcaça, da grade e do ventilador.",
          "Medir a temperatura do rolamento e a vibração do mancal.",
        ],
        seguranca: "Medições com o painel energizado só por profissional autorizado (NR-10), com EPI e instrumento de categoria CAT adequada; para qualquer intervenção, bloquear (LOTO).",
        guias: ["motores_inducao", "medicoes_isolamento", "rolamentos"],
      },
      {
        id: "nao_liga",
        titulo: "Não liga",
        causas: [
          "Falta de alimentação, fusível ou disjuntor aberto.",
          "Contator ou relé térmico desarmado ou com contato ruim.",
          "Falta de fase ou fase aberta na alimentação.",
          "Comando sem tensão (botão, chave ou PLC).",
        ],
        verificar: [
          "Medir a tensão na entrada do painel e no motor.",
          "Verificar fusíveis, disjuntor e relé térmico (rearme).",
          "Medir a tensão na bobina do contator com o comando acionado.",
          "Confirmar o sinal de comando do CLP ou da botoeira.",
        ],
        seguranca: "Bloquear e testar a ausência de tensão antes de abrir o painel.",
        guias: ["contatores_rele_termico", "motores_inducao", "nr10"],
      },
      {
        id: "desarma",
        titulo: "Desarma (relé térmico ou disjuntor)",
        causas: [
          "Corrente de partida ou de carga acima do ajuste do relé.",
          "Falta de fase ou desequilíbrio, que sobe a corrente em uma fase.",
          "Isolamento degradado, com fuga para a carcaça.",
          "Ajuste do relé ou do disjuntor fora da corrente nominal.",
        ],
        verificar: [
          "Medir a corrente em cada fase durante a partida e em carga.",
          "Conferir o ajuste do relé com a corrente nominal da placa.",
          "Medir a resistência de isolamento com megôhmetro. Valor mínimo (IEEE 43, enrolamento de baixa tensão): 5 MΩ, corrigido para 40 °C; abaixo disso, não energizar.",
          "Verificar a carga mecânica (travamento, aperto de correia, alinhamento).",
        ],
        seguranca: "Antes de medir o isolamento, desenergizar, bloquear e descarregar o motor.",
        guias: ["contatores_rele_termico", "medicoes_isolamento", "motores_inducao"],
      },
      {
        id: "ruido",
        titulo: "Ruído",
        causas: [
          "Rolamento com defeito ou sem lubrificação.",
          "Ventilador batendo na tampa ou com aleta solta.",
          "Ruído magnético por entreferro irregular ou falta de fase.",
          "Desalinhamento ou acoplamento solto.",
        ],
        verificar: [
          "Ouvir com haste de metal ou estetoscópio no mancal para localizar a fonte.",
          "Verificar a folga do ventilador e a fixação das tampas.",
          "Verificar a alimentação das três fases e a corrente.",
          "Medir a vibração e comparar com a linha de base.",
        ],
        seguranca: "Bloquear (LOTO) antes de tocar no ventilador, na tampa ou no acoplamento.",
        guias: ["rolamentos", "alinhamento_eixos", "analise_vibracao"],
      },
      {
        id: "vibracao",
        titulo: "Vibração",
        causas: [
          "Desbalanceamento de rotor ou ventilador (sujeira ou peça perdida).",
          "Desalinhamento com o equipamento acionado.",
          "Base solta ou pé manco.",
          "Defeito de rolamento.",
        ],
        verificar: [
          "Medir a vibração nos dois mancais e nas três direções.",
          "Verificar a fixação do motor e a folga de cada parafuso da base.",
          "Verificar o alinhamento e a condição do acoplamento.",
          "Verificar se há sujeira acumulada no ventilador ou no rotor.",
        ],
        seguranca: "Bloquear (LOTO) antes de apertar a base, o acoplamento ou o ventilador; medir sem tocar em partes girantes.",
        guias: ["analise_vibracao", "alinhamento_eixos", "rolamentos"],
      },
    ],
  },
  {
    id: "rolamento_mancal",
    titulo: "Rolamento e mancal",
    area: "mecanica",
    sintomas: [
      {
        id: "aquecimento",
        titulo: "Aquecimento",
        causas: [
          "Falta de lubrificante, ou excesso que causa atrito.",
          "Contaminação da graxa ou do óleo.",
          "Sobrecarga ou desalinhamento.",
          "Ajuste apertado demais no eixo ou na caixa.",
        ],
        verificar: [
          "Conferir o tipo, a quantidade e a data do último reengraxe.",
          "Observar a graxa: cor, consistência e partículas.",
          "Medir o alinhamento do acoplamento ou da polia.",
          "Medir a temperatura do mancal em relação à leitura normal.",
        ],
        seguranca: "Bloquear o equipamento (LOTO) antes de tocar no mancal ou reengraxar.",
        guias: ["graxas", "contaminacao_lubrificante", "alinhamento_eixos"],
      },
      {
        id: "ruido",
        titulo: "Ruído",
        causas: [
          "Defeito na pista, nas esferas ou nos rolos.",
          "Falta de lubrificação.",
          "Contaminação por partículas.",
          "Folga excessiva no rolamento.",
        ],
        verificar: [
          "Ouvir o mancal com haste para localizar o ponto de ruído.",
          "Verificar a graxa quanto a partículas metálicas.",
          "Medir a vibração e comparar com a linha de base.",
          "Verificar a folga do eixo.",
        ],
        seguranca: "Nunca tocar partes girantes; girar à mão só com o equipamento bloqueado (LOTO).",
        guias: ["rolamentos", "analise_vibracao", "contaminacao_lubrificante"],
      },
      {
        id: "vibracao",
        titulo: "Vibração",
        causas: [
          "Defeito de rolamento, com pico nas frequências de defeito.",
          "Desalinhamento ou desbalanceamento do eixo.",
          "Ajuste errado (folga ou aperto).",
          "Passagem de corrente elétrica pelo rolamento.",
        ],
        verificar: [
          "Fazer espectro de vibração e identificar as frequências de defeito.",
          "Verificar o alinhamento e a fixação da caixa do mancal.",
          "Verificar o ajuste do rolamento e a folga radial.",
          "Inspecionar a pista e os elementos rolantes na desmontagem.",
        ],
        guias: ["analise_vibracao", "rolamentos", "alinhamento_eixos"],
      },
      {
        id: "vazamento",
        titulo: "Vazamento de graxa",
        causas: [
          "Excesso de graxa, que sai pela vedação.",
          "Vedação gasta ou danificada.",
          "Vedação em posição errada na montagem.",
        ],
        verificar: [
          "Conferir a quantidade aplicada e o intervalo de reengraxe.",
          "Inspecionar a vedação e a superfície do eixo.",
          "Verificar se o dreno está entupido e a graxa não tem para onde sair.",
        ],
        guias: ["intervalos_quantidade", "graxas"],
      },
    ],
  },
  {
    id: "redutor",
    titulo: "Redutor",
    area: "mecanica",
    sintomas: [
      {
        id: "aquecimento",
        titulo: "Aquecimento",
        causas: [
          "Nível de óleo baixo ou alto.",
          "Óleo com viscosidade errada ou degradado.",
          "Respiro entupido, sem troca de pressão interna.",
          "Sobrecarga ou partidas frequentes com carga.",
        ],
        verificar: [
          "Conferir o nível no visor, com o redutor parado e frio.",
          "Verificar o respiro e limpá-lo.",
          "Conferir o tipo e a viscosidade do óleo no manual.",
          "Medir a corrente do motor e comparar com a placa.",
        ],
        guias: ["redutores", "oleos"],
      },
      {
        id: "ruido",
        titulo: "Ruído de engrenamento",
        causas: [
          "Desgaste de dentes ou folga excessiva.",
          "Rolamento do eixo com defeito.",
          "Óleo contaminado com partículas abrasivas.",
          "Desalinhamento com o motor.",
        ],
        verificar: [
          "Coletar amostra de óleo e verificar partículas e água.",
          "Verificar o alinhamento do motor com o redutor.",
          "Medir a vibração nos mancais do redutor.",
        ],
        guias: ["redutores", "analise_vibracao", "contaminacao_lubrificante"],
      },
      {
        id: "vazamento",
        titulo: "Vazamento de óleo",
        causas: [
          "Retentor gasto ou danificado.",
          "Respiro entupido, com pressão interna alta.",
          "Nível de óleo acima do máximo.",
          "Juntas ou bujões soltos.",
        ],
        verificar: [
          "Limpar a área e observar de onde o óleo sai.",
          "Verificar o respiro e o nível.",
          "Verificar o aperto dos bujões e das juntas.",
        ],
        guias: ["redutores", "oleos"],
      },
      {
        id: "perda_torque",
        titulo: "Perda de torque ou patinagem",
        causas: [
          "Desgaste de dentes, com folga excessiva.",
          "Acoplamento motor-redutor com elemento gasto.",
          "Carga acima do nominal do redutor.",
        ],
        verificar: [
          "Verificar o acoplamento e o estado do elemento elástico.",
          "Medir a corrente do motor em carga.",
          "Verificar a folga do eixo de saída.",
        ],
        guias: ["acoplamentos", "redutores"],
      },
    ],
  },
  {
    id: "correia_polia",
    titulo: "Correia e polia",
    area: "mecanica",
    sintomas: [
      {
        id: "patinando",
        titulo: "Patinando (perda de rotação)",
        causas: [
          "Tensão insuficiente da correia.",
          "Correia gasta ou com óleo.",
          "Polia com canal gasto.",
          "Correias de tipos ou comprimentos misturados.",
        ],
        verificar: [
          "Medir a flecha da correia e comparar com 1,6 % do vão.",
          "Verificar óleo ou graxa na correia e nas polias.",
          "Conferir os canais das polias.",
        ],
        seguranca: "Bloquear o equipamento antes de ajustar a tensão ou trocar a correia.",
        guias: ["correias_polias"],
      },
      {
        id: "desgaste",
        titulo: "Desgaste ou trinca na correia",
        causas: [
          "Polias desalinhadas, o que faz a correia atritar nas bordas.",
          "Tensão excessiva.",
          "Calor ou óleo, que endurecem a borracha.",
        ],
        verificar: [
          "Alinhar as polias e verificar o desvio entre canais.",
          "Verificar a tensão com o fabricante da correia.",
          "Inspecionar o ambiente quanto a calor e óleo.",
        ],
        guias: ["correias_polias", "alinhamento_eixos"],
      },
      {
        id: "vibracao",
        titulo: "Vibração do conjunto",
        causas: [
          "Correia sem tensão uniforme entre as correias do conjunto.",
          "Polia desbalanceada ou empenada.",
          "Rolamento do motor ou do eixo com folga.",
        ],
        verificar: [
          "Verificar a tensão de cada correia do conjunto.",
          "Verificar o balanceamento e a fixação da polia.",
          "Medir a vibração nos mancais.",
        ],
        guias: ["correias_polias", "analise_vibracao"],
      },
    ],
  },
  {
    id: "bomba",
    titulo: "Bomba",
    area: "fluidos",
    sintomas: [
      {
        id: "perda_vazao",
        titulo: "Perda de vazão ou de pressão",
        causas: [
          "Entrada de ar na sucção.",
          "Filtro de sucção entupido.",
          "Rotação abaixo da nominal (motor ou acionamento).",
          "Desgaste interno da bomba.",
        ],
        verificar: [
          "Verificar o nível do reservatório e a estanqueidade da sucção.",
          "Limpar ou trocar o filtro de sucção.",
          "Medir a rotação do eixo e a tensão do motor.",
          "Medir a pressão de descarga com manômetro calibrado.",
        ],
        seguranca: "Bloquear (LOTO) e despressurizar antes de abrir o filtro ou a sucção.",
        guias: ["unidade_hidraulica", "motores_inducao"],
      },
      {
        id: "ruido",
        titulo: "Ruído (cavitação)",
        causas: [
          "Sucção restrita ou com ar.",
          "Fluido com temperatura alta ou viscosidade errada.",
          "Rotação acima da recomendada.",
        ],
        verificar: [
          "Verificar a altura de sucção e o diâmetro da tubulação.",
          "Verificar a temperatura e a viscosidade do fluido.",
          "Verificar se há espuma no reservatório.",
        ],
        seguranca: "Bloquear (LOTO) antes de abrir a sucção ou de ajustar válvulas.",
        guias: ["unidade_hidraulica", "oleos"],
      },
      {
        id: "vazamento",
        titulo: "Vazamento pelo selo",
        causas: [
          "Selo mecânico gasto ou danificado.",
          "Gaxeta mal ajustada.",
          "Eixo com marca ou desalinhado com a bomba.",
        ],
        verificar: [
          "Verificar a gaxeta e o gotejamento aceito pelo fabricante.",
          "Verificar o alinhamento do motor com a bomba.",
          "Inspecionar o eixo na região do selo.",
        ],
        seguranca: "Bloquear (LOTO) e despressurizar antes de trocar o selo ou a gaxeta; fluido quente ou pressurizado causa queimadura ou jato.",
        guias: ["alinhamento_eixos", "acoplamentos"],
      },
      {
        id: "aquecimento",
        titulo: "Aquecimento",
        causas: [
          "Operação com válvula fechada ou próxima do fechamento.",
          "Rolamento sem lubrificação.",
          "Desalinhamento com o motor.",
        ],
        verificar: [
          "Verificar a posição das válvulas de sucção e de descarga.",
          "Verificar o nível e a qualidade do lubrificante do mancal.",
          "Medir o alinhamento do acoplamento.",
        ],
        seguranca: "Não tocar na carcaça quente; bloquear (LOTO) antes de mexer em válvulas ou no mancal.",
        guias: ["rolamentos", "alinhamento_eixos"],
      },
    ],
  },
  {
    id: "cilindro_pneumatico",
    titulo: "Cilindro pneumático",
    area: "fluidos",
    sintomas: [
      {
        id: "lento",
        titulo: "Lento",
        causas: [
          "Regulador de vazão fechado demais.",
          "Vazamento interno pela vedação do pistão.",
          "Pressão de trabalho baixa.",
          "Filtragem ou lubrificação insuficientes.",
        ],
        verificar: [
          "Verificar a abertura dos reguladores de vazão.",
          "Medir a pressão na entrada do cilindro.",
          "Verificar o nível do lubrificador e o gotejamento.",
        ],
        seguranca: "Despressurizar antes de ajustar os reguladores de vazão; o cilindro pode se mover com ar residual.",
        guias: ["cilindros_pneumaticos", "frl"],
      },
      {
        id: "sem_forca",
        titulo: "Sem força suficiente",
        causas: [
          "Pressão de alimentação baixa.",
          "Diâmetro do cilindro pequeno para a carga.",
          "Vedação gasta, com passagem entre as câmaras.",
        ],
        verificar: [
          "Medir a pressão na entrada e na saída do FRL.",
          "Conferir o diâmetro do cilindro e a força de projeto.",
          "Procurar vazamento interno com o cilindro travado.",
        ],
        seguranca: "Despressurizar antes de desmontar conexões ou o cilindro.",
        guias: ["frl", "cilindros_pneumaticos", "vazamentos_ar"],
      },
      {
        id: "vazamento",
        titulo: "Vazamento pela haste",
        causas: [
          "Vedação da haste gasta.",
          "Haste riscada ou com corrosão.",
          "Sujeira na haste, que danifica a vedação.",
        ],
        verificar: [
          "Procurar vazamento com espuma de sabão na haste e nas conexões.",
          "Inspecionar a haste quanto a risco e corrosão.",
          "Verificar o raspador e o fole, quando existirem.",
        ],
        seguranca: "Despressurizar a linha antes de desmontar o cilindro.",
        guias: ["cilindros_pneumaticos", "vazamentos_ar"],
      },
      {
        id: "curso_incompleto",
        titulo: "Curso incompleto",
        causas: [
          "Fim de curso ou sensor mal posicionado.",
          "Carga desalinhada, forçando lateralmente o cilindro.",
          "Pressão insuficiente para vencer a carga.",
        ],
        verificar: [
          "Verificar a posição do sensor e do fim de curso.",
          "Verificar o alinhamento da carga e a fixação do cilindro.",
          "Medir a pressão de trabalho durante o curso.",
        ],
        seguranca: "Bloquear o movimento e despressurizar antes de ajustar o sensor ou o fim de curso.",
        guias: ["cilindros_pneumaticos", "valvulas_direcionais"],
      },
    ],
  },
  {
    id: "valvula_solenoide",
    titulo: "Válvula e solenoide",
    area: "fluidos",
    sintomas: [
      {
        id: "nao_comuta",
        titulo: "Não comuta",
        causas: [
          "Bobina sem tensão, ou bobina queimada.",
          "Carretel travado por sujeira ou verniz.",
          "Pressão piloto insuficiente.",
        ],
        verificar: [
          "Medir a tensão na bobina com o comando acionado.",
          "Ouvir o clique da comutação e verificar o LED de comando.",
          "Verificar a pressão de alimentação e de pilotagem.",
        ],
        seguranca: "Despressurizar antes de desmontar a válvula ou o carretel; bloquear o comando antes de trocar a bobina.",
        guias: ["valvulas_direcionais", "frl"],
      },
      {
        id: "bobina_aquecida",
        titulo: "Bobina aquecida ou queimada",
        causas: [
          "Tensão acima da nominal da bobina.",
          "Comando contínuo em válvula que deveria ser pulsada.",
          "Bobina com curto entre espiras.",
        ],
        verificar: [
          "Medir a tensão na bobina e comparar com a placa.",
          "Medir a resistência ôhmica da bobina.",
        ],
        seguranca: "Desenergizar antes de trocar a bobina.",
        guias: ["valvulas_direcionais", "medicoes_isolamento"],
      },
      {
        id: "vazamento",
        titulo: "Vazamento pela válvula",
        causas: [
          "Vedação interna gasta, com passagem entre as vias.",
          "Juntas do corpo ou conexões soltas.",
          "Ar úmido e sujo que desgasta a vedação.",
        ],
        verificar: [
          "Procurar vazamento com espuma nas juntas e conexões.",
          "Verificar a vedação da válvula com o comando desligado.",
          "Conferir a filtragem do ar.",
        ],
        seguranca: "Despressurizar antes de desmontar a válvula; cuidado com o jato de ar.",
        guias: ["valvulas_direcionais", "vazamentos_ar", "frl"],
      },
    ],
  },
  {
    id: "unidade_hidraulica",
    titulo: "Unidade hidráulica",
    area: "fluidos",
    sintomas: [
      {
        id: "perda_pressao",
        titulo: "Perda de pressão",
        causas: [
          "Nível de óleo baixo ou entrada de ar na sucção.",
          "Válvula de alívio desajustada.",
          "Bomba com desgaste interno.",
          "Filtro entupido.",
        ],
        verificar: [
          "Conferir o nível com o sistema frio e parado.",
          "Verificar o indicador de pressão do filtro.",
          "Medir a pressão com manômetro na linha de trabalho.",
        ],
        seguranca: "Despressurizar o sistema antes de abrir qualquer conexão.",
        guias: ["unidade_hidraulica", "oleos"],
      },
      {
        id: "aquecimento",
        titulo: "Óleo aquecendo",
        causas: [
          "Trabalho com pressão de alívio, o que gera calor.",
          "Trocador de calor ou ventilação obstruídos.",
          "Viscosidade errada para a temperatura de trabalho.",
        ],
        verificar: [
          "Medir a temperatura do óleo no reservatório.",
          "Verificar o trocador de calor e a ventilação do reservatório.",
          "Verificar a viscosidade do óleo com a análise.",
        ],
        seguranca: "Deixar o óleo esfriar antes de abrir o reservatório ou o trocador; bloquear (LOTO) antes de intervir.",
        guias: ["unidade_hidraulica", "oleos"],
      },
      {
        id: "ruido",
        titulo: "Ruído da bomba",
        causas: [
          "Ar na sucção, com cavitação.",
          "Filtro de sucção restrito.",
          "Viscosidade alta com óleo frio.",
        ],
        verificar: [
          "Verificar a sucção e o nível do óleo.",
          "Verificar o filtro de sucção.",
        ],
        seguranca: "Bloquear (LOTO) e despressurizar antes de abrir a sucção ou o filtro.",
        guias: ["unidade_hidraulica"],
      },
      {
        id: "contaminacao",
        titulo: "Óleo contaminado",
        causas: [
          "Água por respiro ou vedação.",
          "Partículas de desgaste de bomba ou de válvula.",
          "Óleo misturado com outro tipo.",
        ],
        verificar: [
          "Coletar amostra para análise de água e de partículas.",
          "Verificar o respiro e as vedações do reservatório.",
        ],
        seguranca: "Despressurizar e drenar com recipiente adequado; evitar contato do óleo com a pele; bloquear antes de abrir o sistema.",
        guias: ["contaminacao_lubrificante", "unidade_hidraulica"],
      },
    ],
  },
  {
    id: "inversor_frequencia",
    titulo: "Inversor de frequência",
    area: "eletrica",
    sintomas: [
      {
        id: "sobrecorrente",
        titulo: "Desarme por sobrecorrente",
        causas: [
          "Rampa de aceleração curta para a inércia da carga.",
          "Carga acima do nominal ou travamento mecânico.",
          "Curto no cabo ou no motor.",
          "Parâmetros do motor fora da placa.",
        ],
        verificar: [
          "Ler o código de falha e o momento do desarme no histórico.",
          "Medir a resistência de isolamento do cabo e do motor, com o inversor desenergizado e descarregado.",
          "Desconectar os cabos do motor dos bornes de saída do inversor antes de aplicar o megôhmetro.",
          "Conferir os parâmetros de corrente e tensão do motor com a placa.",
          "Conferir os tempos de rampa.",
        ],
        seguranca: "Aguardar a descarga dos capacitores (tempo indicado no manual) antes de abrir o inversor.",
        guias: ["inversores", "medicoes_isolamento"],
      },
      {
        id: "sobretensao",
        titulo: "Desarme por sobretensão",
        causas: [
          "Energia regenerada na desaceleração, sem frenagem.",
          "Tempo de desaceleração curto demais.",
          "Tensão da rede acima da nominal.",
        ],
        verificar: [
          "Verificar o tempo de desaceleração programado.",
          "Medir a tensão da rede na entrada do inversor.",
          "Verificar se existe resistor de frenagem e se está ligado.",
        ],
        seguranca: "Desenergizar e aguardar a descarga dos capacitores; bloquear o inversor antes de medir.",
        guias: ["inversores"],
      },
      {
        id: "subtensao",
        titulo: "Desarme por subtensão ou falta de fase",
        causas: [
          "Queda de tensão na rede, em partida de outro motor.",
          "Fusível ou contator de entrada aberto.",
          "Cabo de entrada subdimensionado ou com emenda ruim.",
        ],
        verificar: [
          "Medir a tensão nas três fases na entrada do inversor, em carga.",
          "Verificar fusíveis e contator de entrada.",
          "Verificar o aperto e o estado das conexões de entrada.",
        ],
        seguranca: "Medições com o painel energizado só por profissional autorizado (NR-10), com EPI e instrumento de categoria CAT adequada; para qualquer intervenção, bloquear (LOTO).",
        guias: ["inversores", "nr10"],
      },
      {
        id: "sobretemperatura",
        titulo: "Desarme por sobretemperatura",
        causas: [
          "Ventilador do inversor parado ou com filtro entupido.",
          "Painel sem ventilação ou ambiente quente.",
          "Frequência de chaveamento alta para a carga.",
        ],
        verificar: [
          "Verificar o funcionamento dos ventiladores do inversor e do painel.",
          "Limpar os filtros do painel e o dissipador.",
          "Medir a temperatura ambiente do painel.",
        ],
        seguranca: "Desenergizar e aguardar a descarga dos capacitores.",
        guias: ["inversores"],
      },
    ],
  },
  {
    id: "painel_comando",
    titulo: "Painel e comando",
    area: "eletrica",
    sintomas: [
      {
        id: "nao_liga",
        titulo: "Não liga",
        causas: [
          "Disjuntor de entrada ou de comando aberto.",
          "Fonte de comando sem tensão.",
          "Sinal de partida não chega ao CLP ou ao relé de comando.",
        ],
        verificar: [
          "Medir a tensão de entrada do painel e de comando.",
          "Verificar o disjuntor de comando e o fusível da fonte.",
          "Verificar o sinal da botoeira ou da chave na entrada do CLP.",
        ],
        seguranca: "Bloquear e testar a ausência de tensão antes de abrir o painel.",
        guias: ["nr10", "contatores_rele_termico"],
      },
      {
        id: "desarma",
        titulo: "Desarma",
        causas: [
          "Sobrecarga de circuito ou curto na saída.",
          "Fuga para a terra, com DR desarmando.",
          "Relé térmico ajustado abaixo da corrente real.",
        ],
        verificar: [
          "Verificar a corrente nos circuitos de saída.",
          "Medir a resistência de isolamento dos cabos desligados.",
          "Verificar o ajuste do relé térmico e do disjuntor.",
        ],
        seguranca: "Bloquear o circuito antes de medir a isolação.",
        guias: ["medicoes_isolamento", "aterramento", "contatores_rele_termico"],
      },
      {
        id: "contator",
        titulo: "Contator que não fecha ou aquece",
        causas: [
          "Tensão da bobina fora da faixa.",
          "Núcleo sujo ou com ferrugem.",
          "Contatos gastos ou terminais frouxos.",
        ],
        verificar: [
          "Medir a tensão na bobina com o comando acionado.",
          "Verificar o aperto dos terminais de potência.",
          "Verificar o estado dos contatos principais.",
        ],
        seguranca: "Bloquear e testar a ausência de tensão antes de tocar nos terminais ou no contator.",
        guias: ["contatores_rele_termico"],
      },
      {
        id: "aterramento",
        titulo: "Choque ou falha de terra",
        causas: [
          "Conexão de terra solta ou corroída.",
          "Falta de equipotencialização entre painel e máquina.",
          "Isolamento danificado em cabo ou componente.",
        ],
        verificar: [
          "Medir a continuidade entre a carcaça e o barramento de terra.",
          "Medir a resistência de aterramento com o terrômetro.",
          "Inspecionar terminais e hastes.",
        ],
        seguranca: "Isolar e impedir o uso do equipamento; não tocar a carcaça; medir desenergizado.",
        guias: ["aterramento", "nr10"],
      },
    ],
  },
  {
    id: "compressor",
    titulo: "Compressor",
    area: "fluidos",
    sintomas: [
      {
        id: "perda_pressao",
        titulo: "Não atinge a pressão",
        causas: [
          "Vazamento de ar na rede.",
          "Filtro de admissão entupido.",
          "Válvula de descarga ou de retenção com defeito.",
          "Consumo acima da capacidade do compressor.",
        ],
        verificar: [
          "Fazer o teste de vazamento com a produção parada.",
          "Verificar o filtro de admissão e o dreno.",
          "Verificar a válvula de retenção e a de descarga.",
        ],
        seguranca: "Bloquear (LOTO) e despressurizar.",
        guias: ["vazamentos_ar", "frl"],
      },
      {
        id: "aquecimento",
        titulo: "Aquecimento",
        causas: [
          "Trocador de calor (radiador) obstruído.",
          "Nível ou qualidade do óleo inadequados.",
          "Ventilação do ambiente insuficiente.",
        ],
        verificar: [
          "Limpar o trocador de calor e verificar o ventilador.",
          "Verificar o nível e a qualidade do óleo.",
          "Medir a temperatura de descarga.",
        ],
        seguranca: "Bloquear (LOTO) e despressurizar.",
        guias: ["oleos", "vazamentos_ar"],
      },
      {
        id: "ruido",
        titulo: "Ruído",
        causas: [
          "Correia frouxa ou polia desalinhada.",
          "Rolamento com defeito.",
          "Válvula de admissão solta ou desgastada.",
        ],
        verificar: [
          "Verificar a tensão e o alinhamento da correia.",
          "Medir a vibração dos mancais.",
          "Verificar a fixação das válvulas.",
        ],
        seguranca: "Bloquear (LOTO) e despressurizar.",
        guias: ["correias_polias", "analise_vibracao", "rolamentos"],
      },
      {
        id: "vazamento",
        titulo: "Vazamento de ar",
        causas: [
          "Conexões soltas ou sem vedante.",
          "Mangueira ou tubo rompido.",
          "Dreno de condensado travado aberto.",
        ],
        verificar: [
          "Procurar vazamento com detector ultrassônico ou espuma.",
          "Verificar os drenos automáticos.",
        ],
        seguranca: "Bloquear (LOTO) e despressurizar.",
        guias: ["vazamentos_ar"],
      },
    ],
  },
  {
    id: "esteira_transportador",
    titulo: "Esteira e transportador",
    area: "mecanica",
    sintomas: [
      {
        id: "desalinhada",
        titulo: "Desalinhada ou desliza para um lado",
        causas: [
          "Rolos ou tambores desalinhados.",
          "Carga mal distribuída na esteira.",
          "Acúmulo de material em um dos lados.",
        ],
        verificar: [
          "Verificar o alinhamento dos rolos e dos tambores.",
          "Verificar a distribuição da carga e a limpeza das raspadeiras.",
          "Verificar a tensão da esteira.",
        ],
        seguranca: "Bloquear o acionamento (LOTO) antes de qualquer ajuste na esteira.",
        guias: ["alinhamento_eixos", "nr12"],
      },
      {
        id: "ruido",
        titulo: "Ruído ou batida",
        causas: [
          "Rolete com rolamento defeituoso.",
          "Emenda da esteira ou corrente com elo gasto.",
          "Material preso entre a esteira e a estrutura.",
        ],
        verificar: [
          "Girar os roletes à mão, com a máquina bloqueada, e procurar travamento.",
          "Verificar a emenda e o estado dos elos.",
          "Inspecionar a estrutura por material preso.",
        ],
        seguranca: "Bloquear o acionamento (LOTO) antes de abrir proteções ou de girar os roletes à mão.",
        guias: ["rolamentos", "loto"],
      },
      {
        id: "travada",
        titulo: "Travada ou com esforço alto",
        causas: [
          "Corpo estranho preso no transportador.",
          "Rolete ou tambor sem girar.",
          "Sobrecarga ou sobrecorrente do motor.",
        ],
        verificar: [
          "Bloquear e verificar o caminho da esteira.",
          "Medir a corrente do motor em carga.",
          "Verificar o redutor e o acoplamento.",
        ],
        seguranca: "Nunca retirar material com a esteira energizada: bloquear e aplicar a permissão de trabalho.",
        guias: ["loto", "permissao_trabalho", "redutores"],
      },
      {
        id: "desgaste",
        titulo: "Desgaste acelerado",
        causas: [
          "Material abrasivo ou sujo no transportador.",
          "Tensão excessiva da esteira.",
          "Falta de lubrificação da corrente ou dos mancais.",
        ],
        verificar: [
          "Verificar a tensão e o alinhamento da esteira.",
          "Verificar o plano de lubrificação da corrente e dos mancais.",
        ],
        guias: ["intervalos_quantidade", "alinhamento_eixos"],
      },
    ],
  },
  {
    id: "aquecimento_resistencia",
    titulo: "Aquecimento e resistência elétrica",
    area: "eletrica",
    sintomas: [
      {
        id: "nao_aquece",
        titulo: "Não aquece",
        causas: [
          "Resistência queimada (interrompida).",
          "Termostato ou sensor de temperatura com defeito.",
          "Falta de tensão no circuito de potência.",
        ],
        verificar: [
          "Medir a resistência ôhmica da resistência com o circuito desligado.",
          "Verificar o termostato ou a sonda com o multímetro.",
          "Medir a tensão na alimentação da resistência com o comando ligado.",
        ],
        seguranca: "Desenergizar e aguardar o resfriamento antes de tocar na resistência.",
        guias: ["medicoes_isolamento", "nr10"],
      },
      {
        id: "aquece_demais",
        titulo: "Aquece demais",
        causas: [
          "Termostato ajustado acima da temperatura de processo.",
          "Sensor mal posicionado, lendo temperatura errada.",
          "Relé de estado sólido ou contator preso ligado.",
        ],
        verificar: [
          "Conferir o ajuste do controlador de temperatura.",
          "Verificar a posição do sensor na zona de aquecimento.",
          "Verificar se o contator ou o relé de estado sólido está preso fechado.",
        ],
        seguranca: "Desenergizar antes de trocar sensores ou atuadores.",
        guias: ["contatores_rele_termico", "nr10"],
      },
      {
        id: "desarma",
        titulo: "Desarma o disjuntor ou o fusível",
        causas: [
          "Curto ou fuga para a carcaça da resistência.",
          "Resistência com umidade ou isolação degradada.",
          "Ajuste do disjuntor abaixo da corrente da resistência.",
        ],
        verificar: [
          "Medir a resistência de isolamento da resistência e do cabo.",
          "Medir a corrente da resistência e comparar com o disjuntor.",
        ],
        seguranca: "Medir a isolação com o circuito bloqueado e descarregado.",
        guias: ["medicoes_isolamento", "aterramento"],
      },
    ],
  },
  {
    id: "sensor",
    titulo: "Sensor",
    area: "eletrica",
    sintomas: [
      {
        id: "sem_sinal",
        titulo: "Sem sinal",
        causas: [
          "Sensor sem alimentação.",
          "Cabo rompido ou conexão solta.",
          "Sensor com defeito interno.",
        ],
        verificar: [
          "Medir a tensão de alimentação no conector do sensor.",
          "Verificar a continuidade do cabo.",
          "Verificar a conexão no módulo de entrada do CLP.",
        ],
        seguranca: "Medir com o circuito desenergizado ou com instrumento de categoria adequada; não tocar em terminais energizados.",
        guias: ["medicoes_isolamento", "nr10"],
      },
      {
        id: "sinal_instavel",
        titulo: "Sinal instável",
        causas: [
          "Ruído elétrico por cabo passando junto de cabo de potência.",
          "Aterramento ruim ou malha de blindagem sem ligação.",
          "Alvo ou sensor com folga na fixação.",
        ],
        verificar: [
          "Verificar a separação entre o cabo do sensor e os cabos de potência.",
          "Medir a continuidade da blindagem e do aterramento.",
          "Verificar a fixação do sensor e a distância ao alvo.",
        ],
        seguranca: "Bloquear antes de mexer nos cabos ou na blindagem; não tocar em partes energizadas.",
        guias: ["aterramento", "medicoes_isolamento"],
      },
      {
        id: "leitura_errada",
        titulo: "Leitura errada",
        causas: [
          "Sensor fora de calibração ou com ajuste de distância errado.",
          "Alvo sujo ou com mudança de material.",
          "Escala ou unidade configurada errada no controlador.",
        ],
        verificar: [
          "Conferir a escala e a unidade no controlador.",
          "Verificar a limpeza do alvo e a distância de detecção.",
          "Comparar a leitura com um instrumento de referência.",
        ],
        seguranca: "Ajustar o sensor com o equipamento bloqueado (LOTO) ou com a alimentação segura; ajustes no controlador podem alterar o processo, então confirmar com a operação.",
        guias: ["medicoes_isolamento"],
      },
    ],
  },
];

/** Devolve o sintoma do tipo, ou null quando o tipo ou o sintoma não existe. */
export function diagnosticar(tipo: string, sintoma: string): Sintoma | null {
  const t = TIPOS_EQUIPAMENTO.find((x) => x.id === tipo);
  return t?.sintomas.find((s) => s.id === sintoma) ?? null;
}
