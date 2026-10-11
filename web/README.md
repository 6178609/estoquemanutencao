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

## Variáveis (Vercel › Project › Settings › Environment Variables)

| Variável | Para quê |
|---|---|
| `DADOS_GH_REPO` | repositório privado de dados, ex.: `6178609/estoquemanutencao-dados` |
| `DADOS_GH_TOKEN` | token do GitHub com leitura e escrita **só** nesse repositório (fine-grained, Contents: read/write) |
| `DADOS_GH_RAMO` | ramo (padrão `main`) |
| `URL_SITE_ATUAL` | endereço do site atual, para as abas ainda não migradas |

Projeto na Vercel: **`estoquemanutencao`** (conta 6178609), **Root Directory = `web`**, framework Next.js, Node 22 —
cada push no `main` publica em produção (`estoquemanutencao-6178609.vercel.app`) e cada ramo ganha uma prévia. O plano Hobby da Vercel é só para uso pessoal; para
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
