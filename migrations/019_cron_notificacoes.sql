-- Agenda a checagem de notificações do Jarvis (ponto_entrada/ponto_saida/
-- brief_horario, configurados em jarvis_notif_config) a cada minuto.
-- O secret usado no header x-cron-secret NUNCA aparece aqui — fica em
-- vault.secrets (nome 'jarvis_cron_secret', criado fora desta migration)
-- e é lido em tempo de execução pela subquery abaixo. O mesmo valor
-- precisa estar configurado como secret CRON_SECRET na Edge Function
-- enviar-notificacoes.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'jarvis-enviar-notificacoes',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://mptikytinugdkontrouk.supabase.co/functions/v1/enviar-notificacoes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'jarvis_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
