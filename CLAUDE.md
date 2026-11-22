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
- **Seguir com as melhorias sem perguntar (pedido do usuário, 17/11/2026):** melhoria, correção ou atualização de segurança
  que já está clara segue direto (verificar → revisar → publicar) e é relatada na resposta; só pergunta o que for decisão de
  negócio que só o usuário pode tomar ou ação irreversível fora do repositório.
- Toda alteração é **publicada no site**: commit → push no ramo de trabalho → PR para `main` → merge →
  realinhar o ramo com `main`.
- Antes de publicar: `cd web && npx tsc --noEmit && npx vitest run`.
- **Publicar sempre o que já está pronto (padrão definitivo):** ao terminar cada resposta, e sempre antes de o uso
  (limite da sessão) acabar, tudo que já está concluído e verificado vai para o site (commit → push → PR → merge →
  conferir o deploy). Só fica sem publicar o que ainda está em andamento (agente trabalhando, teste falhando, revisão
  pendente) — e isso é dito ao usuário. Trabalho grande vai em partes publicáveis, sem acumular. Dados encontrados por
  agentes (ex.: fotos dos materiais) também são gravados no repositório de dados assim que validados.

- **Retomada após limite (padrão definitivo):** toda vez que um limite libera (uso da sessão, cota de agentes, créditos de
  provedor como o Firecrawl), a primeira coisa é rodar a verificação de pendências: ler `docs/pendencias.md`, conferir
  ramo/commits não publicados, agentes interrompidos, PRs abertos e o último deploy, e seguir com o que estiver parado.
  `docs/pendencias.md` é atualizado ao fim de cada entrega (sem dados da empresa).

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
- **Pedido de acesso só para quem não tem usuário (pedido do PCM, 17/11/2026):** a tela de entrada recusa o pedido de quem já
  tem usuário (mesmo Número Pessoal, também com zeros à esquerda, ou mesmo nome completo) e o segundo pedido da mesma pessoa
  enquanto o primeiro espera; a aprovação confere de novo (`jaTemUsuario` em `web/lib/auth/solicitacoes.ts`).
- **Cadastro de material:** aprovadores marcados em Usuários (Almoxarifado / PCM); Terceiro nunca aprova; só aprova quem vê a
  aba (regras em `web/lib/cadastroMaterial/`).

## Controle de HH (aba `agenda_hh`, pedido do usuário, 19/11/2026)
- Recria no site o antigo "Controle de HH | PCM" (Cloudflare Workers), com 5 sub-abas: Horas disponíveis, Programação,
  Comparativo, Cobertura e Calendário. Regras em `web/lib/agendaHh/regras.ts` (dias úteis seg–sex, disponível = dias úteis ×
  jornada − férias − folga − ausências da Gestão de HH, sem contar dia em dobro) e `analise.ts`; dados no cadastro
  `agenda_hh.json`; gravação só por `acoes.ts` (aba + `podeEditar` + fora da demonstração, validação no servidor).
- Melhorias sobre o original: preenche a ordem pela IW38, traz a equipe da Gestão de HH, alertas de sobrecarga (programado
  acima do disponível, fim de semana, férias/folga), status "Concluída" e aderência, HH por tipo de ordem, histórico de
  reprogramação, Excel (modelo, importar até 500 linhas, exportar) e backup no formato do sistema antigo (para migrar).
- Turnos da programação: 1º, Administrativo e 2º (pedido do usuário, 19/11/2026); no calendário o Administrativo fica numa
  faixa entre o 1º e o 2º turno (metade em cada); a planilha aceita "ADM", "1", "2o turno" etc. (`turnoDaCelula`).

## UBM (aba `ubm`, pedido do usuário, 22/11/2026)
- Armário kanban em campo com itens do Almox ("UBM (armário kanban)", grupo Custos e suprimentos). Spec em
  `docs/superpowers/specs/2026-11-22-ubm-design.md`. Regras puras em `web/lib/ubm/regras.ts` (validação, saldo, reposição,
  análise, kit colado/Excel), gravação em `lib/ubm/dados.ts` (cadastros `ubm_armarios.json` e `ubm_movimentos_<AAAA-MM>.json`,
  um por mês de Brasília, a leitura junta todos; fotos em `app/documentos/ubm/<movimento>/`, reduzidas no celular a 1600 px
  JPEG), rota `app/api/ubm/route.ts`, telas em `app/(app)/ubm/` (sub-abas, `retirada` e `solicitacao` para o celular pelo QR,
  `qr` para imprimir as etiquetas A4 ou salvar em PDF; QR em SVG/PNG no servidor, `lib/ubm/qr.ts`, e botões "Baixar QR
  (PNG/SVG)" e "Baixar etiqueta (PNG)" — `UBM-01_retirada_qr.png` etc.). Datas e filtros pelo dia de Brasília (`diaBr`).
  Endereço do QR: `URL_SITE`/`URL_SITE_ATUAL`, na Vercel sem elas o fixo `https://pcmemacao.vercel.app`.
- **Ordem e código nunca travam:** só o formato; IW38 e Sysmat servem para mostrar a descrição e para a análise (associação
  na leitura). Retirada pede foto e "Já lançado na ordem pelo SAP Mobile?"; a aba cobra as não lançadas.
- Kit: UM por item (PC/UN inteiro, M e outras com 2 casas), quantidade padrão = máximo, mínimo opcional (= padrão). Saldo:
  contagem fixa, reposição soma, retirada subtrai; repor quando saldo < mínimo (separar padrão − saldo).
- Quem grava: retirada/solicitação, quem vê a aba (e quem retirou marca "lançada"); armários, reposição, contagem e fechar
  solicitação, `podeGerir` (perfil de edição, fora de Terceiro/Manutentor). Auditoria `ubm_*`. Testes em `testes/ubm.test.ts`.
- A lista real do kit vai só para o repositório de dados; a demonstração usa armários fictícios (`lib/ubm/demo.ts`).
- Visão geral mostra o armário desenhado como no infográfico (`app/(app)/ubm/ArmarioVisual.tsx`, pedido do usuário,
  22/11/2026): uma gaveta por família do kit (até 9; o resto em "Diversos"), "!" laranja com item abaixo do mínimo, gaveta
  abre com os itens e saldo, e a porta com os dois QR reais. Teste em `testes/ubmArmario.test.ts`.
- Login com volta: quem abre uma página sem sessão entra e volta a ela (`lib/auth/volta.ts`, só caminho interno).

## Avisos por e-mail
- Aviso semanal de treinamentos vencendo aos líderes (função Líder, ativo, com e-mail em Usuários): toda segunda 8h
  (cron no `web/vercel.json` → `/api/avisos/treinamentos`, protegido por `CRON_SECRET` (criado em 20/11/2026) — **pendente: sem SMTP na
  Vercel o aviso não sai**, ver `docs/liberacoes.md`). Montagem em
  `lib/wcm/avisoTreinamentos.ts`, envio em `lib/avisos/`. SMTP só nas variáveis da Vercel (`SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USUARIO`, `SMTP_SENHA`, `EMAIL_REMETENTE`) — nunca no repositório; e-mails ficam só no cadastro de usuários.

## Skills e conectores (usar sempre)
- **Sem exceção (pedido do usuário, 18/11/2026):** em todas as sessões e em toda entrega, usar as skills e conectores necessários.
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
- Rotina diária `GET /api/fotos/buscar` (vercel.json, 06:17 UTC = 03:17 em Brasília), protegida por `CRON_SECRET` (criado em 20/11/2026; **sem as chaves `BUSCA_IMAGENS_*` a
  rotina só confere as fotos gravadas; as fotos novas andam por rodadas manuais do Firecrawl e da busca web do Claude (WebSearch,
  sem crédito), com a mesma conferência pela REF**); o botão
  "Buscar agora" em Fontes de dados chama o `POST` (editores, 10 buscas). **Todos os provedores gratuitos em rodízio**
  (Brave, Serper, Firecrawl, SerpApi; Google Programmable Search só com chave antiga, até 01/2027), cada um na sua cota diária; chaves só nas variáveis da
  Vercel (`BUSCA_IMAGENS_CHAVE_<PROVEDOR>`, `BUSCA_IMAGENS_GOOGLE_CX`, `BUSCA_IMAGENS_POR_DIA[_<PROVEDOR>]`; ver `web/README.md`). Lógica em
  `lib/fotos/` (`buscaImagem` = provedores, escolha, `rodadaFotos`) e `lib/dados/pdmDeducao.ts`; cadastros `fotos_referencia.json` e
  `fotos_busca_estado.json`.
- **Só o almoxarifado (pedido do PCM, 16/11/2026):** a busca automática de fotos e de datasheets cobre só os materiais do
  almoxarifado (MB52) com fabricante e REF no Sysmat (`planejarBusca`); o resto do catálogo não entra na fila. Fotos já
  gravadas de materiais fora do almoxarifado continuam aparecendo.
- **Fotos baixadas e no padrão (pedido do PCM, 16/11/2026):** a tela só mostra foto guardada no repositório de dados. A rotina
  "Baixar fotos dos materiais" do repositório de dados (GitHub Actions, 03:47 de Brasília; `.github/scripts/baixar_fotos.py`)
  baixa toda foto de `fotos_referencia.json` e grava no padrão único: JPEG quadrado 1600×1600, fundo branco, a peça inteira
  centralizada, mais miniatura 400×400 (`app/fotos/fabricante/<material>.jpg` e `_mini.jpg`). Loja que bloqueia: endereço
  direto da imagem pelo Firecrawl (segredo `FIRECRAWL_API_KEY` no repositório de dados). Página morta ou de outro item sai do
  cadastro e o material volta à busca.
- **Datasheet do material (aba Estoque):** seção no detalhamento (Almoxarifado e Catálogo) com os links/PDFs da biblioteca
  `datasheets_materiais.json` (coleção MATERIAL em `lib/dados/documentos.ts`, PDFs em `app/documentos/materiais/`), o botão
  "Procurar datasheet" e, para editor, link ou PDF. Busca automática na mesma rotina das fotos (`lib/datasheet/`), mesma fila
  e provedores (busca web), só aceita resultado com a REF no título/endereço, fora de loja; até `DATASHEETS_POR_DIA` (40).
- **Sem cancelados e duplicados no banco (pedido do PCM, 10/11/2026):** o envio do catálogo do Sysmat descarta as linhas
  CANCELADO e DUPLICADO (`semCanceladosDuplicados` em `lib/leitura/processar.ts`) e a leitura também as ignora
  (`prepararCatalogo`); vínculos e fotos desses códigos foram removidos dos cadastros.
- **Só foto real do item:** própria ou do fabricante, cujo título/página traz a referência (REF) do material. Foto genérica
  por tipo, subcategoria ou categoria não é usada: mostrava peça diferente da descrição. Sem foto exata, o item fica sem foto.
- **Exceção — foto Ilustrativa (pedido do PCM, 16/11/2026):** item do almoxarifado que está no Sysmat **sem** fabricante/REF
  pode ter foto de um produto com a mesma especificação da Descr Completa (PDM + medidas), gravada com `equivalente: true`
  em `fotos_referencia.json` e mostrada com o selo **"Ilustrativa"** (`ROTULO_FOTO` em `lib/fotoMaterial.ts`).
- **Aba Estoque só com material do Sysmat (pedido do PCM, 16/11/2026):** o que está na MB52 e não está no catálogo do Sysmat
  é item de produção e sai da lista (`soMateriaisDoSysmat` em `lib/dados/materiais.ts`); sem catálogo carregado, fica tudo.
- **Tela de entrada (pedido do usuário, 18/11/2026):** visual limpo e claro, sem 3D (WebGL) nem foto/vídeo de fundo. Abertura
  em CSS/SVG, em ciclo de 12 s: um foguete cruza a tela e a logo SIM se abre e pulsa (`components/IntroFoguete.tsx`), com as órbitas da logo
  (`components/OrbitasSim.tsx`); embaixo, um astronauta articulado (joelhos, cotovelos) corre puxando a logo, para,
  acena e fala uma frase motivacional (`components/AstronautaSim.tsx`, ciclo de 18 s). A cada aparição do balão sai uma
  frase sorteada (`components/BalaoFrase.tsx`, `lib/frasesAstronauta.ts`), sem repetir até a lista acabar; a posição
  fica no navegador (localStorage), então recarregar continua a sequência. No computador, tudo numa tela só, sem
  rolagem, conferido nas alturas reais do navegador (1280×600 a 1920×940): o rodapé fica no topo e, em tela baixa, saem
  destaques, parágrafo e dica do formulário; o formulário nunca é cortado. Com "reduzir movimento", fica parado.
- **Agulhas de costura fora do estoque (pedido do PCM, 17/11/2026):** os PDMs de agulha de costura (`PDM_FORA_DO_ESTOQUE` em
  `lib/dados/materiais.ts`) saem da aba Estoque e da fila de busca de fotos; fotos já gravadas delas foram apagadas.

## Estrutura
- `web/`: o site (Next.js 16 na Vercel) — leia `web/AGENTS.md` antes de mexer. É o único código do repositório:
  o site antigo (Streamlit), o robô do SAP, o sincronizador do PC e o Calendário de ordens foram apagados.
  Os exports do SAP entram pela aba Fontes de dados.
- Dados: bases do SAP, cadastros (`app/*.json`) e auditoria (`app/auditoria/<ano-mês>.json`, 12 meses) no repositório
  privado de dados (GitHub) — ver `web/lib/dados/cadastros.ts` e `web/lib/auditoria.ts`. Cópia diária em `app/backup/`
  (60 dias, fica o dia 1 de cada mês). **Sem Supabase (pedido do usuário, 20/11/2026):** o site está só na Vercel; não
  usar o conector Supabase nem recriar banco.
