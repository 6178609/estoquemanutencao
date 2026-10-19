-- Aquecimento do site a cada 5 minutos, chamado pelo próprio banco (o agendamento do GitHub Actions não é confiável).
-- A rota /api/aquecer é pública, não devolve dados e tem limite de chamadas; nenhuma chave aqui.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'aquecer-site';
select cron.schedule(
  'aquecer-site',
  '*/5 * * * *',
  $$select net.http_get(url := 'https://estoquemanutencao.vercel.app/api/aquecer', timeout_milliseconds := 120000)$$
);
