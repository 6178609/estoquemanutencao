# Aba UBM — Unidade Básica de Manutenção (design)

Pedido do usuário (22/11/2026). Infográfico da proposta: `docs/propostas/UBM_infografico.png`.

## Intenção
A UBM é um armário industrial em campo com itens estratégicos do Almox, para o manutentor não perder tempo indo ao
almoxarifado (reduzir o MTTR). A aba registra cada retirada (por QR code colado no armário) e mostra ao planejamento o que
repor, além de analisar as saídas.

> **Mudança (22/11/2026, pedido do usuário):** o QR de RETIRADA (formulário com foto e "Já lançado na ordem pelo SAP
> Mobile?") foi substituído pela **Validação do líder** (seção abaixo). Os itens desta spec sobre a retirada pelo QR valem
> só como histórico: as retiradas antigas continuam lidas no saldo e no histórico.

## Objetivos
- QR de **retirada** por armário → formulário no celular: **Ordem, Turno, Código do material, Quantidade (padrão 1),
  Descrição do uso, Foto do material** (foto obrigatória, câmera do celular). Quem retirou = usuário logado.
- QR de **solicitação** por armário → formulário: tipo (`acabou` = item acabou ou está no fim; `faltando` = item que
  deveria estar no armário; `reposicao` = pedido de reposição ao Almox), código (opcional para `faltando` quando não
  souber), quantidade, observação, foto opcional.
- **Ordem e código nunca travam** (pedido do usuário): ordem procurada na IW38 e código no catálogo do Sysmat só para
  mostrar a descrição/equipamento; se não achar, grava assim mesmo com a marca "não encontrada na base" e a análise associa
  quando a base atualizar (a associação é feita na leitura, não gravada).
- Cadastro de armários (editores): id (UBM-01…), nome, local/linha, itens do kit (código, mínimo, máximo).
- **Saldo** por armário e item: saldo = abastecido (registros de reposição) − retirado. Abaixo do mínimo → lista de
  reposição com a quantidade a separar (máximo − saldo). Planejamento registra a reposição (quantidade por item) → saldo volta.
  Também registra uma contagem (inventário) que fixa o saldo do item naquele momento.
- **Análise**: saídas por material (ranking, quantidade), por turno, por equipamento/ordem, por armário, por semana;
  itens do kit parados (sem saída em 90 dias); itens retirados que não estão no kit (candidatos a entrar);
  solicitações abertas; retiradas sem ordem na IW38. Filtros: armário, período.
- Lista de retiradas com foto (miniatura), Excel (exportar retiradas e lista de reposição), página de impressão dos QR
  (etiqueta por armário, A4).

## Não-objetivos
- Não baixa estoque no SAP nem gera reserva automática (só a lista para o planejamento).
- Sem acesso sem login: o QR abre o site; quem não está logado entra e volta ao formulário.

## Restrições (CLAUDE.md)
- Acesso só pela lista de abas (nova aba `ubm`, grupo "Custos e suprimentos"); Líder/Analista veem por padrão; gravar
  retirada/solicitação: quem vê a aba (inclusive Manutentor/Terceiro se o administrador liberar a aba); cadastro de
  armários, reposição e contagem: `podeEditar` e fora de Terceiro/Manutentor.
- Dados no repositório de dados: cadastros `ubm_armarios.json` e `ubm_movimentos_<AAAA-MM>.json` (um por mês de Brasília; a leitura junta todos) (gravação por gravarCadastroLote),
  fotos em `app/documentos/ubm/<movimento>/<arquivo>` (mesmo padrão do Cadastro de material). Demonstração com dados
  fictícios na memória. Nada de dados da empresa no repositório público.
- Auditoria: `ubm_retirada`, `ubm_solicitacao`, `ubm_reposicao`, `ubm_armario`.
- Verificação: tsc, vitest, eslint, build, playwright; revisão do Opus antes de publicar.

## Abordagens consideradas
1. **Aba no site com rotas de formulário próprias (escolhida)** — mesmo login, mesmas bases (IW38, Sysmat), mesma
   auditoria; o QR aponta para `/ubm/retirada?u=<id>`.
2. Formulário externo (Google/Microsoft Forms) — sem login nem conferência com as bases; dados fora do site. Descartada.
3. Página pública sem login com token no QR — mais rápida no campo, mas qualquer um com a foto do QR grava; o líder já tem
   usuário. Descartada.

## Decisões do construtor (Claude)
- QR gerado no servidor como SVG (pacote `qrcode`, MIT), apontando para o endereço do site (`URL_SITE`/`URL_SITE_ATUAL`
  ou a origem da requisição).
- Turnos: 1º, Administrativo, 2º (como o Controle de HH), mais "3º" se aparecer.
- Celular primeiro: o formulário de retirada cabe numa tela de 390 px, campos grandes, câmera via `capture="environment"`.

## Validação do líder (22/11/2026) — substitui o QR de retirada
Problema: o material do armário também é lançado na ordem pelo SAP Mobile; a IW13 (consumo por ordem) mostra o consumo mas
não a origem (UBM ou Almox). O líder confirma.
- **Pendência** (`lib/ubm/validacao.ts`, `pendencias`): (ordem, material) da IW13 com Tomados > 0 (linhas repetidas somadas;
  data = lançamento mais recente), material no kit de algum armário ativo (código sem zeros à esquerda), ordem de **quebra**
  e data no período (padrão 30 dias, dia de Brasília). Fica de fora ordem + código com retirada registrada (QR antigo ou
  validação) ou já validado (inclusive "Almox").
- **Quebra** (mesma definição do site, `lib/wcm/preparo.ts`): tipo YM11 na IW38/IW38OP/IW47 **ou** nota da IW28 marcada como
  quebra por `marcarQuebras` (regra "y1": Y1 → YM11; regra "ym11") apontando para a ordem, mais `quebrasOrdem`.
- **Ações** (POST `/api/ubm`, `acao=validar`): "Veio do Almox" grava só a decisão; "Veio da UBM" pede o armário (quando o item
  está em mais de um) e a quantidade (padrão = tomada, formato da UM do kit) e cria a retirada `origem: "validacao"`, uso
  "Confirmado pelo líder pela IW13 (ordem de quebra)", sem turno nem foto, que baixa o saldo. A pendência é recalculada no
  servidor (o formulário só manda a chave). Quem pode: quem vê a aba; limite de 120 gravações/10 min por pessoa.
- **Dados**: `ubm_validacoes.json`, um cadastro só com a chave `<ordem sem zeros>|<código>`: a gravação (gravarCadastroLote)
  relê e recusa a segunda ("Já validado por X"). Escolhido em vez de mensal porque a chave única evita a duplicata entre meses.
- **Desfazer** (`acao=desfazer`): só `podeGerir`; apaga a decisão e, se foi UBM, a retirada criada por ela.
- **Tela**: lista agrupada por ordem (texto, equipamento, data, nota), cada material com tomada/UM/descrição/saldo e os botões
  grandes (390 px sem rolagem lateral); aviso sem IW13 ("Envie a IW13 em Fontes de dados") ou com IW13 de mais de 7 dias;
  histórico com filtro de decisão e "Desfazer"; Excel (`?planilha=validacao`, abas Pendências e Validações). KPI "A validar"
  na Visão geral.
- **Análise**: retiradas por líder (quem confirmou), % "veio da UBM", tempo até a validação (média, mediana, maior) e "itens do
  kit em ordens de quebra que vieram do Almox" com o saldo da UBM no dia do lançamento (sem saldo, saldo insuficiente ou UBM
  não usada). Turno e "% lançadas" saíram (não há mais QR).
- **Removido**: formulário/QR/etiqueta de RETIRADA (porta do armário e etiquetas só com SOLICITAÇÃO), "Já lançado na ordem",
  "Retiradas não lançadas" e "Marcar como lançada". `/ubm/retirada` redireciona para a validação; POST de retirada → 410.
- **Demonstração**: IW13 fictícia sobre as 4 ordens YM11 mais recentes das bases fictícias (UBM-01), mais uma ordem YM13 e um
  item fora do kit (excluídos) e duas validações fictícias. Testes: `testes/ubmValidacao.test.ts` e o e2e da UBM.

### Ajustes da revisão (22/11/2026)
- **Quebra** pela regra em vigor (`regraQuebra`): "y1" (padrão da planta) só a ordem com nota de quebra (`marcarQuebras`, tipo
  da ordem pela IW38); "ym11" o tipo YM11 na IW38 ou nota marcada. IW38, IW28 e IH08 lidas pelo `lerBase` com o mesmo preparo
  e cache de lib/wcm/dados.ts, sem montar `bases()` (só na demonstração).
- **Lotes**: chave `ordem|código#n`; pendente = tomada na IW13 − o que as validações cobriram − retiradas antigas do QR. IW13
  atualizada com mais consumo na mesma ordem volta como pendência só da diferença; o histórico guarda cada lote.
- **Data da retirada da validação** = dia do lançamento na IW13 ao meio-dia de Brasília: uma contagem feita entre o consumo e a
  validação já o inclui (o saldo não baixa duas vezes).
- **Quem valida**: quem vê a aba e não é Terceiro/Manutentor; os outros veem a lista sem botões ("a validação é do líder").
- **Corrida**: depois de gravar a retirada, a decisão é relida; se foi desfeita no meio, a retirada sai.
- **UM diferente** (IW13 × kit): sem quantidade padrão, aviso para digitar na UM do kit; a análise não compara quantidades.
- **Custo**: a Análise lê só as decisões; a Visão geral mostra o total guardado da última abertura da validação (15 min) ou
  só o link. `/ubm/retirada?u=` repassa o armário válido.
