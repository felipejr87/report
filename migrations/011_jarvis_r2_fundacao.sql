-- =============================================
-- JARVIS R2 — Migration 011 · Fundação (flag + pilares + objetivos)
-- Numeração real do repo (a "Migration 004" do prompt assumia um
-- baseline diferente do que o repo já tem — a última era 010).
--
-- Decisão de escopo: projetos.pilar (text, livre) já existe desde a
-- migration 010 e continua em uso no FormProjeto/Projeto.jsx da R1.
-- Não removo nem migro esse campo aqui — pilar_id é aditivo, uma
-- estrutura nova em paralelo, usada só pelas telas novas do Jarvis
-- (/jarvis/pilares). Reconciliar os dois fica pra depois da R1/R2
-- rodarem, não nesta migration.
-- =============================================

-- 1. Flag Jarvis — só o espaço FE01 enxerga as rotas /jarvis/*
alter table espacos add column jarvis_enabled boolean not null default false;
update espacos set jarvis_enabled = true where codigo = 'FE01';

-- 2. Pilares — lista fixa (seed), um espaço pode ter os seus
create table pilares (
  id        smallint primary key,
  espaco_id uuid not null references espacos(id) on delete cascade,
  nome      text not null,
  cor       text not null,
  icone     text
);

alter table pilares enable row level security;

create policy "pilares: lê do próprio espaço"
  on pilares for select
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

insert into pilares (id, espaco_id, nome, cor, icone) values
  (1, 'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Filha & Família',         '#57B980', '👧'),
  (2, 'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Carreira (Claro/Vivo)',    '#5BA8C4', '💼'),
  (3, 'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Ecossistemas (AURA + SL)', '#8B7BD8', '🚀'),
  (4, 'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Financeiro',               '#E8A33D', '💰'),
  (5, 'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Corpo & Mente',            '#D96A5B', '💪'),
  (6, 'f5c91892-2b0e-48bc-be54-331ef22e96b5', 'Felpsz & Criativo',        '#E8A33D', '🎵');

-- 3. Objetivos
create table objetivos (
  id          uuid primary key default gen_random_uuid(),
  espaco_id   uuid not null references espacos(id) on delete cascade,
  pilar_id    smallint references pilares(id),
  descricao   text not null,
  metrica     text,
  valor_alvo  numeric,
  valor_atual numeric default 0,
  prazo       date,
  status      text not null default 'ativo' check (status in ('ativo', 'concluido', 'abandonado')),
  criado_em   timestamptz default now()
);

alter table objetivos enable row level security;

create policy "objetivos: select próprio espaço"
  on objetivos for select
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create policy "objetivos: insert no próprio espaço"
  on objetivos for insert
  with check (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create policy "objetivos: update no próprio espaço"
  on objetivos for update
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

create policy "objetivos: delete no próprio espaço"
  on objetivos for delete
  using (espaco_id = (auth.jwt() ->> 'espaco_id')::uuid);

insert into objetivos (espaco_id, pilar_id, descricao, metrica, prazo) values
  ('f5c91892-2b0e-48bc-be54-331ef22e96b5', 1, 'Rotina escolar estável', null, '2026-12-31'),
  ('f5c91892-2b0e-48bc-be54-331ef22e96b5', 1, '1 passeio especial por mês', '12 passeios em 2026', '2026-12-31'),
  ('f5c91892-2b0e-48bc-be54-331ef22e96b5', 2, 'Go-live Router Agent Claro', 'Produção em set/2026', '2026-09-15'),
  ('f5c91892-2b0e-48bc-be54-331ef22e96b5', 3, '1 produto com 1 cliente real pagante', '1 cliente pagante', '2026-12-31'),
  ('f5c91892-2b0e-48bc-be54-331ef22e96b5', 4, 'Reset financeiro outubro/2026', 'Zerar descompasso de caixa', '2026-10-31'),
  ('f5c91892-2b0e-48bc-be54-331ef22e96b5', 4, 'Quitar R$22k do financiamento', 'R$ 22.000', '2027-10-31'),
  ('f5c91892-2b0e-48bc-be54-331ef22e96b5', 5, 'Treino Full Body 3-4x/semana', '3-4 sessões/semana', '2026-12-31'),
  ('f5c91892-2b0e-48bc-be54-331ef22e96b5', 6, '1ª faixa Felpsz publicada', '1 release', '2026-12-31');

-- 4. Novos campos em projetos (aditivos — pilar texto livre continua existindo)
alter table projetos add column pilar_id smallint references pilares(id);
alter table projetos add column objetivo_id uuid references objetivos(id);
alter table projetos add column definition_of_shipped text;
alter table projetos add column wip_slot int not null default 1;
