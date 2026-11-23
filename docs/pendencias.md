# Pendências (atualizar ao fim de cada entrega)

Lido no início de toda retomada (regra "Retomada após limite" do CLAUDE.md). Sem dados da empresa.

## Em andamento

- **Machine Ledger — operações e IA06 (publicado em 23/11)**
  - Associação operação ↔ componente (sugestão + confirmação do PCM), código pela referência do fabricante (o PCM confirma) e
    download da IA06 (CSV + VBS com a operação) no ar.
  - Em aberto: o usuário exportar as listas de tarefas de EQUIPAMENTO ("E") no mesmo formato (só as gerais vieram); conferir
    uma amostra dos códigos pela referência antes de confirmar em massa; confirmar as sugestões de correspondência.

- **Programação de paradas (GAL1 Componentes)** — spec `docs/superpowers/specs/2026-11-10-programacao-paradas-design.md`,
  plano `docs/superpowers/plans/2026-11-10-programacao-paradas.md`.
  - Publicadas: parte 1 (leitura, motor R1–R15, 11 conferências, aba com Programação, Verificação e "Fora das classes") e
    parte 2 (calendário do mês com impressão, Saldo HH, Campos por dia, Ativos sem HH, Excel), com o motor ~10x mais rápido.
  - Em aberto: parte 3 (edição, Parâmetros, histórico) e parte 4 (IW38 backlog, IW32 CSV/VBS), cada uma revisada pelo
    Opus e publicada.
  - Ocupação da semana anterior: prensa/Pellet/mesma máquina na semana que começou antes de hoje.
  - Confirmar com o planejador se EMPILHADEIRA, BANHEIRO, PINHEIRO e FORNO TÚNEL entram na programação de Componentes.
  - A IP19 nas bases do site é a antiga (out–dez): reenviar a IP19 atual (nov–jan) em Fontes de dados.

- **Fotos e datasheets dos materiais (só almoxarifado desde 16/11)**
  - Estado (19/11): 473 de 604 fotos já baixadas no padrão 1600×1600; cerca de 1.100 materiais na fila de busca.
    Em 16/11, 1.725 materiais com fabricante e REF ainda não tinham foto.
  - A busca é feita em rodadas manuais: Firecrawl (cerca de 50 buscas por dia, conforme o crédito) e, desde 20/11/2026, também
    a busca web do Claude (sem crédito; melhor para fabricante + REF internacionais). 20/11: 300 buscados (240 pela busca web, 60 pelo Firecrawl), 53 fotos novas (25 pela busca web,
    28 pelo Firecrawl); total 657 materiais com foto, 496 baixadas no padrão; 155 esperam o Firecrawl para baixar
    (loja bloqueia); fila do almoxarifado ≈ 940.
    22/11: 110 buscados (50 pelo Firecrawl até o crédito acabar, 60 pela busca web), 10 fotos novas; total 667 com
    foto, 498 baixadas no padrão; fila ≈ 830. (21/11 não rodou: a sessão reiniciou.)
    23/11: 180 buscados pela busca web (sem Firecrawl), 13 fotos novas; 81 fotos que não baixavam (loja bloqueia)
    trocadas por outra página com a mesma REF das buscas já feitas → 36 baixaram; total 680 com foto, 540 no padrão.
    A rotina automática da Vercel (`/api/fotos/buscar`) depende do `CRON_SECRET` (ver `docs/liberacoes.md`).
  - Download e padrão: a rotina do repositório de dados (03:47) grava as fotos em JPEG 1600×1600 quadrado e miniatura
    400×400. Falta o segredo `FIRECRAWL_API_KEY` no repositório de dados para as lojas que bloqueiam o download.
  - Foto "Ilustrativa" (selo, `equivalente: true`): faltam buscar as fotos dos ~457 itens do Sysmat sem fabricante/REF,
    pela descrição (PDM + medidas), quando houver crédito.

- **Aba "Cadastro de material"**: publicada (PR #201). Adiado para depois:
  - datalist com todas as tags dos equipamentos (carregar sob demanda);
  - mês UTC × São Paulo nos filtros e no resumo;
  - aviso por e-mail aos aprovadores (depende do SMTP na Vercel);
  - Usuários: marcar aprovador também ao criar usuário e ao aprovar pedido de acesso.

- **Controle de HH (aba `agenda_hh`)**: publicada (19/11). Falta migrar os dados do sistema antigo pelo "Importar backup".

- **Avaliação geral do site (16/11/2026)**
  - Validar com o PCM: Reincidência ≈ 59% e MTTR < 1 h com a regra YM11 (efeito dos dados: várias YM11 por evento e
    apontamentos curtos).
  - Reexportar do SAP e enviar em Fontes de dados: IW28 com todos os tipos de nota desde 01/2025; IH08 completo (ABC,
    equip. superior, centro de custo); MB52 com valor e depósito; IW38 com prioridade; Sysmat atualizado; lançamentos do
    SIM de out/nov.
  - Cadastrar: aprovadores do Almoxarifado, mínimos de estoque, metas e orçamento.
  - Próxima fase (projeto com spec): menu de 29 → ~14 abas e ações de verdade (atribuir/concluir ações de AF e notas, cobrança).

## Depende do responsável (ver docs/liberacoes.md)

Passo a passo completo em [docs/liberacoes.md](liberacoes.md). Lista curta:

- **`CRON_SECRET`**: criado na Vercel em 20/11/2026 (rotinas agendadas passam a rodar). Falta: chaves `BUSCA_IMAGENS_*` para a
  busca nova de fotos/datasheets e `SMTP_*` para o aviso semanal sair (sem elas, a rotina de fotos só confere as já gravadas).
- **Chaves `BUSCA_IMAGENS_*`** (Brave, Serper, Firecrawl, SerpApi) e **`SMTP_*`** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USUARIO`,
  `SMTP_SENHA`, `EMAIL_REMETENTE`): não configuradas.
- **Apagar `SUPABASE_URL` e `SUPABASE_SECRET_KEY`** da Vercel: o Supabase foi abandonado; cadastros e auditoria ficam só no
  repositório de dados.
- **Trocar a senha do site antigo de HH.**

## Decisões padrão assumidas (podem mudar)

- Programação: todos os planos de GAL1; centro vazio = MEC; sábado 6,5 h/pessoa; moinho SF sem prensa vai para "Ativos sem
  HH"; IW32 só datas; feriados locais nos Parâmetros.

## Histórico de entregas (mais novo primeiro)

- **22/11/2026: aba UBM (armário kanban).** Retirada e solicitação pelo QR (celular, foto, ordem/código livres, "lançado na
  ordem pelo SAP Mobile"), saldo e lista de reposição, análise, cadastro de armários com kit (colar lista e Excel), etiquetas
  QR em A4, fluxograma "Como funciona"; login volta ao formulário do QR (`?volta=`). Kit real fica só no repositório de dados.

- **20/11/2026: Limpeza.** Supabase removido do site (cadastros e auditoria só no repositório de dados; auditoria em
  `app/auditoria/<mês>.json`, 12 meses); rotina manter-banco removida; backup do Supabase removido do repositório de dados;
  cópias diárias de `app/backup` com retenção de 60 dias (fica o dia 1 de cada mês); planos concluídos movidos para
  `docs/superpowers/arquivo/`; página `/semanal` virou redirecionamento.
- **19/11/2026:** aba Controle de HH (`agenda_hh`) publicada. Fotos: 50 buscados, 19 fotos novas; 473 de 604 baixadas no
  padrão; ~1.100 na fila.
- **18/11/2026:** fotos: 51 buscados, 27 fotos novas; 465 de 585 baixadas no padrão; 9 materiais ficaram para a próxima rodada.
- **17/11/2026:**
  - Pedido de acesso bloqueado para quem já tem usuário (Número Pessoal com ou sem zeros, ou mesmo nome) e para o
    segundo pedido enquanto o primeiro espera.
  - Next.js 16.4.2 → 16.4.6 (falha de segurança conhecida) e nodemailer 10.1.2 → 10.6.0 (npm audit sem alertas).
  - Aba Estoque passou a mostrar só material do Sysmat (1.166 itens de produção da MB52 saíram).
  - Foto "Ilustrativa" liberada (selo) para os itens do Sysmat sem fabricante/REF.
  - Fotos: 2º lote com 40 buscados e 19 fotos novas; rotina diária com 40 buscados, 16 fotos novas, 13 imagens diretas e
    454 de 560 fotos baixadas no padrão 1600×1600.
- **16/11/2026:**
  - Avaliação geral do site, PRs #206 e #207: tipos de ordem YM11–YM20 classificados; quebras pelas ordens YM11 quando a
    IW28 não traz Y1 (1 evento por equipamento/dia); "Dados até" e "Sem dados"; backlog sem "Encerrada sem confirmação";
    ABC pelas notas; Requisições só da manutenção; Estoque com zerados; aviso de colunas faltantes no envio; Qualidade dos
    dados no menu.
  - Fotos: busca só do almoxarifado (MB52 com fabricante e REF no Sysmat); 1º lote com 160 buscados e 47 fotos novas
    (648 no almoxarifado); rotina de download passou a gravar no padrão 1600×1600 e miniatura 400×400, com páginas mortas,
    sem foto ou de outro item fora do cadastro (voltam à busca).
- **Sem data registrada no arquivo:**
  - Programação de paradas, parte 1 (revisada pelo Opus) e parte 2 (revisada pelo Opus, impressão A4 conferida em PDF).
  - Aba Cadastro de material publicada (PR #201).
