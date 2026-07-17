-- =============================================
-- REPORT — Migration 007 · Projeto como entidade própria
-- "projeto" deixa de ser um texto solto em cada demanda e vira uma
-- tabela, com data de entrega e sinalizador "quente" (observado pela
-- gerência) — necessário pro dashboard de projetos.
-- =============================================

create table projetos (
  id         uuid primary key default gen_random_uuid(),
  espaco_id  uuid not null references espacos(id) on delete cascade,
  nome       text not null,
  data_entrega date,
  quente     boolean not null default false,
  criado_em  timestamptz default now(),
  unique (espaco_id, nome)
);

alter table projetos enable row level security;

create policy "projetos: select próprio espaço"
  on projetos for select
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create policy "projetos: insert no próprio espaço"
  on projetos for insert
  with check (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create policy "projetos: update no próprio espaço"
  on projetos for update
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create policy "projetos: delete no próprio espaço"
  on projetos for delete
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

-- Migra os valores de texto existentes em demandas.projeto para a tabela nova
insert into projetos (espaco_id, nome)
select distinct espaco_id, projeto
from demandas
where projeto is not null and btrim(projeto) <> '';

-- Nova coluna em demandas apontando pro projeto
alter table demandas add column if not exists projeto_id uuid references projetos(id) on delete set null;

update demandas d
set projeto_id = p.id
from projetos p
where p.espaco_id = d.espaco_id and p.nome = d.projeto;

create index if not exists idx_demandas_projeto_id on demandas(projeto_id);

-- Remove a coluna antiga de texto — substituída por projeto_id
alter table demandas drop column if exists projeto;
