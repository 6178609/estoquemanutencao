# Padrões deste projeto (vale para toda sessão)

## Comando padrão: `claude --advisor opus --subagents haiku`
- **Conselheiro = Opus.** Antes de decisões de arquitetura, mudanças grandes ou de publicar algo que mexa em
  várias telas, consulte um agente com `model: "opus"` (planejar, revisar o diff, procurar erros) e siga o parecer.
- **Subagentes = Haiku.** Todo agente auxiliar (busca, leitura, tarefas em paralelo) é lançado com
  `model: "haiku"`, salvo quando o próprio conselheiro (Opus) for o agente.

## Como trabalhar
- **Várias tarefas = vários agentes (padrão definitivo):** quando o pedido tiver várias tarefas independentes, dividir entre
  agentes em paralelo, cada um com o modelo adequado: `haiku` para busca, leitura, conversão e tarefas mecânicas;
  `opus` para planejar, revisar o diff e decisões de arquitetura. Dados da empresa continuam só em ferramentas locais.
- Responder sempre em **português do Brasil**.
- Toda alteração é **publicada no site**: commit → push no ramo de trabalho → PR para `main` → merge →
  realinhar o ramo com `main`.
- Antes de publicar: `cd web && npx tsc --noEmit && npx vitest run`.
- **Publicar sempre o que já está pronto (padrão definitivo):** ao terminar cada resposta, e sempre antes de o uso
  (limite da sessão) acabar, tudo que já está concluído e verificado vai para o site (commit → push → PR → merge →
  conferir o deploy). Só fica sem publicar o que ainda está em andamento (agente trabalhando, teste falhando, revisão
  pendente) — e isso é dito ao usuário. Trabalho grande vai em partes publicáveis, sem acumular. Dados encontrados por
  agentes (ex.: fotos dos materiais) também são gravados no repositório de dados assim que validados.

## Segurança (inegociável — o repositório é público)
- Nunca gravar em arquivo, commit ou log: senhas, usuário do SAP, tokens (GitHub, Vercel) ou chaves.
- Nunca commitar dados da empresa: exports do SAP (xlsx/xls/htm/csv/parquet/json de dados), pasta `dados/`,
  e-mails ou nomes de pessoas. Testes usam só dados fictícios.
- Nunca pedir credenciais, tokens ou chaves no chat; se aparecerem, não repetir e orientar a revogar.

## Acesso às abas (regra única: a lista de abas)
- **Quem vê o quê é só a lista de abas do usuário** (Usuários → "Escolher as abas"), para qualquer função: Estoque,
  Suporte Técnico e Equipamentos também ficam na lista; não há aba livre nem visão parcial. Regra em `web/lib/auth/acesso.ts`
  (`abasDoUsuario`), teste em `web/testes/acesso.test.ts`.
- **"Padrão da função"** (sem lista): Líder e Analista veem todas (toda aba nova entra liberada para eles); Manutentor e
  Terceiro veem Estoque e Suporte Técnico (`ABAS_BASICAS`). Aba nova não entra sozinha em lista própria: o administrador marca.
- Terceiro e Manutentor (`FUNCOES_SO_ESTOQUE`) não podem ser administradores, não gravam na biblioteca técnica
  (`podeEditarSuporte`) nem na Gestão de MRO e não têm bloco de cartão. O Início leva ao Painel, ou ao Estoque se a pessoa
  não vê o Painel.

## Avisos por e-mail
- Aviso semanal de treinamentos vencendo aos líderes (função Líder, ativo, com e-mail em Usuários): toda segunda 8h
  (cron no `web/vercel.json` → `/api/avisos/treinamentos`, protegido por `CRON_SECRET`). Montagem em
  `lib/wcm/avisoTreinamentos.ts`, envio em `lib/avisos/`. SMTP só nas variáveis da Vercel (`SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USUARIO`, `SMTP_SENHA`, `EMAIL_REMETENTE`) — nunca no repositório; e-mails ficam só no cadastro de usuários.

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
- `ui-ux-pro-max` (MIT, v2.15.0): guia de UI/UX (estilos, paletas, tipografia, 119 regras de UX/acessibilidade,
  gráficos, stack Next.js/shadcn). Usar ao criar ou mexer em telas do site, junto com o visual atual (cores SIM/
  Alpargatas de `web/app/globals.css`). Busca: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<consulta>"
  --domain <ux|style|color|typography|chart>` ou `--stack nextjs`.
- `find-skills` (Vercel, MIT): procura skills prontas no ecossistema (`npx skills find …`, skills.sh) quando o
  pedido for uma capacidade nova. Instalar só com o OK do usuário, **no projeto** (`.claude/skills/<nome>`, com a
  LICENSE), depois de ler o código: nada que acesse rede, rode comandos ou peça credenciais sem motivo claro.

## Informativos (padrão a partir de agora)
- Texto do informativo (comunicado, boletim, status da manutenção): skill `internal-comms`.
- Visual (cartaz/informativo de mural, PNG ou PDF): `canvas-design` com tema da `theme-factory`.
- Formato pedido pelo usuário: `docx` (Word), `pdf`, `pptx` (slides) ou `docs` (documento compartilhável).
- Dados do informativo só de fontes reais do site (painel, indicadores); nada da empresa vai para o repositório.

## Fotos automáticas
- Rotina diária `GET /api/fotos/buscar` (vercel.json, 06:17 UTC = 03:17 em Brasília), protegida por `CRON_SECRET`; o botão
  "Buscar agora" em Fontes de dados chama o `POST` (editores, 10 buscas). **Todos os provedores gratuitos em rodízio**
  (Brave, Serper, Firecrawl, SerpApi; Google Programmable Search só com chave antiga, até 01/2027), cada um na sua cota diária; chaves só nas variáveis da
  Vercel (`BUSCA_IMAGENS_CHAVE_<PROVEDOR>`, `BUSCA_IMAGENS_GOOGLE_CX`, `BUSCA_IMAGENS_POR_DIA[_<PROVEDOR>]`; ver `web/README.md`). Lógica em
  `lib/fotos/` (provedores, escolha, rodada) e `lib/dados/pdmDeducao.ts`; cadastros `fotos_referencia.json` e
  `fotos_busca_estado.json`.
- **Só o almoxarifado (MB52):** a busca de fotos é só para os materiais do almoxarifado; o catálogo do Sysmat não é buscado
  (só empresta a descrição com FAB/REF).
- **Só foto real do item:** própria ou do fabricante, cujo título/página traz a referência (REF) do material. Foto genérica
  por tipo, subcategoria ou categoria (ilustrativa) não é usada: mostrava peça diferente da descrição. Sem foto exata, o
  item fica sem foto.

## Estrutura
- `web/`: o site (Next.js 16 na Vercel) — leia `web/AGENTS.md` antes de mexer. É o único código do repositório:
  o site antigo (Streamlit), o robô do SAP, o sincronizador do PC e o Calendário de ordens foram apagados.
  Os exports do SAP entram pela aba Fontes de dados.
- Dados: bases do SAP no repositório privado de dados (GitHub); cadastros no Supabase (projeto
  `central-manutencao-sp`, São Paulo) — ver `web/lib/dados/cadastros.ts` e `supabase.ts`. Mudança no banco só por
  migração (conector Supabase `apply_migration`), conferindo depois os avisos de segurança (`get_advisors`).
