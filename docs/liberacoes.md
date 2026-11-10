# Liberações que dependem do responsável pelo site

Passo a passo do que só o dono das contas consegue fazer. **Nenhuma chave, senha ou token vai para o chat, para o
repositório ou para e-mail**: só nas telas da Vercel indicadas abaixo. Projeto na Vercel: **pcmemacao** (conta 6178609).
Faça na ordem: o 1 destrava a publicação; os demais só valem depois de um Redeploy (passo 6).

## 1. Desbloquear a conta na Vercel ("Account is blocked")

Desde 10/11 os merges no `main` não viram site novo: a Vercel recusa o deploy com "Account is blocked". O site continua
no ar com a última versão boa.

1. Entre em https://vercel.com com a conta dona do projeto.
2. Veja se há um aviso vermelho/amarelo no topo do painel e se chegou um e-mail da Vercel sobre bloqueio ou limite.
   Ele diz o motivo.
3. Abra **Usage** (menu da conta). Procure o item que passou de 100% do plano Hobby (gratuito), por exemplo transferência
   de dados, execuções de funções ou otimização de imagens.
4. Para resolver:
   - **Sem pagar:** esperar o ciclo de uso de 30 dias virar (a data aparece em Usage). O bloqueio cai sozinho.
   - **Na hora:** Settings → Billing → mudar para o plano Pro.
   - Se o aviso falar em verificação de conta ou violação de uso, siga o link do aviso ou abra um chamado em
     https://vercel.com/help.
5. Depois de liberado, faça o passo 6 (Redeploy) para publicar o que ficou parado.

## 2. Chaves dos provedores de busca de fotos e datasheets

Cada provedor dá uma cota grátis. Basta cadastrar os que quiser; o site usa todos em rodízio.

| Provedor | Onde criar a chave (grátis) | Nome da variável na Vercel |
|---|---|---|
| Brave Search API | https://api-dashboard.search.brave.com → plano Free → API Keys | `BUSCA_IMAGENS_CHAVE_BRAVE` |
| Serper | https://serper.dev → criar conta → API Key | `BUSCA_IMAGENS_CHAVE_SERPER` |
| Firecrawl | https://www.firecrawl.dev → criar conta → API Keys | `BUSCA_IMAGENS_CHAVE_FIRECRAWL` |
| SerpApi | https://serpapi.com → criar conta (plano Free) → Api Key | `BUSCA_IMAGENS_CHAVE_SERPAPI` |

Para cada chave:

1. Vercel → projeto **pcmemacao** → **Settings** → **Environment Variables**.
2. **Key**: o nome da tabela acima. **Value**: a chave copiada do provedor.
3. Marque **Production**, salve e marque como **Sensitive** se a opção aparecer.

## 3. Segredo das rotinas automáticas (`CRON_SECRET`)

Protege a busca diária de fotos (03:17 em Brasília) e o aviso semanal de treinamentos (segunda, 8h). Sem ele as rotinas
não rodam.

1. Gere um texto aleatório longo, com pelo menos 32 caracteres. No PowerShell:
   `[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")`.
2. Em Environment Variables, crie **`CRON_SECRET`** com esse valor, em Production.
3. Não é preciso guardar nem enviar esse valor: a própria Vercel o usa nas chamadas agendadas.

## 4. E-mail dos avisos (SMTP)

Necessário para o aviso semanal de treinamentos vencendo aos líderes. Use uma conta de e-mail de serviço da empresa, e
peça ao TI os dados do servidor SMTP. Crie em Environment Variables (Production):

| Variável | O que é | Exemplo de formato |
|---|---|---|
| `SMTP_HOST` | servidor de envio | `smtp.office365.com` |
| `SMTP_PORT` | porta (587 normal; 465 = SSL) | `587` |
| `SMTP_USUARIO` | usuário da conta de envio | `avisos@empresa.com` |
| `SMTP_SENHA` | senha ou senha de aplicativo | (só na Vercel) |
| `EMAIL_REMETENTE` | quem aparece como remetente | `Central de Manutenção <avisos@empresa.com>` |

Os líderes precisam ter e-mail cadastrado em **Usuários** no site.

## 5. Domínios do projeto

1. Vercel → pcmemacao → **Settings** → **Domains**.
2. **pcmemacao.com** e **pcmemcao.com** não têm DNS configurado e só geram erro. Clique em **Remove** em cada um. Se
   quiser um domínio próprio no futuro, ele precisa ser comprado e apontado antes.
3. **estoquemanutencao.vercel.app**: clique em **Edit** e deixe em **Connect to an environment → Production**, sem
   redirecionamento. Assim o endereço antigo também abre o site.
4. O endereço principal fica **https://pcmemacao.vercel.app**.

## 6. Redeploy (depois dos passos 1 a 5)

Variável nova só vale num deploy novo.

1. Vercel → pcmemacao → **Deployments**.
2. No deploy mais recente do `main`, clique em **⋯** → **Redeploy** → confirme.
3. Espere o estado **Ready** e abra o site.

## 7. No próprio site

1. **Fontes de dados** → **Buscar agora**: baixa já as fotos e os datasheets gravados e testa os provedores. Se der erro
   de chave, revise o passo 2.
2. **Fontes de dados** → envie a **IP19 atual** (novembro a janeiro). A Programação de paradas usa esse arquivo.
3. **Programação de paradas**: confirme se EMPILHADEIRA, BANHEIRO, PINHEIRO e FORNO TÚNEL entram na programação. Basta
   responder no chat.

## Conferência rápida

- O deploy mais recente na Vercel aparece **Ready** e com o commit mais novo do `main`.
- No dia seguinte, em Fontes de dados, a rotina de fotos aparece com a data de hoje.
- Na segunda depois das 8h, os líderes receberam o aviso de treinamentos (se houver treinamento vencendo).
