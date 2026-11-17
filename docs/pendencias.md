# Pendências (atualizar ao fim de cada entrega)

Lido no início de toda retomada (regra "Retomada após limite" do CLAUDE.md). Sem dados da empresa.

## Em andamento
- **Programação de paradas (GAL1 Componentes)** — spec `docs/superpowers/specs/2026-11-10-programacao-paradas-design.md`,
  plano `docs/superpowers/plans/2026-11-10-programacao-paradas.md`.
  - Parte 1 (leitura, motor R1–R15, 11 conferências, aba com Programação, Verificação e "Fora das classes"): publicada,
    com a revisão do Opus aplicada.
  - Parte 2 (calendário do mês com impressão, Saldo HH, Campos por dia, Ativos sem HH, Excel) + motor ~10x mais rápido:
    revisada pelo Opus (sem bloqueantes; impressão A4 corrigida e conferida em PDF) e publicada.
  - Ajustes pendentes da parte 1: desempenho do motor (hoje ~5 s com os dados reais; meta < 500 ms antes da parte 3);
    (desempenho resolvido na parte 2) ocupação da semana anterior (prensa/Pellet/mesma máquina na semana que começou antes de hoje); confirmar com o
    planejador se EMPILHADEIRA, BANHEIRO, PINHEIRO e FORNO TÚNEL entram na programação de Componentes.
  - A IP19 nas bases do site é a antiga (out–dez): reenviar a IP19 atual (nov–jan) em Fontes de dados.
  - Partes 2 (calendário, Saldo HH, Campos por dia, Ativos sem HH), 3 (edição, Parâmetros, histórico) e 4 (IW38 backlog,
    IW32 CSV/VBS): a fazer, cada uma revisada pelo Opus e publicada.
- **Fotos e datasheets dos materiais (só almoxarifado desde 16/11):** 3.946 materiais no MB52; 601 com foto do fabricante
  (286 com a imagem já baixada, o resto com página a conferir) + fotos próprias; 1.725 com fabricante+REF ainda sem foto,
  1.476 na fila (os demais foram tentados há menos de 60 dias).
  16/11: tarefa agendada nesta sessão ("Busca diária de fotos do almoxarifado", 15h13 de Brasília) busca ~160/dia pelo
  Firecrawl até a fila zerar. 1º lote: 160 buscados, 47 fotos novas (648 no almoxarifado); ~1.313 na fila.
  Download e padrão (16/11): rotina do repositório de dados (03:47) grava tudo em JPEG 1600×1600 quadrado + mini 400×400;
  páginas mortas/sem foto/de outro item saíram (voltam à busca). Falta o segredo FIRECRAWL_API_KEY no repositório de dados
  para as lojas que bloqueiam o download. A rotina automática só roda com as chaves na Vercel (abaixo);
  sem elas, buscas manuais pelo Firecrawl quando houver crédito.
  17/11: 2º lote: 40 buscados, 19 fotos novas; Firecrawl sem crédito até 17/11 14h51 UTC (lotes alm_4, alm_6 a alm_11
  ficam para a próxima rodada). Aba Estoque passou a mostrar só material do Sysmat (1.166 itens de produção da MB52 saíram).
  Foto "Ilustrativa" liberada (selo) para os ~457 itens do Sysmat sem fabricante/REF: falta buscar essas fotos pela
  descrição (PDM + medidas) quando houver crédito, gravando `equivalente: true`.
  17/11: pedido de acesso bloqueado para quem já tem usuário (NP com/sem zeros ou mesmo nome) e para 2º pedido pendente.
  17/11: Next.js 16.4.2 → 16.4.6 (falha de segurança conhecida) e nodemailer 10.1.2 → 10.6.0 (npm audit sem alertas).

- **Aba "Cadastro de material"** — spec `docs/superpowers/specs/2026-11-10-cadastro-material-design.md`. Entregue (falta
  publicar): pedido com foto, sequência Almoxarifado → chegada do material (foto) → PCM e vínculo ao equipamento ao validar.
  Adiado para depois:
  - datalist com todas as tags dos equipamentos (carregar sob demanda);
  - mês UTC × São Paulo nos filtros e no resumo;
  - aviso por e-mail aos aprovadores (depende do SMTP na Vercel);
  - Usuários: marcar aprovador também ao criar usuário e ao aprovar pedido de acesso.

## Depende do usuário (Vercel → Settings) — passo a passo em docs/liberacoes.md
- **Deploy bloqueado (10/11, "Account is blocked")**: o merge do PR #196 não publicou; o site segue no ar com o #195.
  Conferir em vercel.com → conta → Usage/Billing o motivo (limite do plano gratuito) e liberar; depois redeploy do main.
- Chaves gratuitas: `BUSCA_IMAGENS_CHAVE_BRAVE`, `_SERPER`, `_FIRECRAWL`, `_SERPAPI` (Sensitive) e `CRON_SECRET`; Redeploy.
- SMTP para o aviso de treinamentos: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USUARIO`, `SMTP_SENHA`, `EMAIL_REMETENTE`.
- Domínios: ligar `estoquemanutencao.vercel.app` a Production (hoje redireciona para domínio sem DNS) e remover os `.com`.
- Fontes de dados → "Buscar agora" para baixar as fotos já gravadas.

## Decisões padrão assumidas (podem mudar)
- Programação: todos os planos de GAL1; centro vazio = MEC; sábado 6,5 h/pessoa; moinho SF sem prensa vai para "Ativos sem
  HH"; IW32 só datas; feriados locais nos Parâmetros.

## Avaliação geral do site (16/11/2026)
- Feito (PRs #206 e #207): tipos de ordem YM11–YM20 classificados; quebras pelas ordens YM11 quando a IW28 não traz Y1
  (1 evento por equipamento/dia); "Dados até" e "Sem dados"; backlog sem "Encerrada sem confirmação"; ABC pelas notas;
  Requisições só da manutenção; Estoque com zerados; aviso de colunas faltantes no envio; Qualidade dos dados no menu.
- Depende do usuário (reexportar do SAP e enviar em Fontes de dados): IW28 com todos os tipos de nota desde 01/2025;
  IH08 completo (ABC, equip. superior, centro de custo); MB52 com valor e depósito; IW38 com prioridade; Sysmat atualizado;
  lançamentos do SIM de out/nov. Cadastrar: aprovadores do Almoxarifado, mínimos de estoque, metas e orçamento.
- Validar com o PCM: Reincidência ≈ 59% e MTTR < 1 h com a regra YM11 (efeito dos dados: várias YM11 por evento e apontamentos curtos).
- Próxima fase (projeto com spec): menu de 29 → ~14 abas e ações de verdade (atribuir/concluir ações de AF e notas, cobrança).
