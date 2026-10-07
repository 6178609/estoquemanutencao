# Central de Manutenção · PCM F26

App web de nível WCM (pilar **Manutenção Profissional**) da SIM Manutenção Profissional · Alpargatas F26. Junta
**ordens do IW38** (com as operações do IW38OP), **apontamentos de horas da IW47**, **equipe da planilha de Gestão de
HH**, **planos da IP19**, **notas da IW28**, **equipamentos da IH08**, **estoque do MB52**, **requisições de compra** e o
**Gerenciador de AF** (análises de falha e plano de ação) numa tela só, com indicadores, metas, farol e tendência, e **se atualiza sozinho**: ninguém precisa importar planilha.
Funciona no computador e no celular, com login e perfis de acesso.

Substitui o antigo `ESTOQUE MANUTENÇÃO.html` (um HTML de 3 MB com a base embutida e dados salvos só no navegador).

## Indicadores WCM

Cada indicador tem fórmula (passe o mouse no título), meta editável, farol (verde = na meta, amarelo = até 10% pior,
vermelho = fora), variação contra o período anterior de mesma duração e tendência dos últimos 12 meses. O cálculo está
em `central/indicadores.py` (pandas puro, com testes).

| Grupo | Indicadores |
|---|---|
| Confiabilidade | Quebras (nota Y1 convertida em ordem YM11 — regra da planta), MTBF, MTTR, reincidência (≤ 30 dias), quebras em classe A |
| Preditiva (SEMEQ) | Anomalias detectadas, % com ordem, % tratadas, dias para tratar, anomalias atrasadas (hoje) |
| Planejamento e controle | Manutenção planejada (% com plano), corretiva emergencial, aderência ao plano (IP19), ordens concluídas no prazo, backlog em semanas, idade do backlog, notas sem ordem > 7 dias |
| Análise de falhas (AF) | Taxa de análise de quebra crítica (A), execução de AFs, AFs analisadas no prazo, AFs atrasadas, ações de AFs (execução), ações no prazo, ações atrasadas — do Gerenciador de AF; só o período vale (as áreas do gerenciador são outras) |
| Mão de obra | HH apontadas (IW47), utilização da equipe, % HH em plano, % HH em corretiva emergencial |
| Custos | Custo médio mensal (meta = orçamento), % custo do backlog, custo médio por ordem |
| Suprimentos | Itens zerados, peças críticas em falta, dias aguardando aprovação |

**Quebra** = nota **Y1** da IW28 convertida em ordem **YM11**. O tipo da ordem vem do IW38/IW38OP/IW47; enquanto o
IW38 exportado não trouxer a YM11, a nota Y1 com ordem conta como quebra (ordem de outro tipo não conta).

**Fora do site:** Fábrica Piloto (centro FABPILOT, local de instalação ou objeto da Fábrica Piloto), Desenho
(localização DESEN) e OPER_MATRIZ (centro OPER_MTZ) saem de todas as bases (ordens, operações, notas,
apontamentos, planos, equipamentos e equipe). Regra em `central/util.py` (`fora_da_visao`); desliga com
`excluir_piloto_matriz = "não"`.

**Filtros globais** (barra lateral): período (de/até), área (localização), centro de trabalho e tipo de ordem — valem
para todas as abas, e cada cartão do Painel leva à aba onde o indicador é detalhado.

> O IW38 exportado hoje não traz os tipos YM11/YM12 (corretivas). As horas da IW47 dessas ordens aparecem como
> "Ordem fora do IW38" e ficam fora dos % de plano e de emergencial. Exportando o IW38 com todos os tipos, o site
> passa a usá-los sozinho.

## Como os dados se atualizam sozinhos

```
SAP (IW38 / MB52 / requisições)
   │  export manual ou pelo robô do SAP (automacao/robo_sap.py: agendado ou pelo botão do site)
   ▼
Pastas do SharePoint sincronizadas pelo OneDrive
   ~\OneDrive - Alpargatas S.A\PCM F26 - Documentos\1.3 - Controle de Estoque
   ~\OneDrive - Alpargatas S.A\PCM F26 - Documentos\0.1 - Indicadores
   ~\Downloads\SITE  (pasta base do site, com subpastas)
   ~\Downloads\1.3 - Controle de Estoque  e  ~\Downloads\0.1 - Indicadores  (cópias, com subpastas)
   ~\Downloads  (só a própria pasta)
   │  o app varre as pastas a cada 60 s
   ▼
Central de Manutenção  →  todas as telas abertas recarregam quando chega arquivo novo
```

- O app **reconhece cada arquivo pelo conteúdo** (cabeçalhos), não pelo nome: pode ser `.xlsx`, `.xls`,
  `.csv`, `.txt` (lista do SAP com `|`), `.htm` ("salvar como HTML" do SAP GUI) ou `.parquet`. Também acha
  a base dentro de uma aba qualquer de uma pasta de trabalho, mesmo com o cabeçalho fora da linha 1.
- A pasta **Downloads** também é olhada, porque é onde o navegador e o SAP costumam salvar. Planilhas
  baixadas do próprio site (botão "Baixar Excel") e arquivos com "filtrado" no nome são ignorados, para um
  recorte nunca substituir a base completa.
- Cada base é **um arquivo só**: vale o export mais recente. O IW38 traz tudo junto — **número na coluna "Plano de
  manutenção" = ordem de plano de manutenção; sem número = backlog** — e a IW28 também é um arquivo único.
- A criticidade dos equipamentos vem do **código ABC da IH08** (A = alta, B = média, C = baixa), a não ser que
  alguém cadastre outra no site. Se pegar a planilha errada, fixe o arquivo certo em
  **Configuração › Fontes de dados** (um arquivo fixado continua sendo relido quando é sobrescrito).
- Base mais velha que 2 dias aparece em laranja, com aviso, em todas as telas.
- Cadastros feitos no app (equipamentos e seus componentes, estoque mínimo, fotos dos materiais, usuários) ficam em
  arquivos `.json` na subpasta **`Central de Manutenção (app)`**, dentro da pasta sincronizada — então
  são compartilhados com toda a equipe. Antes da primeira gravação do dia, cada cadastro ganha uma cópia em
  `backup/<cadastro>-<data>.json`; se a leitura do cadastro falhar, nada é gravado (para nunca sobrescrever com vazio).

## Site online 24h (nuvem)

O app pode ficar publicado no **Streamlit Community Cloud**, com um endereço que abre de qualquer lugar.
Na nuvem ele não enxerga o OneDrive, então os dados chegam por um de dois caminhos:

- **Sincronizador no PC (sem TI):** `sincronizador/` roda em segundo plano no PC com as pastas do OneDrive.
  A cada 5 min envia o export mais novo de cada base para um repositório **privado** de dados no GitHub, de
  onde o site lê.
- **SharePoint direto:** o site lê as pastas pela API da Microsoft. Precisa de um aplicativo registrado pela
  TI (texto pronto em [`docs/PEDIDO_TI_SHAREPOINT.md`](docs/PEDIDO_TI_SHAREPOINT.md)).

Passo a passo dos dois: [`docs/PUBLICAR_NA_NUVEM.md`](docs/PUBLICAR_NA_NUVEM.md). O workflow
`.github/workflows/manter-app-acordado.yml` visita o app a cada 6 h para ele não entrar em modo de espera.

## Como usar no PC (Windows)

1. Baixe o projeto (botão **Code › Download ZIP** no GitHub) e descompacte, por exemplo em `C:\CentralManutencao`.
2. Dê **duplo clique em `iniciar.bat`**. Na primeira vez ele instala o Python/dependências (alguns minutos).
3. O navegador abre em `http://localhost:8501`. No **primeiro acesso** o app pede para criar o
   **administrador**; depois cadastre a equipe em **Configuração › Usuários**.
4. Outras pessoas da rede (inclusive pelo celular no Wi-Fi da fábrica) acessam por
   `http://NOME-DO-PC:8501` — o endereço aparece na janela do `iniciar.bat`. Pode ser preciso liberar a
   porta 8501 no firewall do Windows.

> O app roda no computador que tem as pastas sincronizadas. Para ficar sempre no ar, deixe-o num PC/servidor
> ligado (ou coloque o `iniciar.bat` na inicialização do Windows: `Win+R` → `shell:startup`).

## Login e perfis

| Perfil | Pode |
|---|---|
| Administrador | tudo, inclusive criar/editar/desativar usuários e redefinir senhas |
| Editor | editar cadastros (equipamentos, estoque mínimo), fixar arquivos e enviar exports |
| Leitor | só consultar |

- Senhas guardadas só como hash (PBKDF2-SHA256 com sal); troca obrigatória no primeiro acesso e após redefinição.
- 5 tentativas erradas bloqueiam o usuário por 5 minutos.
- "Manter conectado" vale por 30 dias por aparelho; em **Minha conta** dá para desconectar todos.
- Não há como apagar o último administrador nem tirar o próprio acesso.

## Telas

- **Painel WCM** — índice WCM do pilar, cartões por grupo, scorecard por área e por centro de trabalho (com farol),
  evolução mensal de cada indicador, pontos de atenção (fora da meta, bad actors, backlog mais antigo, peças críticas,
  compras paradas) e scorecard para baixar em Excel.
- **Quebras, MTBF e MTTR** — quebras e MTTR por mês, Pareto 80/20 (equipamento, local, centro, área, tipo de nota),
  confiabilidade por equipamento com link para a ficha, matriz criticidade × frequência, dia da semana e reincidências.
- **Preditiva (SEMEQ)** — anomalias da preditiva (notas IW28 e ordens IW38 com `SEMEQ-<técnica>-<nº>-<achado>` no
  texto): situação de cada uma (tratada, em tratativa, atrasada, sem ordem), fila das abertas, técnica (vibração,
  óleo, termografia), Pareto dos achados, equipamentos reincidentes, quem tratou (IW47) e custo. O Painel mostra o
  resumo logo no topo.
- **Equipamentos** — gerenciamento no formato da tela antiga (TAG, nome, categoria, criticidade, visão geral e
  componentes vinculados da base de material) e análise pelas ordens, com ficha (quebras, MTBF, MTTR, HH, histórico).
- **Notas** — notas da IW28: sem ordem e há quanto tempo, paradas de máquina, notas por semana e reincidência.
- **Ordens** — busca, filtros (situação, plano/backlog, classe WCM, status), fim real, lead time, prazo, HH apontadas,
  detalhe com operações, apontamentos da IW47 (com o nome da pessoa) e histórico do equipamento.
- **Calendário de ordens** — período "entre" (de/até, com atalhos de semana e mês) com as ordens do IW38 em cada dia da data-base de
  início, separadas por turno (turma de quem apontou na IW47), com equipamento, pessoas e duração planejada (IW38OP);
  filtros de localização (valores da coluna do IW38) e centro de trabalho; azul = plano de manutenção,
  amarelo = backlog, borda verde/vermelha = concluída/atrasada; ↻ = data alterada pelo robô (Programação do mês).
- **Programação do mês** — previsão manual das paradas por campo de ordenação e mudança de datas no SAP (abaixo).
- **Planos** — calendário semanal de cada plano a partir da **IP19**, aderência e carga semanal.
- **Mão de obra e backlog** — equipe (especialidade, área, turma), horas por pessoa com utilização, % plano e
  emergencial, HH por semana/centro/classe/atividade, semanas de backlog por centro, idade do backlog e carga das
  próximas 12 semanas.
- **Custos** — custo por mês e classe (com orçamento), por tipo, área, centro de trabalho, Pareto por equipamento e
  ordens mais caras.
- **Estoque** — saldo do MB52, estoque mínimo editável, alerta de peças críticas e **foto de cada material**.
- **Requisições** — o que aguarda aprovação, com quem está parado e há quantos dias.
- **Planos de AF** e **Ações de AF** — gestão das análises de falha e do plano de ação (veja abaixo).
- **Metas e parâmetros** — meta de cada indicador, jornada semanal, capacidade por centro de trabalho e classe WCM de
  cada tipo de ordem (nomes padrão lidos da planilha de Gestão de HH).
- **Fontes de dados** — de onde vem cada base, data do arquivo, troca/fixação de arquivo e envio manual.

Por padrão o período é "últimos 12 meses" (até hoje); ordens com data-base futura entram em "Tudo" ou num
período personalizado.

### IW47 e Gestão de HH

- **IW47** é a base principal de horas: cada apontamento (nº pessoal, ordem, operação, trabalho real, centro de
  trabalho real, tipo de atividade, data de lançamento). Estornos (trabalho negativo) são somados e anulam o original.
- A planilha **Gestão de HH** serve só para os dados das pessoas (nº pessoal, nome, cargo, centro de trabalho, área,
  turma). As outras abas dela (cópias de IW47/IW38) são ignoradas; da aba de apoio vêm os nomes dos tipos de ordem.

## Análise de falhas (Gerenciador de AF)

O site lê o **Gerenciador de AF** (pasta de trabalho do PCM) como qualquer outra base: basta o arquivo estar numa das
pastas sincronizadas. A leitura e os indicadores estão em `central/af.py` (pandas puro, com testes em
`tests/test_af.py`).

- **Abas lidas:** **Análise de Falha** (uma linha por AF) e **Plano de ação AF** (uma linha por ação de cada AF).
  As abas ocultas (cópias de backup, listas de apoio) e a aba de e-mails são ignoradas.
- **Planos de AF** — situação de cada análise (prazo, atraso, risco), acompanhamento semanal e mensal no formato do
  resumo corporativo, Pareto de causa raiz, área, pilar, especialidade e turno, e a ficha de cada AF com as suas ações
  e o link para o equipamento.
- **Ações de AF** — execução e prazo das ações por data limite, fila de prioridade (atrasadas e que vencem em 7 dias),
  cumprimento por responsável e supervisor e tipos de ação WCM (causa raiz, TTR, padronização, expansão).

**Legenda de status** (a mesma do gerenciador):

| Código | Significado |
|---|---|
| AP | Analisada (ou ação concluída) no prazo |
| AFP | Analisada (ou ação concluída) fora do prazo |
| EA | Em andamento |
| R | Risco de atraso |
| NA | Não analisada |
| CANCELADA | Cancelada — não entra em nenhum indicador |

Sem código, a situação é deduzida das datas: com data da análise (ou realizada), compara com a data limite; sem ela e
com o prazo vencido, fica **atrasada**. Ação sem status e sem data realizada é **não iniciada**.

**Indicadores corporativos** (definições da aba RESUMO CORPORATIVO; canceladas nunca contam):

- **Taxa de análise de quebra crítica (A)** = AFs de criticidade A com data da falha no período já analisadas ÷ AFs
  de criticidade A com data da falha no período (meta 100%).
- **Execução de AFs** = AFs com data limite no período (até hoje) analisadas ÷ AFs com data limite no período
  (meta 100%); **AFs analisadas no prazo** conta só as analisadas até a data limite (meta 90%).
- **Ações de AFs** = ações com data limite no período (até hoje) realizadas ÷ ações com data limite no período
  (meta 90%); **ações no prazo** conta só as realizadas até a data limite (meta 90%).
- **AFs atrasadas** e **ações atrasadas** = retrato de hoje: em aberto com a data limite vencida (meta 0).

Esses indicadores aparecem no Painel WCM (grupo "Análise de falhas (AF)"), com meta editável em Metas e parâmetros.
Como as áreas do gerenciador não são as localizações do SAP, os filtros de área, centro e tipo não se aplicam a eles —
só o período.

## Robô do SAP (exportação automática)

`automacao/robo_sap.py` faz no SAP GUI o que uma pessoa faria: usa a sessão do SAP já aberta (ou abre o SAP Logon
e faz login no mandante 702), roda cada transação de `automacao/transacoes.toml` com os filtros definidos lá e grava
o resultado na pasta do site (`Downloads\SITE`), substituindo o arquivo anterior.

- **Hoje:** MB52 — centro A026, depósito I26, estoques de lotes, sem linhas zeradas, sem valores, representação
  hierárquica, variante de exibição `/JEFERSON`, gravada como HTML em `MB52.htm`.
- **Instalar (uma vez, no PC com SAP GUI):** `automacao\configurar_robo.bat`. Ele pede usuário, senha e o nome da
  conexão no SAP Logon, testa uma exportação e agenda o robô nos dias úteis (padrão 06:30 e 12:30).
- **Senha:** fica no Gerenciador de Credenciais do Windows, criptografada para o seu usuário. Nunca vai para
  arquivo do projeto nem para o GitHub. Trocou a senha do SAP? Rode o `configurar_robo.bat` de novo.
- **No site:** quem é editor ou administrador vê o botão **Buscar no SAP agora** (barra lateral e Fontes de
  dados) quando o site roda nesse mesmo PC. A página Fontes de dados mostra o resultado de cada transação e o
  registro do robô.
- **Pré-requisito:** SAP GUI Scripting habilitado (SAP GUI › Opções › Acessibilidade e scripting › Scripting).
- **Nova transação:** acrescente um bloco `[[transacao]]` em `transacoes.toml`. Se um campo tiver outro ID no seu
  SAP, o robô diz qual passo falhou; grave a transação uma vez em *Alt+F12 › Script Recording and Playback* e copie
  o ID.

### Programação do mês e mudança de datas no SAP

A aba **Programação do mês** (Planejamento) é um calendário à parte do Calendário de ordens (IW38), 100% manual,
para a previsão do mês: em cada dia digite os **campos de ordenação** das máquinas que vão parar (separados por
vírgula ou espaço) e tecle Enter — o nome do ativo aparece na hora (IH08; sem cadastro, o objeto técnico das
ordens do IW38) e a programação fica salva para todos.

- **Mudar as datas no SAP** (editor/administrador, com confirmação): para cada dia, o robô abre a **IW38**, usa a
  **seta à direita** (seleção múltipla) do *Campo de ordenação* com os campos do dia, filtra o período das ordens
  e executa. Em cada ordem da lista, **InícioBase e Fim-base recebem a data do dia**; o robô grava (tela de
  modificar ordem, a mesma que a IW38 abre) e reabre na IW33 para conferir.
- **Quais ordens:** as abertas/em processamento da máquina com data no mês até a parada; quando a máquina para mais
  de uma vez no mês, cada parada leva as ordens desde a anterior e a última leva até o fim do mês. Opcional: trazer
  também as atrasadas de meses anteriores. Antes de rodar, o site mostra a previsão pelo IW38 exportado.
- **Só simular:** o robô faz a IW38 e abre as ordens sem gravar — use na primeira vez. Limite de 300 ordens por lote.
- **Onde roda:** com o site no PC do SAP, o robô começa na hora; com o site na nuvem, o sincronizador desse PC
  (com o robô configurado) executa em até 1 minuto.
- **Calendário principal:** as datas gravadas pelo robô aparecem na hora no Calendário de ordens (marcadas com ↻)
  até o próximo export do IW38 trazê-las.
- **Histórico:** resultado de cada ordem (data antiga, nova e mensagem do SAP), download, **desfazer** e cancelar.
- IDs em `[mudanca_datas]` de `automacao/transacoes.toml`: o *Campo de ordenação* é achado pelo texto da tela e os
  campos de data pelo nome técnico (`CAUFVD-GSTRP`/`GLTRP`); se o seu SAP for diferente, grave no Script Recording
  e cole os IDs.

## Configuração

Tudo tem padrão; só crie `.streamlit/secrets.toml` (modelo em `.streamlit/secrets.toml.exemplo`) se precisar
mudar pastas, intervalo de verificação, desligar o login ou ligar o **modo SharePoint**. Esse modo lê
direto da biblioteca pelo Microsoft Graph e é o que o app usa na nuvem.

Visual: verde e grafite do logo SIM e cores do logo Alpargatas (`.streamlit/config.toml`), com tema claro e
escuro (menu ⋮ › Settings). Para trocar os logos, substitua `assets/logo_sim.png` e `assets/logo_alpargatas.png`.

## Dados da empresa e este repositório

O repositório é **público**: nenhuma planilha, base ou cadastro vai para o Git (`.gitignore` bloqueia
`.xlsx`, `.xls`, `.parquet` e a pasta `dados/`). Os dados ficam só nas pastas do OneDrive/SharePoint.

`ferramentas/extrair_base_html.py` tira a base IW38 embutida no HTML antigo, caso o export antigo
não exista mais.

## Desenvolvimento

```bash
uv sync
uv run streamlit run streamlit_app.py
uv run pytest
```

Estrutura: `central/` (leitura dos arquivos, fontes — pastas, SharePoint ou GitHub —, preparação das
bases, login, interface), `paginas/` (uma por tela), `sincronizador/` (agente PC → nuvem), `tests/`.
