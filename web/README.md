# Central de Manutenção · site novo (Next.js na Vercel)

Central de Manutenção na Vercel — é o site da manutenção (o antigo, em Streamlit, foi apagado). Lê e grava um
**repositório privado de dados** no GitHub: as bases do SAP (anexadas em **Fontes de dados** ou enviadas pelo
sincronizador do PC) e os cadastros (usuários, mínimos, equipamentos).

| Onda | Abas | Situação |
|---|---|---|
| 1 | Início · Estoque · Fontes de dados · Usuários · Minha conta | no ar |
| 2 | Equipamentos / Gestão de ativos · Painel WCM | próxima |
| 3+ | Ordens, planos, programação, HH, AF, custos, configuração… | a seguir |

As abas ainda não migradas aparecem no menu como "em breve".

## Visual

Inspirado no template *Developer Tools Landing* (21st.dev): base neutra quase preto/branco, a tipografia faz a
hierarquia — títulos em dois tons, com a segunda parte no cinza da marca SIM —, cartões claros de borda fina com o
ícone num quadradinho, faixa de números grandes e "um objeto por seção" (o mosaico de triângulos da Alpargatas em
SVG, `components/Objeto.tsx`). As cores vêm só das logos: verde SIM `#009C48` (ação principal) e o espectro
Alpargatas — vermelho `#E41824`, laranja `#F07818`, amarelo `#FCB40C`, azul `#006CB4`, ciano `#009CD8`, azul-claro
`#6CCCF0`, lima `#A8C024` — para status, categorias e dados (`app/globals.css`, `components/ui.tsx`). Tema claro e
escuro. Fontes: Space Grotesk (títulos) e Inter (texto).

## Como os dados chegam

- **`bases/*.parquet`** no repositório de dados: gravados pela aba **Fontes de dados** (o export é lido no navegador)
  ou pelo sincronizador do PC; `bases/manifesto.json` guarda a data do export, a origem e, numa base grande, as
  partes. O servidor só lê esses parquets — nunca planilhas soltas.
- **`app/*.json`**: cadastros (usuários, mínimos de estoque, equipamentos…). As gravações releem o arquivo,
  aplicam só o que mudou, gravam condicionado à versão (sem perder a gravação de outra pessoa) e fazem
  a cópia diária em `app/backup/`.
- **Login**: Número Pessoal (NP) + senha (hash PBKDF2). A sessão fica registrada
  em `usuarios.json`: desativar a pessoa ou trocar a senha dela derruba o acesso na hora. Depois de **30 minutos sem
  uso** (em todas as abas abertas) o site avisa 1 minuto antes e sai sozinho; o servidor também encerra a sessão parada
  (`proxy.ts`, regra em `lib/auth/inatividade.ts`).
- Sem repositório configurado o site abre em **modo demonstração** (dados fictícios gerados no código).
- **Estabilidade**: cada chamada ao GitHub tem tempo limite e repete em falha de rede, 5xx e limite de taxa; se o
  GitHub falhar, o site segue com a última versão lida. Export novo do robô: a tela responde com as bases anteriores
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
   cabeçalhos (`lib/leitura/`; o sincronizador do PC usa a mesma leitura em `sincronizador/leitura.py`), gera o parquet e envia — em partes de até 3 MB
   quando a base é grande (limite de 4,5 MB por requisição da Vercel). O manifesto só aponta para a base nova quando
   a última parte chega. O sincronizador do PC (`sincronizador/`) continua opcional, gravando o mesmo arquivo.

## Variáveis (Vercel › Project › Settings › Environment Variables)

| Variável | Para quê |
|---|---|
| `DADOS_GH_REPO` | repositório privado de dados, ex.: `6178609/estoquemanutencao-dados` |
| `DADOS_GH_TOKEN` | token do GitHub com leitura e escrita **só** nesse repositório (fine-grained, Contents: read/write) |
| `DADOS_GH_RAMO` | ramo (padrão `main`) |

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
`lib/navegacao.ts` (a lista de abas).
