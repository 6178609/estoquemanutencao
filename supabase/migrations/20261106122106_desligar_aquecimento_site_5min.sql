-- Desliga o aquecimento do site de 5 em 5 minutos (job "aquecer-site"): com o plano gratuito da Vercel (Hobby) ele pesa
-- no limite de uso (a Vercel passou a responder 402). O aquecimento depois de cada deploy (workflow do GitHub) continua.
-- Para religar: select cron.schedule('aquecer-site', '*/5 * * * *', $$select net.http_get(url := 'https://estoquemanutencao.vercel.app/api/aquecer', timeout_milliseconds := 120000)$$);
do $$
begin
  if exists (select 1 from cron.job where jobname = 'aquecer-site') then
    perform cron.unschedule('aquecer-site');
  end if;
end $$;
