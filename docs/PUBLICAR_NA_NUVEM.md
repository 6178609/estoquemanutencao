# Publicar o site 24h (Streamlit Community Cloud)

Resultado: um endereço do tipo `https://central-manutencao-f26.streamlit.app` que abre de qualquer lugar
(PC, celular, fora da fábrica), com login, e que se atualiza sozinho com os exports das pastas
`1.3 - Controle de Estoque` e `0.1 - Indicadores`.

Na nuvem o site não enxerga o OneDrive de ninguém, então os dados chegam por um destes caminhos:

| | **A. Sincronizador no PC** (sem TI) | **B. SharePoint direto** (com a TI) |
|---|---|---|
| Como chega | um programa no seu PC envia o export mais novo de cada base para um repositório **privado** de dados no GitHub | o site lê as pastas direto do SharePoint pela API da Microsoft |
| Depende de | um PC ligado e logado, com o OneDrive sincronizando | a TI registrar um aplicativo no Azure (uma vez) |
| Atraso | até ~6 min (5 do sincronizador + 1 do site) | até ~1 min |
| Onde ficam cópias dos dados | repositório privado no GitHub | só no SharePoint |

Dá para começar pelo **A** e, quando a TI liberar, passar para o **B**: basta trocar os Secrets.

---

## Caminho A — Sincronizador no PC

```
SAP ─export─► pastas do OneDrive ─(a cada 5 min)─► sincronizador no PC ─► repositório privado de dados (GitHub)
                                                                                       │
                                                         site no Streamlit Cloud ◄─────┘ ──► equipe (PC e celular)
```

### A1. Criar o repositório de dados (privado)

No GitHub: **New repository**
- Nome: `estoquemanutencao-dados`
- **Private**
- Marque **Add a README file** (o repositório não pode começar vazio)

### A2. Criar o token de acesso

No GitHub: foto do perfil › **Settings › Developer settings › Personal access tokens › Fine-grained tokens ›
Generate new token**
- Nome: `Central de Manutenção`
- Expiration: **1 ano** (anote na agenda para renovar)
- Repository access: **Only select repositories** › `estoquemanutencao-dados`
- Permissions › Repository permissions › **Contents: Read and write**
- **Generate token** e copie o código (`github_pat_...`). Ele só aparece uma vez.

O token só dá acesso ao repositório de dados, não ao código nem ao resto da sua conta.

### A3. Instalar o sincronizador no PC

No PC que tem as pastas do OneDrive sincronizadas (o seu, ou um que fique sempre ligado):
1. Baixe o projeto (ZIP do GitHub) e descompacte, por exemplo em `C:\CentralManutencao`.
2. Dê duplo clique em **`sincronizador\configurar.bat`**:
   - confirme o repositório (`6178609/estoquemanutencao-dados`);
   - cole o token.
3. Ele faz um primeiro envio de teste, mostra o que achou e deixa o sincronizador agendado para iniciar
   sozinho, sem janela, sempre que você entrar no Windows.

O registro do que ele faz fica em `sincronizador\sincronizador.log`. O token fica só neste PC, em
`sincronizador\config.toml`.

O que o sincronizador faz:
- a cada 5 minutos procura nas duas pastas (e subpastas) o export **mais recente** de cada base, reconhecido
  pelo conteúdo, inclusive dentro de uma aba de planilha de indicadores;
- quando algum mudou, envia **só a tabela daquela base**, compactada (`bases/IW38.parquet`, etc.). Se nada
  mudou, não envia nada;
- uma vez por semana apaga as versões antigas no repositório, para ele não crescer sem parar.

### A4. Publicar o site

1. Acesse https://share.streamlit.io e entre com a conta do GitHub (autorize o acesso a repositórios
   privados, se o código estiver privado).
2. **Create app**:
   - Repository: `6178609/estoquemanutencao`
   - Branch: `main`
   - Main file path: `streamlit_app.py`
   - App URL: por exemplo `central-manutencao-f26`
3. **Advanced settings**:
   - Python version: 3.12 ou mais nova
   - **Secrets**:
     ```toml
     [central]
     gh_repo = "6178609/estoquemanutencao-dados"
     gh_token = "COLE-AQUI-O-TOKEN"
     ```
4. **Deploy**. A primeira subida leva uns 3 a 5 minutos.

Usuários, cadastros de equipamentos e estoques mínimos feitos no site ficam na pasta `app/` do repositório
de dados.

---

## Caminho B — SharePoint direto (quando a TI liberar)

1. Envie para a TI o arquivo [`PEDIDO_TI_SHAREPOINT.md`](PEDIDO_TI_SHAREPOINT.md). Eles devolvem
   **tenant id**, **client id** e **segredo**.
2. No Streamlit Cloud, em **App settings › Secrets**, troque o conteúdo por:
   ```toml
   [central]
   sp_tenant_id = "COLE-AQUI-O-TENANT-ID"
   sp_client_id = "COLE-AQUI-O-CLIENT-ID"
   sp_client_secret = "COLE-AQUI-O-SEGREDO"
   ```
   Site e pastas já vêm configurados (`PCMF26`, `1.3 - Controle de Estoque` e `0.1 - Indicadores`).
3. O sincronizador do PC pode ser desligado: Agendador de Tarefas › `Central Manutencao - Sincronizador` ›
   Desabilitar.

> Os usuários e cadastros ficam em lugares diferentes em cada caminho (`app/` no repositório de dados ×
> pasta `Central de Manutenção (app)` no SharePoint). Na troca, copie os arquivos `.json` de um lugar para o
> outro para manter logins e cadastros.

---

## Primeiro acesso

Abra o endereço. A tela pede para criar o **administrador**; depois cadastre a equipe em
**Configuração › Usuários**.

## Não deixar o app "dormir"

O Streamlit Cloud gratuito põe o app em espera depois de **12 horas sem visitas**. A primeira pessoa que
abre depois espera cerca de 30 s. Para evitar:

1. No GitHub, no repositório do código: **Settings › Secrets and variables › Actions › Variables ›
   New repository variable**
   - Name: `APP_URL` · Value: o endereço do app (ex.: `https://central-manutencao-f26.streamlit.app`)
2. A rotina `.github/workflows/manter-app-acordado.yml` visita o app a cada 6 horas. Para testar na hora:
   aba **Actions › Manter app acordado › Run workflow**.

> O GitHub desliga rotinas agendadas em repositórios sem nenhuma atividade há 60 dias. Se isso
> acontecer, ele avisa por e-mail; é só reativar na aba Actions.

## Manutenção

- **Token (caminho A) ou segredo (caminho B) vencem**: gere um novo e troque em *App settings › Secrets*
  no Streamlit Cloud; no caminho A, rode de novo o `sincronizador\configurar.bat` no PC.
- **PC desligado (caminho A)**: o site continua no ar com os últimos dados enviados; depois de 2 dias as
  bases aparecem em laranja como desatualizadas.
- **Atualizar o código**: tudo que entra no branch publicado vai para o ar automaticamente.
- **Problemas**: a tela **Configuração › Fontes de dados** mostra de onde veio cada base, quando e por
  qual PC, além dos erros de acesso.

## Limites do plano gratuito

- Cerca de 1 GB de memória: a base atual (86 mil ordens) usa uns 400 MB com todas as telas abertas. Bases muito
  maiores podem exigir filtrar o export do IW38 (por exemplo, só os últimos 3 anos).
- O endereço é público; quem protege os dados é o login do próprio app. Se a política da empresa exigir
  que o app só abra na rede interna, ele precisa ser hospedado num servidor da própria empresa.
