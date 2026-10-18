# Padrões deste projeto (vale para toda sessão)

## Comando padrão: `claude --advisor opus --subagents haiku`
- **Conselheiro = Opus.** Antes de decisões de arquitetura, mudanças grandes ou de publicar algo que mexa em
  várias telas, consulte um agente com `model: "opus"` (planejar, revisar o diff, procurar erros) e siga o parecer.
- **Subagentes = Haiku.** Todo agente auxiliar (busca, leitura, tarefas em paralelo) é lançado com
  `model: "haiku"`, salvo quando o próprio conselheiro (Opus) for o agente.

## Como trabalhar
- Responder sempre em **português do Brasil**.
- Toda alteração é **publicada no site**: commit → push no ramo de trabalho → PR para `main` → merge →
  realinhar o ramo com `main`.
- Antes de publicar: `cd web && npx tsc --noEmit && npx vitest run`; mudanças no sincronizador/robô (Python do PC)
  também com `uv run python -m pytest -q`.

## Segurança (inegociável — o repositório é público)
- Nunca gravar em arquivo, commit ou log: senhas, usuário do SAP, tokens (GitHub, Vercel) ou chaves.
  O robô do SAP usa só o Gerenciador de Credenciais do Windows.
- Nunca commitar dados da empresa: exports do SAP (xlsx/xls/htm/csv/parquet/json de dados), pasta `dados/`,
  e-mails ou nomes de pessoas. Testes usam só dados fictícios.
- Nunca pedir credenciais, tokens ou chaves no chat; se aparecerem, não repetir e orientar a revogar.

## Acesso às abas novas
- Toda aba nova entra liberada **100% para Líder e Analista** e **bloqueada para as demais funções** até o administrador
  liberar (lista de abas do usuário em Usuários). Regra única em `web/lib/auth/acesso.ts`.
- Terceiros veem só `PAGINAS_TERCEIRO` (hoje: Estoque e Gestão de MRO), só consulta fora do Estoque.

## Skills do projeto (`.claude/skills/`)
- `prompt-master` (MIT, v1.8.2): escreve e corrige prompts para outras IAs (ChatGPT, Claude, Cursor,
  Midjourney…). Só entra quando o pedido é escrever/ajustar um prompt.

## Informativos (padrão a partir de agora)
- Texto do informativo (comunicado, boletim, status da manutenção): skill `internal-comms`.
- Visual (cartaz/informativo de mural, PNG ou PDF): `canvas-design` com tema da `theme-factory`.
- Formato pedido pelo usuário: `docx` (Word), `pdf`, `pptx` (slides) ou `docs` (documento compartilhável).
- Dados do informativo só de fontes reais do site (painel, indicadores); nada da empresa vai para o repositório.

## Estrutura
- `web/`: site novo (Next.js 16 na Vercel) — leia `web/AGENTS.md` antes de mexer.
- O site antigo (Streamlit) foi apagado: o site é só o `web/`. Nada de código novo em Python para telas.
- `automacao/` (robô do SAP) e `sincronizador/` (PC → repositório privado de dados; inclui a leitura dos exports do
  SAP e os pedidos de mudança de datas do robô).
