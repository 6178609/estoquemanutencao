/**
 * Visualizador 3D de falhas: modelos esquemáticos (um por tipo de equipamento), peças nomeadas e marcadores
 * (causa provável → peça onde ela aparece). Puro: sem three.js, para ser testado e usado no servidor também.
 * Cada `id` de peça é o `name` do grupo/malha no componente 3D; todo marcador aponta para uma peça existente.
 */

export type IdModelo = "rolamento" | "motor" | "redutor" | "correia" | "bomba" | "cilindro" | "valvula" | "esteira";

/** Modelos que já têm cena 3D (`Cena.tsx`). Fonte única: a cena e o diagnóstico usam esta lista. */
export const MODELOS_COM_CENA = ["rolamento", "motor"] as const;
export type ModeloComCena = (typeof MODELOS_COM_CENA)[number];

export function temCena(modelo: IdModelo): modelo is ModeloComCena {
  return (MODELOS_COM_CENA as readonly string[]).includes(modelo);
}

export interface PecaModelo {
  id: string;
  nome: string;
}

export interface Modelo {
  titulo: string;
  pecas: PecaModelo[];
}

export interface Marcador {
  peca: string;
  titulo: string;
  explicacao: string;
}

export const MODELOS: Record<IdModelo, Modelo> = {
  rolamento: {
    titulo: "Rolamento",
    pecas: [
      { id: "anel_externo", nome: "Anel externo" },
      { id: "anel_interno", nome: "Anel interno" },
      { id: "pista_externa", nome: "Pista externa" },
      { id: "pista_interna", nome: "Pista interna" },
      { id: "esferas", nome: "Esferas" },
      { id: "gaiola", nome: "Gaiola" },
      { id: "vedacao", nome: "Vedação (blindagem)" },
    ],
  },
  motor: {
    titulo: "Motor elétrico",
    pecas: [
      { id: "carcaca", nome: "Carcaça aletada" },
      { id: "tampas", nome: "Tampas" },
      { id: "estator", nome: "Estator (bobinas)" },
      { id: "rotor", nome: "Rotor" },
      { id: "eixo", nome: "Eixo" },
      { id: "rolamento_dianteiro", nome: "Rolamento dianteiro" },
      { id: "rolamento_traseiro", nome: "Rolamento traseiro" },
      { id: "ventilador", nome: "Ventilador" },
      { id: "tampa_ventilador", nome: "Tampa do ventilador" },
      { id: "caixa_ligacao", nome: "Caixa de ligação" },
    ],
  },
  redutor: {
    titulo: "Redutor",
    pecas: [
      { id: "carcaca", nome: "Carcaça" },
      { id: "pinhao", nome: "Pinhão" },
      { id: "coroa", nome: "Coroa" },
      { id: "eixo_entrada", nome: "Eixo de entrada" },
      { id: "eixo_saida", nome: "Eixo de saída" },
      { id: "rolamentos", nome: "Rolamentos" },
      { id: "retentores", nome: "Retentores" },
      { id: "nivel_oleo", nome: "Nível de óleo" },
    ],
  },
  correia: {
    titulo: "Correia e polias",
    pecas: [
      { id: "polia_motora", nome: "Polia motora" },
      { id: "polia_movida", nome: "Polia movida" },
      { id: "correia", nome: "Correia" },
      { id: "eixos", nome: "Eixos" },
      { id: "tensor", nome: "Tensor" },
    ],
  },
  bomba: {
    titulo: "Bomba centrífuga",
    pecas: [
      { id: "voluta", nome: "Voluta" },
      { id: "rotor", nome: "Rotor" },
      { id: "eixo", nome: "Eixo" },
      { id: "selo_mecanico", nome: "Selo mecânico" },
      { id: "rolamentos", nome: "Rolamentos" },
      { id: "acoplamento", nome: "Acoplamento" },
      { id: "succao", nome: "Sucção" },
      { id: "recalque", nome: "Recalque" },
    ],
  },
  cilindro: {
    titulo: "Cilindro pneumático",
    pecas: [
      { id: "camisa", nome: "Camisa" },
      { id: "haste", nome: "Haste" },
      { id: "embolo", nome: "Êmbolo" },
      { id: "vedacao_embolo", nome: "Vedação do êmbolo" },
      { id: "vedacao_haste", nome: "Vedação da haste" },
      { id: "cabecotes", nome: "Cabeçotes" },
      { id: "amortecimento", nome: "Amortecimento" },
      { id: "conexoes", nome: "Conexões de ar" },
    ],
  },
  valvula: {
    titulo: "Válvula solenoide",
    pecas: [
      { id: "corpo", nome: "Corpo" },
      { id: "carretel", nome: "Carretel" },
      { id: "bobina", nome: "Bobina" },
      { id: "molas", nome: "Molas" },
      { id: "vedacoes", nome: "Vedações" },
      { id: "escapes", nome: "Escapes" },
      { id: "acionamento_manual", nome: "Acionamento manual" },
    ],
  },
  esteira: {
    titulo: "Esteira transportadora",
    pecas: [
      { id: "tambor_acionamento", nome: "Tambor de acionamento" },
      { id: "tambor_retorno", nome: "Tambor de retorno" },
      { id: "roletes", nome: "Roletes" },
      { id: "correia", nome: "Correia" },
      { id: "raspador", nome: "Raspador" },
      { id: "mancais", nome: "Mancais" },
      { id: "esticador", nome: "Esticador" },
    ],
  },
};

/** Tipo de equipamento (ids de TIPOS_EQUIPAMENTO) → modelo 3D. Tipos fora deste mapa não mostram o bloco. */
export const MODELO_DO_TIPO: Partial<Record<string, IdModelo>> = {
  rolamento_mancal: "rolamento",
  motor_eletrico: "motor",
  redutor: "redutor",
  correia_polia: "correia",
  bomba: "bomba",
  cilindro_pneumatico: "cilindro",
  valvula_solenoide: "valvula",
  esteira_transportador: "esteira",
};

/** Tipo → sintoma → marcadores (causas prováveis ligadas à peça onde aparecem). */
export const MARCADORES: Record<string, Record<string, Marcador[]>> = {
  rolamento_mancal: {
    aquecimento: [
      { peca: "pista_externa", titulo: "Lubrificação insuficiente ou em excesso", explicacao: "Sem película de graxa, o contato entre esferas e pista gera atrito e calor; graxa em excesso também aquece por agitação." },
      { peca: "vedacao", titulo: "Graxa contaminada", explicacao: "Poeira e umidade que passam pela vedação degradam a graxa e aumentam o atrito." },
      { peca: "gaiola", titulo: "Gaiola roçando nas esferas", explicacao: "Folga ou sobrecarga fazem a gaiola atritar nas esferas, gerando calor." },
    ],
    ruido: [
      { peca: "gaiola", titulo: "Gaiola quebrada ou desgastada", explicacao: "Falta de lubrificação, sobrevelocidade ou montagem errada; a gaiola folgada bate e faz ruído." },
      { peca: "pista_externa", titulo: "Lascamento (spalling) da pista externa", explicacao: "Fadiga do material ou sobrecarga soltam lascas; cada esfera que passa pela lasca produz um impacto audível." },
      { peca: "esferas", titulo: "Esfera com marca ou lascada", explicacao: "Defeito na superfície da esfera gera um impacto a cada volta." },
      { peca: "vedacao", titulo: "Vedação ou blindagem danificada", explicacao: "Vedação rompida deixa entrar partículas, que causam ruído e desgastam as pistas." },
    ],
    vibracao: [
      { peca: "pista_externa", titulo: "Defeito na pista externa", explicacao: "Aparece pico de vibração na frequência de defeito da pista externa, que fica parada." },
      { peca: "pista_interna", titulo: "Defeito na pista interna", explicacao: "Aparece pico na frequência de defeito da pista interna, que gira com o eixo." },
      { peca: "esferas", titulo: "Esferas com diâmetros desiguais ou danificadas", explicacao: "Esferas fora de medida ou com defeito geram vibração periódica." },
      { peca: "anel_interno", titulo: "Ajuste apertado ou folga no eixo", explicacao: "Ajuste errado no eixo deforma a pista e aumenta a vibração." },
    ],
    vazamento: [
      { peca: "vedacao", titulo: "Vedação gasta ou danificada", explicacao: "Lábio rompido ou desgastado deixa a graxa sair." },
      { peca: "anel_externo", titulo: "Excesso de graxa no alojamento", explicacao: "Graxa em excesso não tem para onde ir e empurra pela vedação." },
    ],
  },
  motor_eletrico: {
    aquecimento: [
      { peca: "estator", titulo: "Corrente acima da placa ou fases desequilibradas", explicacao: "Sobrecarga ou desequilíbrio entre fases aquecem as bobinas do estator, onde a perda por efeito Joule é maior." },
      { peca: "ventilador", titulo: "Ventilador parado ou com aleta danificada", explicacao: "Sem fluxo de ar, a carcaça perde a capacidade de dissipar calor." },
      { peca: "tampa_ventilador", titulo: "Entrada de ar obstruída", explicacao: "Grade cheia de poeira ou sujeira bloqueia a ventilação e aquece o motor." },
      { peca: "rolamento_dianteiro", titulo: "Rolamento com atrito alto", explicacao: "Falta de graxa ou contaminação aumentam o atrito e o calor no mancal." },
    ],
    nao_liga: [
      { peca: "caixa_ligacao", titulo: "Falta de fase ou borne frouxo", explicacao: "Fase aberta ou borne solto impede a partida, ou o motor zumbe sem girar." },
      { peca: "estator", titulo: "Bobina aberta", explicacao: "Bobina interrompida ou em curto impede a formação do campo girante." },
      { peca: "rotor", titulo: "Rotor travado", explicacao: "Carga mecânica excessiva ou rolamento agarrado impede o giro." },
    ],
    desarma: [
      { peca: "estator", titulo: "Isolação degradada ou fuga para a carcaça", explicacao: "A isolação das bobinas perde a resistência; a fuga de corrente faz o disjuntor ou o DR (IDR) desarmar." },
      { peca: "caixa_ligacao", titulo: "Desequilíbrio ou falta de fase", explicacao: "Com uma fase faltando ou desequilibrada, a corrente sobe nas outras e o relé desarma." },
      { peca: "rotor", titulo: "Travamento ou sobrecarga mecânica", explicacao: "Com o rotor travado, a corrente fica alta e fixa, e a partida se prolonga até o relé térmico desarmar." },
    ],
    ruido: [
      { peca: "ventilador", titulo: "Ventilador batendo na tampa ou com aleta solta", explicacao: "Folga do ventilador na tampa ou aleta solta geram ruído de atrito e batida." },
      { peca: "tampa_ventilador", titulo: "Tampa do ventilador solta ou trincada", explicacao: "A tampa vibra e roça no ventilador quando não está bem fixada." },
      { peca: "rolamento_traseiro", titulo: "Defeito de rolamento ou falta de lubrificação", explicacao: "Pista ou esferas danificadas geram rugido ou batida no mancal." },
      { peca: "estator", titulo: "Ruído magnético do entreferro", explicacao: "Entreferro irregular ou falta de fase geram zumbido magnético." },
    ],
    vibracao: [
      { peca: "rotor", titulo: "Desbalanceamento do rotor", explicacao: "Massa desigual ou peça perdida no rotor gera vibração na rotação." },
      { peca: "ventilador", titulo: "Desbalanceamento do ventilador", explicacao: "Sujeira acumulada ou pá perdida desbalanceia o ventilador." },
      { peca: "rolamento_dianteiro", titulo: "Defeito de rolamento", explicacao: "As frequências de defeito aparecem no espectro de vibração do mancal." },
      { peca: "carcaca", titulo: "Pé manco (soft foot)", explicacao: "A base empenada deforma a carcaça e desalinha o motor; a vibração aparece em 1× a rotação e em 2× a frequência da rede." },
    ],
  },
  redutor: {
    aquecimento: [
      { peca: "nivel_oleo", titulo: "Nível de óleo fora da faixa", explicacao: "Nível baixo deixa as engrenagens sem lubrificação; nível alto gera agitação e calor." },
      { peca: "carcaca", titulo: "Respiro entupido ou óleo degradado", explicacao: "Respiro entupido impede a troca de pressão interna, e óleo com viscosidade errada perde película e aquece o redutor." },
      { peca: "pinhao", titulo: "Engrenamento sobrecarregado", explicacao: "Sobrecarga ou partidas com carga aumentam o atrito entre os dentes." },
      { peca: "rolamentos", titulo: "Rolamento com atrito alto", explicacao: "Falta de lubrificação ou carga excessiva eleva o atrito no mancal do eixo." },
    ],
    ruido: [
      { peca: "pinhao", titulo: "Dentes do pinhão desgastados", explicacao: "Desgaste e folga excessiva nos dentes geram ruído de choque a cada engrenamento." },
      { peca: "coroa", titulo: "Dentes da coroa com pitting ou lascados", explicacao: "Fadiga superficial ou dentes lascados causam ruído periódico no engrenamento." },
      { peca: "rolamentos", titulo: "Rolamento do eixo com defeito", explicacao: "Pista ou esferas danificadas geram ruído que se confunde com o do engrenamento." },
      { peca: "carcaca", titulo: "Óleo contaminado com partículas abrasivas", explicacao: "Partículas abrasivas no óleo desgastam os dentes e aumentam a folga, o que deixa o engrenamento ruidoso." },
    ],
    vazamento: [
      { peca: "retentores", titulo: "Retentor gasto ou danificado", explicacao: "O lábio do retentor gasto deixa o óleo passar pelo eixo." },
      { peca: "eixo_saida", titulo: "Eixo marcado na região do retentor", explicacao: "Marca ou desgaste no eixo impede o retentor novo de vedar." },
      { peca: "nivel_oleo", titulo: "Nível de óleo acima do máximo", explicacao: "Excesso de óleo, com pressão interna alta, empurra o óleo pelas vedações." },
      { peca: "carcaca", titulo: "Juntas ou bujões soltos", explicacao: "Juntas e bujões com aperto ou vedação ruins deixam o óleo escapar." },
    ],
    perda_torque: [
      { peca: "pinhao", titulo: "Dente quebrado ou desgaste severo", explicacao: "Dente quebrado ou muito gasto deixa o engrenamento deslizar e o torque não chega à coroa." },
      { peca: "eixo_saida", titulo: "Chaveta cisalhada ou cubo frouxo no eixo de saída", explicacao: "Com a chaveta cisalhada ou o cubo frouxo, o eixo gira sem levar a carga na mesma proporção." },
      { peca: "eixo_entrada", titulo: "Elemento do acoplamento rompido ou limitador de torque patinando", explicacao: "Elemento rompido ou limitador de torque que patina separa o motor do redutor, e o torque não chega ao eixo." },
    ],
  },
  correia_polia: {
    patinando: [
      { peca: "correia", titulo: "Tensão insuficiente", explicacao: "Pouca tensão faz a correia escorregar nas polias, sobretudo na partida." },
      { peca: "correia", titulo: "Correia gasta ou com óleo", explicacao: "Óleo ou borracha vitrificada reduzem o atrito entre a correia e a polia." },
      { peca: "polia_motora", titulo: "Canal da polia gasto", explicacao: "Canal gasto e com degraus não prende a correia, que afunda e patina." },
      { peca: "correia", titulo: "Correias de tipos ou comprimentos misturados", explicacao: "Correias diferentes trabalham com tensões diferentes, e a mais curta patina." },
    ],
    desgaste: [
      { peca: "correia", titulo: "Borda da correia desfiada ou trincada", explicacao: "O atrito nas bordas, somado a calor ou óleo, endurece a borracha e a faz trincar." },
      { peca: "eixos", titulo: "Polias desalinhadas", explicacao: "Eixos fora de paralelo fazem a correia atritar nas bordas das polias." },
      { peca: "correia", titulo: "Tensão excessiva", explicacao: "Tensão excessiva estica a correia e sobrecarrega os mancais." },
    ],
    vibracao: [
      { peca: "correia", titulo: "Tensão desigual entre as correias", explicacao: "Com várias correias, tensões diferentes fazem umas trabalharem mais que outras e vibrarem." },
      { peca: "polia_motora", titulo: "Polia desbalanceada ou empenada", explicacao: "Massa desigual ou empenamento da polia gera vibração na rotação." },
      { peca: "tensor", titulo: "Tensor com folga", explicacao: "Tensor com folga deixa a correia saltar e bater." },
      { peca: "eixos", titulo: "Mancal do eixo com folga", explicacao: "Folga no rolamento do eixo deixa a polia oscilar e vibrar." },
    ],
  },
  bomba: {
    perda_vazao: [
      { peca: "succao", titulo: "Entrada de ar na sucção", explicacao: "Ar ou vazamento na sucção reduz a vazão e a pressão." },
      { peca: "succao", titulo: "Filtro de sucção entupido", explicacao: "Filtro sujo aumenta a perda de carga na entrada e reduz a vazão." },
      { peca: "rotor", titulo: "Desgaste interno do rotor", explicacao: "Folgas maiores entre rotor e voluta deixam o líquido recircular e a vazão cair." },
    ],
    ruido: [
      { peca: "rotor", titulo: "Cavitação nas pás do rotor", explicacao: "Bolhas de vapor colapsam nas pás, com ruído de cascalho e erosão." },
      { peca: "succao", titulo: "Sucção restrita ou com ar", explicacao: "Altura de sucção alta ou tubulação estreita reduzem a pressão na entrada e provocam cavitação." },
      { peca: "voluta", titulo: "Erosão na voluta", explicacao: "As bolhas que colapsam também erodem a voluta, perto da entrada do rotor." },
    ],
    vazamento: [
      { peca: "selo_mecanico", titulo: "Faces do selo gastas ou danificadas", explicacao: "Faces trincadas ou gastas deixam o fluido passar. Gaxeta mal ajustada também vaza." },
      { peca: "eixo", titulo: "Eixo riscado na região do selo", explicacao: "Luva ou eixo riscado impede o selo de assentar e faz vazar." },
      { peca: "acoplamento", titulo: "Desalinhamento com o motor", explicacao: "Desalinhamento gera vibração que abre o selo." },
    ],
    aquecimento: [
      { peca: "recalque", titulo: "Válvula de descarga fechada ou quase fechada", explicacao: "Com a descarga fechada, a bomba gira sem vazão e o líquido aquece no interior." },
      { peca: "rolamentos", titulo: "Rolamento sem lubrificação", explicacao: "Falta ou excesso de lubrificante aumenta o atrito no mancal e o calor." },
      { peca: "acoplamento", titulo: "Desalinhamento com o motor", explicacao: "O acoplamento desalinhado sobrecarrega o mancal e aquece." },
    ],
  },
  cilindro_pneumatico: {
    lento: [
      { peca: "conexoes", titulo: "Regulador de vazão fechado demais", explicacao: "O estrangulamento na entrada ou na saída limita a vazão de ar e o cilindro anda devagar." },
      { peca: "vedacao_embolo", titulo: "Vazamento interno pelo vedador do êmbolo", explicacao: "O ar que passa de uma câmara para a outra reduz a força e a velocidade." },
      { peca: "amortecimento", titulo: "Amortecimento ajustado de forma restritiva", explicacao: "Parafuso de amortecimento fechado demais freia o êmbolo no fim do curso." },
      { peca: "camisa", titulo: "Lubrificação insuficiente", explicacao: "Sem película de óleo, o atrito aumenta e o êmbolo anda mais devagar." },
    ],
    sem_forca: [
      { peca: "vedacao_embolo", titulo: "Vedação do êmbolo gasta", explicacao: "A passagem de ar entre as câmaras reduz a pressão útil e a força." },
      { peca: "camisa", titulo: "Diâmetro pequeno para a carga", explicacao: "A força é a pressão vezes a área do êmbolo; com diâmetro pequeno, a carga não é vencida." },
      { peca: "conexoes", titulo: "Pressão de alimentação baixa", explicacao: "Pressão menor na entrada reduz a força na mesma proporção." },
    ],
    vazamento: [
      { peca: "vedacao_haste", titulo: "Vedação da haste gasta", explicacao: "O anel de vedação da haste perde contato e deixa o ar sair pela haste." },
      { peca: "haste", titulo: "Haste riscada ou com corrosão", explicacao: "Riscos e corrosão na haste danificam a vedação a cada curso." },
      { peca: "haste", titulo: "Sujeira na haste", explicacao: "Partículas na haste são arrastadas para dentro e danificam a vedação." },
    ],
    curso_incompleto: [
      { peca: "camisa", titulo: "Sensor ou fim de curso mal posicionado", explicacao: "Sensor ou fim de curso no lugar errado desliga o movimento antes do fim do curso." },
      { peca: "haste", titulo: "Carga desalinhada forçando a haste", explicacao: "A força lateral emperra o êmbolo e a haste, e o curso para antes do previsto." },
      { peca: "embolo", titulo: "Pressão insuficiente para vencer a carga", explicacao: "Se a força do êmbolo é menor que a carga, o cilindro para no meio do curso." },
    ],
  },
  valvula_solenoide: {
    nao_comuta: [
      { peca: "bobina", titulo: "Bobina sem tensão ou queimada", explicacao: "Sem corrente, a bobina não gera campo e o carretel não se move." },
      { peca: "carretel", titulo: "Carretel travado por sujeira ou verniz", explicacao: "Resíduos de óleo oxidado (verniz) prendem o carretel na posição." },
      { peca: "molas", titulo: "Mola quebrada ou fraca", explicacao: "A mola de retorno não recoloca o carretel na posição de repouso." },
      { peca: "acionamento_manual", titulo: "Acionamento manual travado", explicacao: "O botão de acionamento manual deixado travado impede a comutação elétrica." },
    ],
    bobina_aquecida: [
      { peca: "bobina", titulo: "Tensão acima da nominal", explicacao: "Tensão acima da placa aumenta a corrente e o calor na bobina." },
      { peca: "bobina", titulo: "Curto entre espiras", explicacao: "Espiras em curto concentram corrente e a bobina queima." },
      { peca: "bobina", titulo: "Comando contínuo em válvula de pulso", explicacao: "Válvula feita para pulso, mantida energizada, esquenta sem parar." },
      { peca: "carretel", titulo: "Carretel travado em bobina CA", explicacao: "Com o carretel travado, a bobina CA mantém corrente de partida alta e fica energizada; sem mover, aquece até queimar." },
    ],
    vazamento: [
      { peca: "vedacoes", titulo: "Vedação interna gasta", explicacao: "Com a válvula desligada, a vedação não fecha e o ar passa entre as vias." },
      { peca: "corpo", titulo: "Juntas do corpo soltas", explicacao: "Parafusos e juntas soltos deixam o ar escapar pela face de montagem." },
      { peca: "escapes", titulo: "Escape com vazamento ou obstruído", explicacao: "Escape que não fecha deixa o ar sair continuamente; obstruído, faz a válvula reagir devagar." },
    ],
  },
  esteira_transportador: {
    desalinhada: [
      { peca: "roletes", titulo: "Roletes fora de esquadro", explicacao: "Roletes desalinhados empurram a correia para um dos lados." },
      { peca: "tambor_acionamento", titulo: "Tambor com abaulamento gasto ou material aderido", explicacao: "Abaulamento gasto ou material aderido ao tambor faz a correia correr para o lado de maior diâmetro." },
      { peca: "esticador", titulo: "Tensão desigual nos lados", explicacao: "Esticador ajustado diferente em cada lado tira a correia do centro." },
      { peca: "raspador", titulo: "Acúmulo de material em um lado", explicacao: "Material acumulado em um lado muda o atrito e desloca a correia." },
    ],
    ruido: [
      { peca: "roletes", titulo: "Rolete com rolamento defeituoso", explicacao: "Rolamento gasto do rolete gera ruído de rugido ou batida a cada volta." },
      { peca: "correia", titulo: "Emenda da correia com defeito", explicacao: "Emenda mal feita bate nos roletes a cada passagem." },
      { peca: "mancais", titulo: "Mancal sem lubrificação", explicacao: "Mancal dos tambores seco ou com folga faz ruído metálico." },
      { peca: "raspador", titulo: "Material preso entre a correia e a estrutura", explicacao: "Pedra ou peça presa entre a correia e o raspador gera batida." },
    ],
    travada: [
      { peca: "tambor_acionamento", titulo: "Tambor de acionamento travado", explicacao: "Tambor sem girar faz a correia deslizar ou o motor forçar." },
      { peca: "roletes", titulo: "Rolete emperrado", explicacao: "Rolete que não gira cria atrito e para a correia." },
      { peca: "correia", titulo: "Corpo estranho preso na correia", explicacao: "Peça presa entre a correia e a estrutura bloqueia o movimento." },
      { peca: "tambor_retorno", titulo: "Tambor de retorno sem girar", explicacao: "Tambor de retorno travado aumenta o esforço de tração do motor." },
    ],
    desgaste: [
      { peca: "correia", titulo: "Desgaste por material abrasivo", explicacao: "Material abrasivo entre a correia e os roletes desgasta a cobertura." },
      { peca: "mancais", titulo: "Mancais sem lubrificação", explicacao: "Falta de graxa acelera o desgaste dos mancais." },
      { peca: "esticador", titulo: "Tensão excessiva", explicacao: "Tensão acima do recomendado sobrecarrega mancais e tambores e acelera o desgaste." },
      { peca: "tambor_acionamento", titulo: "Revestimento do tambor gasto", explicacao: "Revestimento desgastado do tambor de acionamento perde atrito e a correia desliza." },
    ],
  },
};

/** Marcadores do tipo e sintoma; lista vazia quando não há modelo ou marcador para a combinação. */
export function marcadoresDe(tipo: string, sintoma: string): Marcador[] {
  return MARCADORES[tipo]?.[sintoma] ?? [];
}
