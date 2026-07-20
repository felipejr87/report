-- =============================================
-- JARVIS R2 — Migration 013 · Calendário & Hábitos
-- =============================================

create table eventos_cal (
  id           uuid primary key default gen_random_uuid(),
  espaco_id    uuid not null references espacos(id) on delete cascade,
  pilar_id     smallint references pilares(id),
  atividade_id uuid references atividades(id),
  titulo       text not null,
  inicio       timestamptz not null,
  fim          timestamptz,
  dia_todo     boolean default false,
  recorrencia  text, -- 'diario' | 'semanal' | 'mensal'
  lembrete_min int default 30,
  criado_em    timestamptz default now()
);

alter table eventos_cal enable row level security;

create policy "eventos_cal: CRUD próprio espaço"
  on eventos_cal for all
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid)
  with check (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create table habitos (
  id                 uuid primary key default gen_random_uuid(),
  espaco_id          uuid not null references espacos(id) on delete cascade,
  pilar_id           smallint references pilares(id),
  nome               text not null,
  frequencia_semanal int not null default 3,
  ativo              boolean default true,
  criado_em          timestamptz default now()
);

alter table habitos enable row level security;

create policy "habitos: CRUD próprio espaço"
  on habitos for all
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid)
  with check (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create table habito_checks (
  habito_id uuid not null references habitos(id) on delete cascade,
  data      date not null default current_date,
  primary key (habito_id, data)
);

alter table habito_checks enable row level security;

create policy "habito_checks: CRUD próprio espaço"
  on habito_checks for all
  using (habito_id in (select id from habitos where espaco_id = (auth.jwt() ->> 'espaco_id')::uuid))
  with check (habito_id in (select id from habitos where espaco_id = (auth.jwt() ->> 'espaco_id')::uuid));

insert into habitos (espaco_id, pilar_id, nome, frequencia_semanal) values
  ('f5c91892-2b0e-48bc-be54-331ef22e96b5', 5, 'Treino Full Body A/B', 4),
  ('f5c91892-2b0e-48bc-be54-331ef22e96b5', 5, 'Proteína ~140g', 7);
