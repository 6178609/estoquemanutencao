# Aba Machine Ledger (design)

Pedido do usuário (23/11/2026): "absorver as informações dos Machine Ledgers para os nossos ativos", "avaliar se está correta a
disposição de MRO (componentes cadastrados nos ativos) — pente fino nos erros de material por ativo" e "criar uma aba de
gerenciamento de Machine Ledger com todas as informações cruzadas".

## Fonte
Machine Ledger = planilha corporativa WCM (RCM) por máquina, com as abas: CAPA (equipamento, fabricante, modelo, área, função,
revisão), Diagrama de blocos (conjuntos e funções), MACHINE LEDGER - RCM (equipamento › conjunto › subconjunto › componente,
COD SAP, quantidade instalada, função, falha funcional, tipo de deterioração, modo de falha, efeito, evidente/oculta, impacto em
segurança/qualidade/parada, G, P, T, V, índice H = P×G×T, classe, tipo de manutenção, calendário), PLANO MESTRE MP (atividade,
plano CIL-R/OA, tipo PM, tempo, periodicidade, mecânicos/eletricistas, procedimento, código do plano), GT_SPARE_PARTS (conjunto,
código Sysmat/SAP, descrição, consumível/reparável, mecânico/elétrico/fluido, estratégico/comum, deve ter reserva, estoque de
segurança Almox, valor, área/posição de estocagem, estoque de segurança UBM). Alguns ledgers não trazem COD SAP (só a descrição):
o código é procurado pela descrição curta exata no catálogo do Sysmat.

## Dados (repositório privado de dados; nada da empresa no repositório público)
- Índice leve `machine_ledger.json`: { <id>: { arquivo, nome, tipo (maquina|modelo), revisao, capa{maquina, fabricante, modelo,
  area, funcao}, equipamentos: [nº SAP], origem (automatica|confirmada), sugestoes, contagens, enviadoEm/Por, confirmadoEm/Por } }.
- Um cadastro por ledger `machine_ledger/<id>.json`: { ledger: { componentes: [...RCM], plano: [...MP], pecas: [...spare] } },
  lido só ao abrir a máquina ou no pente fino/cruzamentos. Conferidos em `machine_ledger_conferidos.json` (chave do achado).
- Leitura da planilha pelos CABEÇALHOS (alguns ledgers têm uma coluna a mais no RCM); células mescladas de equipamento/conjunto/
  subconjunto repetem o valor de cima. G (grau de impacto) vem como S/N (para a máquina). Índice H: o valor da planilha; vazio, o
  calculado pela fórmula que as planilhas usam de fato — P + T + V + 6 (impacta segurança) + 4 (impacta qualidade): o título diz
  "P x G x T", mas ~97% das 8,2 mil linhas conferidas seguem essa soma. Classe: a da planilha (sem ela, C ≤ 5 ou não para; B 6–8; A ≥ 9).
- Código: resolvido na leitura (nunca gravado): 5–7 dígitos = código SAP; "SysMat-…"/8 dígitos = código Sysmat (convertido pelo
  catálogo); outros (código do fabricante, nº do item) ou vazio = procura a descrição curta exata (única) no catálogo.
- A correspondência ledger ↔ equipamento SAP (IH08) é editável na aba (editores), com a origem (automática/confirmada).
- Atualização: enviar o .xlsx do Machine Ledger na aba (leitura no navegador, como as outras bases), que substitui o ledger.

## Aba `machine_ledger` (grupo Confiabilidade)
1. Visão geral: KPIs (máquinas com ledger, equipamentos SAP cobertos, componentes, peças, % peças do ledger vinculadas aos ativos,
   achados do pente fino por tipo) e lista dos ledgers (cobertura, revisão, achados).
2. Por máquina: capa + equipamentos; árvore conjunto › subconjunto › componente; RCM ordenado pelo índice H (filtro por classe,
   tipo de manutenção, impacto segurança/qualidade/parada); Plano Mestre MP; peças com saldo MB52, estratégico/reserva, estoque de
   segurança Almox/UBM.
3. Pente fino do MRO (por ativo; ativo = equipamento SAP ligado ao ledger; materiais do ativo = `materiais` em
   cadastro_equipamentos.json, os mesmos da Gestão de MRO):
   - faltando no ativo: peça do ledger (código válido) não vinculada;
   - vinculada sem respaldo: material vinculado que não está no ledger da máquina (sinal mais forte quando a descrição traz
     fabricante/modelo de outra máquina ou é de outra família);
   - código inválido: código do ledger inexistente no Sysmat, CANCELADO ou DUPLICADO (indicar o "Para", se houver);
   - descrição divergente: descrição do ledger × descrição curta do Sysmat sem semelhança (provável código trocado);
   - estratégico/deve ter reserva sem saldo na MB52 (e estoque de segurança Almox acima do saldo);
   - ledger copiado: a coluna Equipamento do RCM aponta outra máquina (ex.: "MOINHO SF 02" dentro do ledger do SF 05).
   Ações (mesmas permissões da Gestão de MRO, auditoria): vincular a peça ao ativo; desvincular; marcar "conferido, está certo"
   (some do pente fino). Excel dos achados.
4. Cruzamentos: IW13 (consumo real por equipamento) × ledger — consumidas e não previstas (candidatas); IP19 × Plano Mestre —
   atividades do ledger sem plano no SAP e vice-versa (por código de plano quando houver); quebras (IW28/AF) do ativo × componentes
   de maior índice H.
   Calendário de quebras (detalhe da máquina): as AFs da aba Planos de AF (Gerenciador de AF; `Cód. SAP` = equipamento ligado ao
   ledger) por mês e semana do mês (S1 = dias 1–7 … S5 = 29–31) do ano escolhido (padrão: atual). Associação AF → RCM pelo texto
   (componente, subconjunto, conjunto e resumo da falha; sem acento, plural reduzido), do mais específico ao mais geral:
   (1) componente — o nome da AF bate com o do componente ou as 2 primeiras palavras significativas do nome do componente aparecem
   no texto (vale mais), ou só a 1ª palavra com 5+ letras (vale menos); empate: o que também tem o subconjunto/conjunto no texto,
   depois o primeiro do RCM; (2) subconjunto citado; (3) conjunto citado; senão a linha "Não associada ao componente" (no fim).
   Cruzamento quebras × H usa as mesmas AFs + as notas de quebra da IW28 (regra do site; na regra "ym11", as ordens YM11 da IW38):
   2+ quebras e H ≤ 5/classe C = "RCM subestimado"; H ≥ 9/classe A sem atividade no Plano Mestre (pelo nome) = "H alto sem plano".
5. Itens com "estoque de segurança UBM" > 0 aparecem como sugestão para o kit da UBM (link para a aba UBM).

## Restrições
- Acesso pela lista de abas (Líder/Analista veem por padrão); gravar (correspondência, vínculos, conferido, envio de ledger):
  `podeEditar` e fora de Terceiro/Manutentor, como a Gestão de MRO.
- Bases grandes via `lerBase` com cache (sem montar `bases()` inteiro quando não precisa).
- Demonstração com ledgers fictícios; testes só com dados fictícios.

## Implementação (23/11/2026)
- Regras puras em `web/lib/machineLedger/regras.ts`, leitura/gravação em `lib/machineLedger/dados.ts`, rota `app/api/machine_ledger`
  (POST JSON: vinculo, conferido, correspondencia, envio; GET planilhas achados/pecas), tela `app/(app)/machine_ledger/`.
  Vincular/desvincular usa `aplicarPecas` da Gestão de MRO sobre `cadastro_equipamentos.json` (auditoria `machine_ledger_*`).
- Achados de vínculo (faltando, sem respaldo) são por ativo; os do próprio ledger (código inválido, descrição divergente, sem
  saldo, ledger copiado) valem para cada equipamento ligado ao ledger. "Sinal forte" no sem respaldo: a descrição no Sysmat cita o
  fabricante de outro ledger e não o do próprio. Ledger copiado: números do Equipamento do RCM ≠ do nome (faixa "15 a 19" vale).
- Plano Mestre: os ledgers atuais não trazem o código do plano SAP; o cruzamento com a IP19 fica pela contagem até ser preenchido.
- Demonstração: 4 ledgers fictícios (`lib/machineLedger/demo.ts`) com achados de todos os tipos. Testes em
  `testes/machineLedger.test.ts` e `e2e/machine_ledger.spec.ts`.

## Revisão (23/11/2026, parecer do Opus)
- Código SAP = só dígitos, 5 a 7 (".0" do Excel removido na leitura e na carga); "SysMat-<nº>" ou 8 dígitos 2006… = Sysmat
  (convertido pelo catálogo); texto com letras/pontuação (fabricante, desenho) = sem código → descrição curta exata.
- BLOQUEADO não é inválido: tipo próprio "Bloqueado para compra". Inválido = inexistente, CANCELADO ou DUPLICADO (com o "Para").
- Estoque: "Estratégico sem saldo" (principal, com "nunca na MB52" quando fora do export atual) separado de "Estocagem
  recomendada sem saldo" (secundário, recolhido).
- "Vinculada sem respaldo": por padrão só o sinal forte; código vinculado em ≥ 3 ativos com ledger (ou ≥ 20% deles) é "uso geral".
  Os secundários aparecem com "Mostrar avisos secundários".
- Resumo por códigos únicos e "em N ledgers"; achados do próprio ledger contam uma vez por ledger (com a abrangência em
  equipamentos); o ranking por ativo só usa os de vínculo. Lista paginada (200 por página); resultado guardado pela assinatura
  das versões (índice, ledgers, conferidos, vínculos) e das bases do catálogo/MB52.
- Envio: conteúdo sanitizado no servidor campo a campo (`sanitizarConteudo`), abas exigidas conferidas, e o ledger do mesmo
  arquivo/nome é reaproveitado (reenviar não duplica). Classe e tipo de manutenção do RCM pelos cabeçalhos "Classificação" e
  "MANUTENÇÃO PM" (CBM/TBM/BM).

## Operações das listas de tarefas e IA06 (pedido do usuário, 23/11/2026)
- Fonte: export em texto das listas de tarefas gerais do SAP ("LTa <grupo> <numerador> <descrição>", Estratégia, Centro;
  "Operação <nº> <texto breve>" + texto longo + Cen.trabalho, Chave de controle, Núm.de pessoas, Trabalho (min), Pac.manuten;
  "Comp.mat. <material> <descrição>" + Quantidade/UM; "Suboperaç." entra no texto longo da operação). Parser puro em
  `web/lib/machineLedger/listasTarefas.ts`; cadastro `listas_tarefas.json` { "<grupo>|<numerador>": { descricao, estrategia,
  centro, operacoes } }; reenvio pela sub-aba "Enviar ledger" (lido no navegador, validado no servidor, substitui tudo).
- Listas da máquina: pelos equipamentos SAP do ledger, o mesmo caminho da Gestão de MRO (planos das ordens da IW38 × IP19, listas
  diretas da IP19 e as dos subconjuntos do IH08); lista da IP19 sem numerador = todas as listas do grupo. Sem equipamento ligado
  ou sem o export das listas, a página não lê IW38/IP19/IH08; as listas validadas ficam guardadas por versão do cadastro.
- Sugestão por componente do RCM (texto breve + longo da operação, sem acento, plural reduzido): nome inteiro 100; 2 primeiras
  palavras significativas 70 (+10 com subconjunto/conjunto); palavra única do nome (5+ letras) 55 sozinha (média) e 70 com
  subconjunto/conjunto (alta); só a 1ª palavra 40 (+10); só o subconjunto 50; só o conjunto 30. Confiança alta ≥ 70, média ≥ 45, baixa abaixo. Confirmação do PCM em
  `machine_ledger_operacoes.json` ("<ledger>|<hash do conjunto/subconjunto/componente>" → grupo, numerador, operação, quantidade).
- IA06: componentes com código SAP válido (regra do pente fino), operação confirmada que ainda existe nas
  listas (confirmada órfã fica fora, com aviso) ou sugestão alta, se marcado, e material que ainda não é Comp.mat. em NENHUMA
  operação da lista ("já na lista (op X)": o SAP aceita o material uma vez por lista); quantidade = quantidade instalada do RCM
  ("1.0"/"2.5" do Excel = ponto decimal; com vírgula, formato brasileiro), editável; UM do catálogo. Mesmo material em dois
  componentes da mesma lista = uma linha só, quantidades somadas (o contador da tela = linhas do CSV, com aviso dos juntados).
  CSV e script VBS iguais aos da Gestão de MRO, com o número da operação; coluna ATIVOS com um ativo por equipamento do ledger
  (`identificarAtivo`: campo de ordenação, código e nome, como na MRO). Componente repetido no RCM (mesmo hash de
  conjunto/subconjunto/componente; o equip não entra no hash) = uma linha, com a melhor resolução de código entre as repetidas.
  Excel da associação por máquina.
- Código "Sysmat pela referência" (componente sem código válido, sem peça de reposição nem descrição exata): tokens de
  referência do nome (dígito + letra, ou com hífen/ponto/barra, 5+ caracteres; fora medidas, rosca métrica `M8X1.25`, dimensões
  `10X20MM` e polegadas `3/8X1/2"`) contra um índice só da Descr Curta, dos trechos `REF:`/`REFERENCIA:`/`DES:` da Descr Completa
  e do "FAB REF" do catálogo (MODELO, APLICACAO e REQUISITOS não entram: casavam material errado). Material BLOQUEADO com "Para"
  ativo vira o "Para". Um material = sugestão; vários = ambíguo, sem código (o inválido do RCM fica à parte, `codigoRcm`). Só vai
  para a IA06 depois de o PCM confirmar; a confirmação vale enquanto o código é a sugestão ou um candidato — senão é
  "confirmação antiga", ignorada e sinalizada.
