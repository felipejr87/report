-- =============================================
-- JARVIS R2 — Migration 012 · Módulo Financeiro
-- =============================================

create table categorias_fin (
  id          smallint primary key,
  espaco_id   uuid not null references espacos(id) on delete cascade,
  nome        text not null,
  teto_mensal numeric,
  icone       text
);

alter table categorias_fin enable row level security;

create policy "categorias_fin: lê do próprio espaço"
  on categorias_fin for select
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

insert into categorias_fin (id, espaco_id, nome, teto_mensal, icone) values
  (1,  'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Filha',         3000, '👧'),
  (2,  'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Moradia',       1000, '🏠'),
  (3,  'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Financiamento',  450, '🏦'),
  (4,  'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Mercado',        600, '🛒'),
  (5,  'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Transporte',     400, '🚗'),
  (6,  'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Saúde',          300, '❤️'),
  (7,  'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Lazer',          300, '🎮'),
  (8,  'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Projetos',      null, '🚀'),
  (9,  'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Receita',       null, '💚'),
  (10, 'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Outros',        null, '📦');

create table lancamentos (
  id           uuid primary key default gen_random_uuid(),
  espaco_id    uuid not null references espacos(id) on delete cascade,
  categoria_id smallint references categorias_fin(id),
  projeto_id   uuid references projetos(id),
  descricao    text not null,
  valor        numeric not null, -- negativo = gasto, positivo = receita
  data         date not null default current_date,
  recorrente   boolean default false,
  meio         text check (meio in ('cartao', 'pix', 'debito', 'dinheiro', 'ted')),
  criado_em    timestamptz default now()
);

alter table lancamentos enable row level security;

create policy "lancamentos: CRUD próprio espaço"
  on lancamentos for all
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid)
  with check (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create table dividas (
  id            uuid primary key default gen_random_uuid(),
  espaco_id     uuid not null references espacos(id) on delete cascade,
  nome          text not null,
  saldo_atual   numeric not null,
  taxa_mensal   numeric,
  parcela       numeric,
  meta_quitacao date,
  ativa         boolean default true,
  criado_em     timestamptz default now()
);

alter table dividas enable row level security;

create policy "dividas: CRUD próprio espaço"
  on dividas for all
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid)
  with check (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

insert into dividas (espaco_id, nome, saldo_atual, parcela, meta_quitacao) values
  ('f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Financiamento apartamento', 22000, 450, '2027-10-31');
