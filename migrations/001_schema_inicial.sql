-- =============================================
-- REPORT — Migration 001 · Schema inicial
-- =============================================

-- ESPAÇOS: unidade de acesso. Código público + senha (hash).
create table espacos (
  id        uuid primary key default gen_random_uuid(),
  codigo    text unique not null,   -- ex: EQUIPE-X (uppercase, 4-20 chars)
  nome      text not null,
  senha_hash text not null,         -- bcrypt, NUNCA texto puro
  criado_em timestamptz default now()
);

-- DEMANDAS: entidade central.
create table demandas (
  id          uuid primary key default gen_random_uuid(),
  espaco_id   uuid not null references espacos(id) on delete cascade,
  nome        text not null,
  resumo      text not null,
  objetivo    text,
  okr         text,
  ganho       text,
  fase        text not null default 'discovery'
    check (fase in ('discovery','refinamento','downstream','entregue')),
  proximo_passo text,
  responsavel   text,
  estimativa    int,
  atualizado_em timestamptz default now(),
  criado_em     timestamptz default now()
);

-- HISTÓRICO: cada mudança vira log.
create table movimentos (
  id         uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references demandas(id) on delete cascade,
  tipo       text not null,  -- 'criacao' | 'fase' | 'edicao' | 'estimativa'
  detalhe    jsonb,
  criado_em  timestamptz default now()
);

-- POKER: sessões de estimativa (S2 — criar tabelas agora, não implementar lógica)
create table poker_sessoes (
  id         uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references demandas(id) on delete cascade,
  status     text not null default 'aberta'
    check (status in ('aberta','revelada','fechada')),
  criado_em  timestamptz default now()
);

create table poker_votos (
  id         uuid primary key default gen_random_uuid(),
  sessao_id  uuid not null references poker_sessoes(id) on delete cascade,
  apelido    text not null,
  voto       text not null,  -- '1','2','3','5','8','13','21','?'
  criado_em  timestamptz default now(),
  unique (sessao_id, apelido)
);

-- Índices de apoio às políticas de RLS e consultas mais comuns
create index idx_demandas_espaco_id on demandas(espaco_id);
create index idx_demandas_fase on demandas(espaco_id, fase);
create index idx_movimentos_demanda_id on movimentos(demanda_id);
create index idx_poker_sessoes_demanda_id on poker_sessoes(demanda_id);
create index idx_poker_votos_sessao_id on poker_votos(sessao_id);

-- =============================================
-- RLS: habilitar em todas as tabelas
-- Negar tudo por padrão — políticas adicionadas abaixo
-- =============================================

alter table espacos      enable row level security;
alter table demandas     enable row level security;
alter table movimentos   enable row level security;
alter table poker_sessoes enable row level security;
alter table poker_votos  enable row level security;

-- Políticas: filtram por espaco_id do JWT customizado
-- O claim 'espaco_id' é injetado pela Edge Function entrar-espaco

-- espacos: usuário vê apenas o próprio espaço
create policy "espacos: lê o próprio"
  on espacos for select
  using (id = (auth.jwt() ->> 'espaco_id')::uuid);

-- demandas: CRUD apenas no próprio espaço
create policy "demandas: select próprio espaço"
  on demandas for select
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create policy "demandas: insert no próprio espaço"
  on demandas for insert
  with check (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create policy "demandas: update no próprio espaço"
  on demandas for update
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create policy "demandas: delete no próprio espaço"
  on demandas for delete
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

-- movimentos: seguem o espaço da demanda
create policy "movimentos: select via demanda"
  on movimentos for select
  using (
    demanda_id in (
      select id from demandas
      where espaco_id = (auth.jwt() ->> 'espaco_id')::uuid
    )
  );

create policy "movimentos: insert via demanda"
  on movimentos for insert
  with check (
    demanda_id in (
      select id from demandas
      where espaco_id = (auth.jwt() ->> 'espaco_id')::uuid
    )
  );

-- poker: mesma lógica
create policy "poker_sessoes: select via demanda"
  on poker_sessoes for select
  using (
    demanda_id in (
      select id from demandas
      where espaco_id = (auth.jwt() ->> 'espaco_id')::uuid
    )
  );

create policy "poker_votos: select via sessão"
  on poker_votos for select
  using (
    sessao_id in (
      select ps.id from poker_sessoes ps
      join demandas d on d.id = ps.demanda_id
      where d.espaco_id = (auth.jwt() ->> 'espaco_id')::uuid
    )
  );
