# Central de Manutenção · PCM F26

Site de gestão da manutenção de nível WCM (pilar **Manutenção Profissional**) da SIM Manutenção Profissional ·
Alpargatas F26: ordens (IW38/IW38OP), apontamentos (IW47), notas (IW28), planos (IP19), equipamentos (IH08),
estoque (MB52), catálogo do Sysmat, requisições, Gerenciador de AF, equipe e disponibilidade (Gestão de HH),
treinamentos e férias — com indicadores, metas, farol e tendência, login e acesso por função.

## O site: [`web/`](web/README.md)

Next.js publicado na **Vercel** (cada push no `main` vai para produção). Lê os dados de um repositório **privado** no
GitHub e é o único site do sistema — o antigo (Streamlit) foi apagado. Tudo sobre telas, dados, login e
desenvolvimento está no [`web/README.md`](web/README.md).

## No PC da fábrica (Windows)

Duas peças em Python rodam num PC com as pastas do OneDrive e o SAP GUI. As duas são opcionais: os exports também
podem ser anexados direto no site (aba **Fontes de dados**).

```
SAP ──(export manual ou robô do SAP)──▶ pastas do OneDrive / Downloads\SITE
      ──(sincronizador, a cada 5 min)──▶ repositório privado de dados (bases/*.parquet) ──▶ site na Vercel
```

### Sincronizador (`sincronizador/`)

- Acha cada export do SAP **pelo conteúdo** (cabeçalhos), não pelo nome — `.xlsx`, `.xls`, `.csv`, `.txt`,
  `.htm` ou `.parquet`, até numa aba qualquer de uma pasta de trabalho — e envia o mais recente de cada base em
  parquet, com a data original no `bases/manifesto.json`.
- Pastas olhadas: `~\OneDrive - Alpargatas S.A\PCM F26 - Documentos\1.3 - Controle de Estoque` e `…\0.1 -
  Indicadores`, `~\Downloads\SITE` (com subpastas) e a própria `~\Downloads`. Planilhas baixadas do site e arquivos
  com "filtrado" no nome são ignorados.
- A planilha de **Gestão de HH não é mais enviada**: a equipe é cadastrada na aba Gestão de HH do site.
- Instalar: `sincronizador\configurar.bat` (pede o repositório de dados e o token, que ficam só neste PC).

**Atualizar o PC:** o sincronizador busca o código novo no GitHub a cada 6 h, copia por cima da pasta (só o que
mudou; as configurações do PC — token, usuário do SAP — ficam) e se reinicia. Para atualizar na hora, dê duplo
clique em **`atualizar.bat`**. Instalação antiga, sem o `atualizar.bat`: baixe o ZIP de novo, copie por cima da
pasta do sistema (substituir) e reinicie o computador — daí em diante ele se atualiza sozinho. Para desligar a
atualização automática: `atualizar_horas = 0` em `sincronizador/config.toml`.

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
- **Pré-requisito:** SAP GUI Scripting habilitado (SAP GUI › Opções › Acessibilidade e scripting › Scripting).
- **Nova transação:** acrescente um bloco `[[transacao]]` em `transacoes.toml`. Se um campo tiver outro ID no seu
  SAP, o robô diz qual passo falhou; grave a transação uma vez em *Alt+F12 › Script Recording and Playback* e copie
  o ID.

## Dados da empresa e este repositório

O repositório é **público**: nenhuma planilha, base ou cadastro vai para o Git (`.gitignore` bloqueia `.xlsx`,
`.xls`, `.parquet` e a pasta `dados/`). Os dados ficam no OneDrive e no repositório privado de dados; senhas e
tokens só no PC (Gerenciador de Credenciais do Windows, `sincronizador/config.toml`).

## Desenvolvimento

```bash
cd web && npm ci && npx tsc --noEmit && npx vitest run   # site
uv sync && uv run pytest                                # sincronizador e robô do SAP
```
