# Pendências (atualizar ao fim de cada entrega)

Lido no início de toda retomada (regra "Retomada após limite" do CLAUDE.md). Sem dados da empresa.

## Em andamento
- **Programação de paradas (GAL1 Componentes)** — spec `docs/superpowers/specs/2026-11-10-programacao-paradas-design.md`,
  plano `docs/superpowers/plans/2026-11-10-programacao-paradas.md`.
  - Parte 1 (Tasks 1–17: leitura, motor de regras, conferências, aba com Programação e Verificação): em implementação.
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
