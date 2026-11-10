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
- **Fotos e datasheets dos materiais:** fila de ~48 mil materiais com fabricante+REF. Buscas manuais pelo Firecrawl e pela
  busca web quando houver crédito/limite; a rotina automática só roda com as chaves na Vercel (abaixo).

## Depende do usuário (Vercel → Settings)
- Chaves gratuitas: `BUSCA_IMAGENS_CHAVE_BRAVE`, `_SERPER`, `_FIRECRAWL`, `_SERPAPI` (Sensitive) e `CRON_SECRET`; Redeploy.
- SMTP para o aviso de treinamentos: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USUARIO`, `SMTP_SENHA`, `EMAIL_REMETENTE`.
- Domínios: ligar `estoquemanutencao.vercel.app` a Production (hoje redireciona para domínio sem DNS) e remover os `.com`.
- Fontes de dados → "Buscar agora" para baixar as fotos já gravadas.

## Decisões padrão assumidas (podem mudar)
- Programação: todos os planos de GAL1; centro vazio = MEC; sábado 6,5 h/pessoa; moinho SF sem prensa vai para "Ativos sem
  HH"; IW32 só datas; feriados locais nos Parâmetros.
