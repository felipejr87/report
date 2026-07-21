-- =============================================
-- JARVIS — Migration 018 · Infra de notificações (push + config)
-- Nota: conversa_mensagens já existe (criada há algumas rodadas,
-- 48 mensagens reais nela) — não recriar. jarvis_skills não entrou
-- aqui: nada em Parte 1-4 descreve o que ela armazena de fato ou
-- quem consome, então fica pra quando isso estiver especificado.
-- =============================================

create table jarvis_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  espaco_id  uuid not null references espacos(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  criado_em  timestamptz default now()
);

create table jarvis_notif_config (
  espaco_id     uuid primary key references espacos(id) on delete cascade,
  ponto_entrada text default '08:55',
  ponto_saida   text default '18:15',
  brief_horario text default '09:10',
  timezone      text default 'America/Sao_Paulo',
  dias_uteis    int[] default '{1,2,3,4,5}',
  ativo         boolean default true,
  criado_em     timestamptz default now()
);

create table jarvis_notif_log (
  id         uuid primary key default gen_random_uuid(),
  espaco_id  uuid references espacos(id),
  tipo       text not null,
  enviado_em timestamptz default now(),
  data_ref   date default current_date
);
create unique index idx_notif_dia on jarvis_notif_log(espaco_id, tipo, data_ref);

alter table jarvis_push_subscriptions enable row level security;
alter table jarvis_notif_config enable row level security;
alter table jarvis_notif_log enable row level security;

create policy "push_subs: próprio espaço" on jarvis_push_subscriptions
  for all using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid)
  with check (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create policy "notif_config: próprio espaço" on jarvis_notif_config
  for all using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid)
  with check (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create policy "notif_log: próprio espaço" on jarvis_notif_log
  for select using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

insert into jarvis_notif_config (espaco_id, ponto_entrada, ponto_saida, brief_horario)
values ('f5c91892-2b0e-48bc-be54-331ef22e96b5', '08:55', '18:15', '09:10')
on conflict do nothing;
