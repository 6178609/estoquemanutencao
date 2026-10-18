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
- Antes de publicar: `cd web && npx tsc --noEmit && npx vitest run`.

## Segurança (inegociável — o repositório é público)
- Nunca gravar em arquivo, commit ou log: senhas, usuário do SAP, tokens (GitHub, Vercel) ou chaves.
- Nunca commitar dados da empresa: exports do SAP (xlsx/xls/htm/csv/parquet/json de dados), pasta `dados/`,
  e-mails ou nomes de pessoas. Testes usam só dados fictícios.
- Nunca pedir credenciais, tokens ou chaves no chat; se aparecerem, não repetir e orientar a revogar.

## Acesso às abas novas
- Toda aba nova entra liberada **100% para Líder e Analista** e **bloqueada para as demais funções** até o administrador
  liberar (lista de abas do usuário em Usuários). Regra única em `web/lib/auth/acesso.ts`.
- Terceiros veem só `PAGINAS_TERCEIRO` (hoje: Estoque e Gestão de MRO), só consulta fora do Estoque.

## Skills e conectores (usar sempre)
- No início de cada tarefa, conferir as skills e os conectores disponíveis na sessão e usar **todos os que se aplicam**
  à tarefa — não resolver "na mão" o que uma skill ou conector faz. Dizer na resposta quais foram usados.
- Código do site: skills de processo (superpowers: brainstorming antes de tela/recurso novo, systematic-debugging em
  erro, verification-before-completion antes de publicar) + revisão do Opus.
- **Vercel** (conector): depois de cada merge, conferir o deploy de produção (estado READY) e, em erro, os logs.
- **GitHub** (conector): PR, merge e checks.
- Documentos e arquivos: `docs` (documento compartilhável), `docx`, `pdf`, `pptx`, `xlsx`; apresentações também pelo
  conector **Gamma**; pesquisa na web com **Firecrawl** ou a skill `deep-research`.
- Visual e textos: `canvas-design`, `theme-factory`, `internal-comms`, `doc-coauthoring`, `web-artifacts-builder`.
- Skills/conectores sem relação com a tarefa (ex.: Shopify, GIF do Slack) não entram só para "usar"; o que estiver
  desconectado (Microsoft 365, PostHog) é avisado ao usuário quando a tarefa precisar dele.

## Skills do projeto (`.claude/skills/`)
- `prompt-master` (MIT, v1.8.2): escreve e corrige prompts para outras IAs (ChatGPT, Claude, Cursor,
  Midjourney…). Só entra quando o pedido é escrever/ajustar um prompt.

## Informativos (padrão a partir de agora)
- Texto do informativo (comunicado, boletim, status da manutenção): skill `internal-comms`.
- Visual (cartaz/informativo de mural, PNG ou PDF): `canvas-design` com tema da `theme-factory`.
- Formato pedido pelo usuário: `docx` (Word), `pdf`, `pptx` (slides) ou `docs` (documento compartilhável).
- Dados do informativo só de fontes reais do site (painel, indicadores); nada da empresa vai para o repositório.

## Estrutura
- `web/`: o site (Next.js 16 na Vercel) — leia `web/AGENTS.md` antes de mexer. É o único código do repositório:
  o site antigo (Streamlit), o robô do SAP, o sincronizador do PC e o Calendário de ordens foram apagados.
  Os exports do SAP entram pela aba Fontes de dados.
