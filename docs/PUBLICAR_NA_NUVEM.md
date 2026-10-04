# Publicar o site 24h (Streamlit Community Cloud)

Resultado: um endereço do tipo `https://central-manutencao-f26.streamlit.app` que abre de qualquer lugar
(PC, celular, fora da fábrica), com login. Os dados continuam vindo das pastas do SharePoint e se
atualizam sozinhos.

```
SAP ──export──► SharePoint PCMF26 (1.3 Controle de Estoque · 0.1 Indicadores)
                      ▲                                   │
       OneDrive / script do SAP                 Microsoft Graph (a cada 60 s)
                                                          ▼
                                    Central de Manutenção no Streamlit Cloud ──► equipe (PC e celular)
```

## Passo 1 — Pedir o acesso à TI (uma vez)

Envie para a TI o arquivo [`PEDIDO_TI_SHAREPOINT.md`](PEDIDO_TI_SHAREPOINT.md). Eles devolvem três
informações: **tenant id**, **client id** e **segredo**.

## Passo 2 — Código no GitHub

O Streamlit Cloud publica a partir do GitHub (`github.com/6178609/estoquemanutencao`). O código precisa
estar lá, no branch `main` ou no branch deste trabalho.

## Passo 3 — Criar o app no Streamlit Cloud

1. Acesse https://share.streamlit.io e entre com a conta do GitHub.
2. **Create app › Deploy a public app from GitHub**:
   - Repository: `6178609/estoquemanutencao`
   - Branch: `main` (ou o branch deste trabalho)
   - Main file path: `streamlit_app.py`
   - App URL: por exemplo `central-manutencao-f26`
3. Em **Advanced settings**:
   - Python version: 3.12 ou mais nova
   - **Secrets**: cole o bloco abaixo com os dados que a TI enviou:

   ```toml
   [central]
   sp_tenant_id = "COLE-AQUI-O-TENANT-ID"
   sp_client_id = "COLE-AQUI-O-CLIENT-ID"
   sp_client_secret = "COLE-AQUI-O-SEGREDO"
   ```

   Site e pastas já vêm configurados (`PCMF26`, `1.3 - Controle de Estoque` e `0.1 - Indicadores`).
4. **Deploy**. A primeira subida leva uns 3 a 5 minutos.

## Passo 4 — Primeiro acesso

Abra o endereço. A tela pede para criar o **administrador**; depois cadastre a equipe em
**Configuração › Usuários**. Se você já usava o app no PC com o OneDrive, os usuários e cadastros são os
mesmos (ficam na mesma pasta `Central de Manutenção (app)` do SharePoint).

## Passo 5 — Não deixar o app "dormir"

O Streamlit Cloud gratuito põe o app em espera depois de **12 horas sem visitas**. A primeira pessoa que
abre depois espera cerca de 30 s. Para evitar:

1. No GitHub: **Settings › Secrets and variables › Actions › Variables › New repository variable**
   - Name: `APP_URL` · Value: o endereço do app (ex.: `https://central-manutencao-f26.streamlit.app`)
2. A rotina `.github/workflows/manter-app-acordado.yml` visita o app a cada 6 horas. Para testar na hora:
   aba **Actions › Manter app acordado › Run workflow**.

> O GitHub desliga rotinas agendadas em repositórios sem nenhuma atividade há 60 dias. Se isso
> acontecer, ele avisa por e-mail; é só reativar na aba Actions.

## Manutenção

- **O segredo vence** (12 ou 24 meses): peça um novo à TI e troque em *App settings › Secrets* no
  Streamlit Cloud. O app reinicia sozinho.
- **Atualizar o código**: tudo que entra no branch publicado vai para o ar automaticamente.
- **Problemas de leitura**: a tela **Configuração › Fontes de dados** mostra qual arquivo está em uso
  em cada base e os erros de acesso ao SharePoint.

## Limites do plano gratuito

- Cerca de 1 GB de memória: a base atual (86 mil ordens) usa uns 400 MB com todas as telas abertas. Bases muito
  maiores podem exigir filtrar o export do IW38 (por exemplo, só os últimos 3 anos).
- O endereço é público; quem protege os dados é o login do próprio app. Se a política da empresa exigir
  que o app só abra na rede interna, ele precisa ser hospedado num servidor da própria empresa.
