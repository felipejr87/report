-- =============================================
-- JARVIS — Migration 016 · Histórico de conversas (documentação)
-- Já aplicada diretamente no banco (nome real na Supabase:
-- "jarvis_conversas_e_tools", não "010" como o prompt original
-- afirmava — a numeração "010" já pertence à migration da fase do
-- épico, aplicada mais cedo hoje). Este arquivo só documenta o que
-- já existe em produção; não precisa (e não deve) ser reexecutado.
-- =============================================

create table conversas (
  id            uuid primary key default gen_random_uuid(),
  espaco_id     uuid not null references espacos(id) on delete cascade,
  titulo        text,
  criado_em     timestamptz default now(),
  atualizado_em timestamptz default now()
);

alter table conversas enable row level security;

create policy "conversas: CRUD próprio espaço"
  on conversas for all
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid)
  with check (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create table conversa_mensagens (
  id            uuid primary key default gen_random_uuid(),
  conversa_id   uuid not null references conversas(id) on delete cascade,
  role          text not null check (role in ('user', 'assistant', 'tool_result')),
  content       text not null,
  tool_calls    jsonb,
  tool_results  jsonb,
  criado_em     timestamptz default now()
);

alter table conversa_mensagens enable row level security;

create policy "conversa_mensagens: CRUD via conversa do próprio espaço"
  on conversa_mensagens for all
  using (conversa_id in (select id from conversas where espaco_id = (auth.jwt() ->> 'espaco_id')::uuid))
  with check (conversa_id in (select id from conversas where espaco_id = (auth.jwt() ->> 'espaco_id')::uuid));
