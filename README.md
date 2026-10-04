# Central de Manutenção · PCM F26

App web da manutenção (SIM Manutenção Profissional · Alpargatas F26) que junta **ordens do IW38**,
**estoque do MB52**, **equipamentos** e **requisições de compra** numa tela só, e que **se atualiza sozinho**:
ninguém precisa importar planilha. Funciona no computador e no celular, com login e perfis de acesso.

Substitui o antigo `ESTOQUE MANUTENÇÃO.html` (um HTML de 3 MB com a base embutida e dados salvos só no navegador).

## Como os dados se atualizam sozinhos

```
SAP (IW38 / MB52 / requisições)
   │  export manual ou automatico (automacao/exportar_sap.vbs + Agendador de Tarefas)
   ▼
Pastas do SharePoint sincronizadas pelo OneDrive
   ~\OneDrive - Alpargatas S.A\PCM F26 - Documentos\1.3 - Controle de Estoque
   ~\OneDrive - Alpargatas S.A\PCM F26 - Documentos\0.1 - Indicadores
   │  o app varre as pastas (e subpastas) a cada 60 s
   ▼
Central de Manutenção  →  todas as telas abertas recarregam quando chega arquivo novo
```

- O app **reconhece cada arquivo pelo conteúdo** (cabeçalhos), não pelo nome: pode ser `.xlsx`, `.xls`,
  `.csv`, `.txt` (lista do SAP com `|`), `.htm` ("salvar como HTML" do SAP GUI) ou `.parquet`. Também acha
  a base dentro de uma aba qualquer de uma pasta de trabalho, mesmo com o cabeçalho fora da linha 1.
- Para cada base usa **o arquivo mais recente**. Se pegar a planilha errada, fixe o arquivo certo em
  **Configuração › Fontes de dados** (um arquivo fixado continua sendo relido quando é sobrescrito).
- Base mais velha que 2 dias aparece em laranja, com aviso, em todas as telas.
- Cadastros feitos no app (criticidade e peças de cada equipamento, estoque mínimo, usuários) ficam em
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
- **Equipamentos** — lista montada automaticamente a partir do IW38 com custo, corretivas e pendências;
  ficha com intervalo médio entre corretivas (aprox. MTBF), histórico anual e cadastro de criticidade,
  categoria e peças de reposição (com situação do estoque de cada peça).
- **Estoque** — saldo do MB52 por material e por depósito, **estoque mínimo editável na própria tabela**,
  alerta de peças de equipamentos críticos em falta.
- **Requisições** — o que aguarda aprovação, com quem está parado e há quantos dias.
- **Fontes de dados** — de onde vem cada base, data do arquivo, troca/fixação de arquivo e envio manual.

Os filtros de **período, centro de trabalho e tipo de ordem** ficam na barra lateral e valem para Painel,
Ordens e Equipamentos. Por padrão o período é "últimos 12 meses" (até hoje); ordens com data-base futura
entram em "Tudo" ou num período personalizado.

## Exportação automática do SAP (opcional)

`automacao/exportar_sap.vbs` abre a IW38 e a MB52 com uma variante salva (`/CENTRAL`) e grava `IW38.XLSX` e
`MB52.XLSX` em `0.1 - Indicadores\Exportacao SAP`. Requer SAP GUI aberto e **SAP GUI Scripting habilitado**.
Os IDs de tela variam com a versão do SAP GUI: se algum passo falhar, grave a exportação uma vez com
*Script Recording and Playback* e ajuste o trecho indicado no script.

Para rodar todo dia às 7h:

```bat
schtasks /create /tn "Central Manutencao - export SAP" /tr "wscript.exe \"C:\CentralManutencao\automacao\exportar_sap.vbs\"" /sc daily /st 07:00
```

## Configuração

Tudo tem padrão; só crie `.streamlit/secrets.toml` (modelo em `.streamlit/secrets.toml.exemplo`) se precisar
mudar pastas, intervalo de verificação, desligar o login ou ligar o **modo SharePoint**. Esse modo lê
direto da biblioteca pelo Microsoft Graph e é o que o app usa na nuvem.

Visual: verde e grafite do logo SIM e cores do logo Alpargatas (`.streamlit/config.toml`), com tema claro e
escuro (menu ⋮ › Settings). Para trocar os logos, substitua `assets/logo_sim.png` e `assets/logo_alpargatas.png`.

## Dados da empresa e este repositório

O repositório é **público**: nenhuma planilha, base ou cadastro vai para o Git (`.gitignore` bloqueia
`.xlsx`, `.xls`, `.parquet` e a pasta `dados/`). Os dados ficam só nas pastas do OneDrive/SharePoint.

`ferramentas/extrair_base_html.py` tira a base IW38 embutida no HTML antigo, caso o `IW38BK.XLSX` original
não exista mais.

## Desenvolvimento

```bash
uv sync
uv run streamlit run streamlit_app.py
uv run pytest
```

Estrutura: `central/` (leitura dos arquivos, fontes — pastas, SharePoint ou GitHub —, preparação das
bases, login, interface), `paginas/` (uma por tela), `sincronizador/` (agente PC → nuvem), `tests/`.
