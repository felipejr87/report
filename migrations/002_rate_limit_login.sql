-- =============================================
-- REPORT — Migration 002 · Rate limit persistente para login
-- O Map em memória na Edge Function não sobrevive entre invocações
-- (cada request pode cair em um isolate novo no Deno Deploy/Supabase
-- Edge Runtime), então o rate limit de entrar-espaco precisa de estado
-- compartilhado no banco.
-- =============================================

create table login_rate_limit (
  ip        text primary key,
  contagem  int not null default 0,
  reset_em  timestamptz not null
);

alter table login_rate_limit enable row level security;
-- Nenhuma policy: só acessível via service role (usado pela Edge Function).
