# Central de Manutenção · PCM F26

App web da manutenção (SIM Manutenção Profissional · Alpargatas F26) que junta **ordens do IW38** (com as operações
do IW38OP), **planos da IP19**, **notas da IW28**, **equipamentos da IH08**, **estoque do MB52** e **requisições de
compra** numa tela só, e que **se atualiza sozinho**:
ninguém precisa importar planilha. Funciona no computador e no celular, com login e perfis de acesso.

Substitui o antigo `ESTOQUE MANUTENÇÃO.html` (um HTML de 3 MB com a base embutida e dados salvos só no navegador).

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
  são compartilhados com toda a equipe.

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

- **Painel** — ordens no período, % com plano (preventiva) × sem plano, backlog e atrasos, custo real e
  corretivo, evolução mensal, top 10 de custo e de reincidência, idade do backlog, alertas de estoque e de
  compras, e uma leitura rápida em texto.
- **Ordens** — busca em todas as colunas, filtros (situação, plano, status do usuário, prioridade, só
  atrasadas, só com custo), escolha de colunas, detalhe da ordem com histórico do equipamento, exportação
  para Excel.
- **Planos** — calendário de 52 semanas de cada plano de manutenção a partir da **IP19**: cada chamada
  colorida como concluída, em aberto, atrasada, programada ou saltada, cruzando a ordem com o IW38.
  Mostra aderência até hoje, carga de chamadas por semana e o histórico do plano. Sem IP19 nas pastas,
  usa as ordens do IW38 que têm plano.
- **Notas** — notas da IW28: quantas ainda não viraram ordem e há quanto tempo, paradas de máquina, notas por
  semana e os equipamentos que mais geram notas.
- **Equipamentos** — **gerenciamento de equipamentos** no formato da tela antiga: botão **Novo equipamento** com
  TAG, nome (sugerido pelo SAP quando a TAG é um equipamento do IW38/IH08), categoria, criticidade, visão geral e
  **componentes vinculados da base de material** (busca e marcação dos materiais do MB52). A lista mostra cada
  equipamento com categoria, criticidade, nº de componentes e alerta de peça sem estoque; abre para ver os
  componentes com o saldo, editar ou remover. A visão **Análise pelas ordens (IW38)** mantém a lista automática com
  custo, backlog, notas e a ficha com histórico e intervalo médio entre corretivas (aprox. MTBF).
- **Estoque** — saldo do MB52 por material e por depósito, **estoque mínimo editável na própria tabela**,
  alerta de peças de equipamentos críticos em falta e **foto de cada material** (envio de arquivo ou câmera do
  celular; a foto aparece em miniatura na tabela e fica em `fotos_materiais/` na pasta do app).
- **Requisições** — o que aguarda aprovação, com quem está parado e há quantos dias.
- **Fontes de dados** — de onde vem cada base, data do arquivo, troca/fixação de arquivo e envio manual.

Os filtros de **período, centro de trabalho e tipo de ordem** ficam na barra lateral e valem para Painel,
Ordens e Equipamentos. Por padrão o período é "últimos 12 meses" (até hoje); ordens com data-base futura
entram em "Tudo" ou num período personalizado.

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
