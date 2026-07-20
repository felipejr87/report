-- =============================================
-- JARVIS — Migration 015 · Perfil pessoal (pro assistente de decisões)
-- =============================================

create table jarvis_perfil (
  espaco_id     uuid primary key references espacos(id) on delete cascade,
  peso          numeric, -- kg
  altura        numeric, -- cm
  preferencias  jsonb,
  atualizado_em timestamptz default now()
);

alter table jarvis_perfil enable row level security;

create policy "jarvis_perfil: CRUD próprio espaço"
  on jarvis_perfil for all
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid)
  with check (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);
