-- =============================================
-- JARVIS — Migration 021 · Anotações (texto livre → ata/to-dos/resumo)
-- =============================================

create table anotacoes (
  id            uuid primary key default gen_random_uuid(),
  espaco_id     uuid not null references espacos(id) on delete cascade,
  titulo        text,
  conteudo      text not null default '',
  tipo          text not null default 'livre' check (tipo in ('livre', 'ata', 'todos', 'resumo')),
  criado_em     timestamptz default now(),
  atualizado_em timestamptz default now()
);

alter table anotacoes enable row level security;

create policy "anotacoes: CRUD próprio espaço"
  on anotacoes for all
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid)
  with check (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);
