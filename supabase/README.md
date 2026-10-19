# Banco (Supabase)

`migrations/` é a cópia, no repositório, das migrações aplicadas no projeto do Supabase (só a estrutura, nenhum dado).
Toda mudança no banco continua sendo feita por migração (conector Supabase `apply_migration`); depois de aplicar, salve
aqui o mesmo SQL com o mesmo número de versão. O teste de restauração do backup (repositório de dados) monta um Postgres
vazio a partir destes arquivos.
