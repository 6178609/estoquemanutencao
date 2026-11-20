# Central de Manutenção (Next.js na Vercel)

Central de Manutenção na Vercel. Lê e grava um
**repositório privado de dados** no GitHub: as bases do SAP (anexadas em **Fontes de dados**) e os cadastros
(usuários, mínimos, equipamentos).

## Visual

Inspirado no template *Developer Tools Landing* (21st.dev): base neutra quase preto/branco, a tipografia faz a
hierarquia — títulos em dois tons, com a segunda parte no cinza da marca SIM —, cartões claros de borda fina com o
ícone num quadradinho, faixa de números grandes e "um objeto por seção" (o mosaico de triângulos da Alpargatas em
SVG, `components/Objeto.tsx`). As cores vêm só das logos: verde SIM `#009C48` (ação principal) e o espectro
Alpargatas — vermelho `#E41824`, laranja `#F07818`, amarelo `#FCB40C`, azul `#006CB4`, ciano `#009CD8`, azul-claro
`#6CCCF0`, lima `#A8C024` — para status, categorias e dados (`app/globals.css`, `components/ui.tsx`). Tema claro e
escuro. Fontes: Space Grotesk (títulos) e Inter (texto).

## Como os dados chegam

- **`bases/*.parquet`** no repositório de dados: gravados pela aba **Fontes de dados** (o export é lido no navegador);
  `bases/manifesto.json` guarda a data do export, a origem e, numa base grande, as
  partes. O servidor só lê esses parquets — nunca planilhas soltas.
- **Cadastros** (usuários, Gestão de HH, Controle de HH, mínimos de estoque, equipamentos, metas…): em `app/*.json`
  no repositório de dados (`lib/dados/cadastros.ts`). As gravações releem o cadastro, aplicam só o que mudou e gravam
  condicionado à versão (sem perder a gravação de outra pessoa). Cópia de segurança: a versão anterior vai para
  `app/backup/<cadastro>-<dia>.json` antes da primeira gravação do dia; as cópias com mais de 60 dias saem sozinhas
  (fica a do dia 1 de cada mês), e o histórico do Git guarda tudo.
- **Auditoria** (quem fez o quê e quando): `app/auditoria/<ano-mês>.json` no repositório de dados, 12 meses
  (`lib/auditoria.ts`); os eventos de uma mesma resposta vão numa gravação só.
- **Login**: Número Pessoal (NP) + senha (hash PBKDF2). A sessão fica registrada
  em `usuarios.json`: desativar a pessoa ou trocar a senha dela derruba o acesso na hora. Depois de **30 minutos sem
  uso** (em todas as abas abertas) o site avisa 1 minuto antes e sai sozinho; o servidor também encerra a sessão parada
  (`proxy.ts`, regra em `lib/auth/inatividade.ts`).
- Sem repositório configurado o site abre em **modo demonstração** (dados fictícios gerados no código).
- **Estabilidade**: cada chamada ao GitHub tem tempo limite e repete em falha de rede, 5xx e limite de taxa; se o
  GitHub falhar, o site segue com a última versão lida. Export novo: a tela responde com as bases anteriores
  e monta as novas logo depois da resposta (quem acabou de enviar pela aba Fontes de dados espera e já vê o dado
  novo). Uma tela que falhar mostra "Tentar de novo". Os links não pré-carregam as telas ao abrir a página (só a
  barra lateral, ao passar o mouse).

Nenhum dado da empresa vai para este repositório (ele é público).

## Ligar aos dados reais

1. Crie o repositório **privado** `estoquemanutencao-dados` e um token fine-grained só para ele (Contents: read/write).
2. Na Vercel (Settings › Environment Variables), crie `DADOS_GH_REPO` e `DADOS_GH_TOKEN` (Sensitive) e publique de
   novo (Deployments › Redeploy).
3. **Primeiro acesso**: com o repositório sem usuários, a tela de entrada pede para criar o administrador, com o
   **código de configuração** = os 6 últimos caracteres do token (prova que quem cria configurou o site). Depois,
   a equipe é cadastrada em **Usuários** (senha provisória, trocada no primeiro acesso).
4. **Fontes de dados**: anexe os exports do SAP (vários de uma vez). O navegador reconhece cada base pelos
   cabeçalhos (`lib/leitura/`), gera o parquet e envia — em partes de até 3 MB
   quando a base é grande (limite de 4,5 MB por requisição da Vercel). O manifesto só aponta para a base nova quando
   a última parte chega.

## Variáveis (Vercel › Project › Settings › Environment Variables)

| Variável | Para quê |
|---|---|
| `DADOS_GH_REPO` | repositório privado de dados, ex.: `6178609/estoquemanutencao-dados` |
| `DADOS_GH_TOKEN` | token do GitHub com leitura e escrita **só** nesse repositório (fine-grained, Contents: read/write) |
| `DADOS_GH_RAMO` | ramo (padrão `main`) |
| `CRON_SECRET` | segredo das rotinas agendadas (`vercel.json`): sem ele a busca diária de fotos e o aviso semanal devolvem 401 e não rodam |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USUARIO`, `SMTP_SENHA`, `EMAIL_REMETENTE` | e-mail do aviso semanal de treinamentos (ver `docs/liberacoes.md`) |
| `URL_SITE` (ou `URL_SITE_ATUAL`) | endereço do site no link do e-mail (padrão: https://pcmemacao.vercel.app) |
| `BUSCA_IMAGENS_CHAVE_GOOGLE` + `BUSCA_IMAGENS_GOOGLE_CX` | Google Programmable Search (imagens; 100 buscas/dia grátis): chave da API e id do buscador. **Só para chave já existente**: o Google fechou a API para clientes novos e encerra em 01/01/2027 |
| `BUSCA_IMAGENS_CHAVE_BRAVE` | Brave Search API (plano grátis, ~2.000/mês) |
| `BUSCA_IMAGENS_CHAVE_SERPER` | Serper (2.500 buscas grátis no cadastro) |
| `BUSCA_IMAGENS_CHAVE_FIRECRAWL` | Firecrawl (500 créditos grátis no cadastro) |
| `BUSCA_IMAGENS_CHAVE_SERPAPI` | SerpApi (100 buscas/mês grátis) |
| `BUSCA_IMAGENS_PROVEDOR` + `BUSCA_IMAGENS_CHAVE` | forma antiga (um provedor só); continua valendo |
| `BUSCA_IMAGENS_POR_DIA` | teto de buscas por dia (máx. 200; sem ela, a soma das cotas dos provedores configurados — com só o Brave, 60) |
| `BUSCA_IMAGENS_POR_DIA_<PROVEDOR>` | cota diária de um provedor (padrão: google 100, brave 60, serper 80, firecrawl 15, serpapi 3) |

Todas as chaves marcadas como *Sensitive*. A busca usa **todos** os provedores configurados em rodízio: cada material
passa pelo próximo provedor quando o anterior não traz a foto exata (com a REF) ou está sem cota.

Projeto na Vercel: **`pcmemacao`** (conta 6178609), **Root Directory = `web`**, framework Next.js, Node 22 (fixado em `engines` do package.json) —
cada push no `main` publica em produção (https://pcmemacao.vercel.app — endereço gratuito da Vercel; os domínios .com só funcionam com DNS configurado) e cada ramo ganha uma prévia. O plano Hobby da Vercel é só para uso pessoal; para
uso na empresa, o plano Pro.

## Desenvolvimento

```bash
cd web
npm install
npm run dev            # modo demonstração
DADOS_PASTA=/pasta/com/bases-e-app npm run dev   # com uma cópia local do repositório de dados
npm test               # vitest (regras dos indicadores, gravação de cadastros, acesso)
npm run build
```

Estrutura: `app/` (telas e rotas de API), `components/` (design system), `lib/dados/` (fonte GitHub/pasta/demo,
parquet, MB52 e catálogo do Sysmat, cadastros), `lib/auth/` (login, sessões e acesso por função),
`lib/navegacao.ts` (a lista de abas).
