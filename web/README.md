# Central de Manutenção · site novo (Next.js na Vercel)

Frontend novo da Central de Manutenção, migrado **por etapas** a partir do site atual (Streamlit). Lê e grava o
**mesmo repositório privado de dados** que o site atual e o sincronizador do PC usam — os dois sites funcionam ao
mesmo tempo, com as mesmas contas, as mesmas regras de acesso por função e os mesmos cadastros.

| Onda | Abas no site novo | Situação |
|---|---|---|
| 1 | Início · Estoque (material do almoxarifado e material cadastrado) | no ar |
| 2 | Equipamentos / Gestão de ativos · Painel WCM | próxima |
| 3+ | Ordens, planos, programação, HH, AF, custos, configuração… | a seguir |

As abas ainda não migradas aparecem no menu e abrem no site atual (`URL_SITE_ATUAL`).

## Visual

Inspirado no template *Developer Tools Landing* (21st.dev): base neutra quase preto/branco, a tipografia faz a
hierarquia — títulos em dois tons, com a segunda parte no cinza da marca SIM —, cartões claros de borda fina com o
ícone num quadradinho, faixa de números grandes e "um objeto por seção" (o mosaico de triângulos da Alpargatas em
SVG, `components/Objeto.tsx`). As cores vêm só das logos: verde SIM `#009C48` (ação principal) e o espectro
Alpargatas — vermelho `#E41824`, laranja `#F07818`, amarelo `#FCB40C`, azul `#006CB4`, ciano `#009CD8`, azul-claro
`#6CCCF0`, lima `#A8C024` — para status, categorias e dados (`app/globals.css`, `components/ui.tsx`). Tema claro e
escuro. Fontes: Space Grotesk (títulos) e Inter (texto).

## Como os dados chegam

- **`bases/*.parquet`** no repositório de dados: o sincronizador do PC grava o export mais novo de cada base; quando
  alguém envia um export pela tela do site atual (modo nuvem), o site atual grava também o parquet
  (`central/nuvem.py`). O site novo só lê esses parquets — nunca planilhas soltas.
- **`app/*.json`**: cadastros (usuários, mínimos de estoque, equipamentos…). As gravações daqui usam a mesma regra do
  site atual: relê, aplica só o que mudou, grava condicionado à versão (sem perder a gravação de outra pessoa) e faz
  a cópia diária em `app/backup/`.
- **Login**: Número Pessoal (NP) + senha do site atual (mesmo hash PBKDF2). A sessão fica registrada em
  `usuarios.json` como no site atual: desativar a pessoa ou trocar a senha dela derruba o acesso nos dois sites.
- Sem repositório configurado o site abre em **modo demonstração** (dados fictícios gerados no código).

Nenhum dado da empresa vai para este repositório (ele é público).

## Ligar aos dados reais direto na Vercel (sem o site atual)

1. Crie o repositório **privado** `estoquemanutencao-dados` e um token fine-grained só para ele (Contents: read/write).
2. No PC com os exports do SAP, rode `sincronizador\configurar.bat` com esse token: ele envia os exports para
   `bases/` a cada 5 min.
3. Na Vercel (Settings › Environment Variables), crie `DADOS_GH_REPO` e `DADOS_GH_TOKEN` (Sensitive) e publique de
   novo (Deployments › Redeploy).
4. **Primeiro acesso**: com o repositório sem usuários, a tela de entrada pede para criar o administrador, com o
   **código de configuração** = os 6 últimos caracteres do token (prova que quem cria configurou o site). Depois,
   a equipe é cadastrada em **Usuários** (senha provisória, trocada no primeiro acesso).

## Ligar aos dados reais pelo site atual (sem copiar o token do GitHub)

No site atual, um **administrador** abre **Configuração › Fontes de dados › Site novo (Vercel)**, cola um token da
Vercel (vercel.com › Account Settings › Tokens, validade curta) e clica em **Ligar o site novo**. O site atual grava
na Vercel o repositório de dados e o token que ele mesmo já usa (secrets do modo GitHub ou o
`sincronizador/config.toml` do PC), mais o endereço dele, e publica de novo. O token do GitHub nunca aparece na tela;
o da Vercel não fica gravado (`central/vercel.py`).

## Variáveis (Vercel › Project › Settings › Environment Variables)

| Variável | Para quê |
|---|---|
| `DADOS_GH_REPO` | repositório privado de dados, ex.: `6178609/estoquemanutencao-dados` |
| `DADOS_GH_TOKEN` | token do GitHub com leitura e escrita **só** nesse repositório (fine-grained, Contents: read/write) |
| `DADOS_GH_RAMO` | ramo (padrão `main`) |
| `URL_SITE_ATUAL` | endereço do site atual, para as abas ainda não migradas |

Projeto na Vercel: **`estoquemanutencao`** (conta 6178609), **Root Directory = `web`**, framework Next.js, Node 22 (fixado em `engines` do package.json) —
cada push no `main` publica em produção (https://estoquemanutencao.vercel.app) e cada ramo ganha uma prévia. O plano Hobby da Vercel é só para uso pessoal; para
uso na empresa, o plano Pro.

## Desenvolvimento

```bash
cd web
npm install
npm run dev            # modo demonstração
DADOS_PASTA=/pasta/com/bases-e-app npm run dev   # com uma cópia local do repositório de dados
npm test               # vitest (regras portadas do Python, gravação de cadastros, acesso)
npm run build
```

Estrutura: `app/` (telas e rotas de API), `components/` (design system), `lib/dados/` (fonte GitHub/pasta/demo,
parquet, MB52 e catálogo do Sysmat, cadastros), `lib/auth/` (login, sessões e acesso por função),
`lib/navegacao.ts` (a mesma lista de abas de `central/navegacao.py` — `tests/test_web_navegacao.py` confere).
