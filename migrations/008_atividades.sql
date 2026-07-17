-- =============================================
-- REPORT — Migration 008 · Demanda vira Atividade; OKR/Ganho sobem pro Épico
-- Hierarquia: Espaço → Projeto (épico) → Atividade (história/tarefa).
-- =============================================

-- 1. Campos de épico em projetos
alter table projetos add column objetivo text;
alter table projetos add column okr text;
alter table projetos add column ganho text;

-- 2. Migra okr/ganho existentes (nível atividade) pro projeto — melhor valor
--    disponível por projeto, já que agora é um campo único por épico.
update projetos p set okr = sub.okr
from (
  select distinct on (projeto_id) projeto_id, okr
  from demandas
  where projeto_id is not null and okr is not null and btrim(okr) <> ''
  order by projeto_id, criado_em
) sub
where sub.projeto_id = p.id;

update projetos p set ganho = sub.ganho
from (
  select distinct on (projeto_id) projeto_id, ganho
  from demandas
  where projeto_id is not null and ganho is not null and btrim(ganho) <> ''
  order by projeto_id, criado_em
) sub
where sub.projeto_id = p.id;

-- 3. Remove okr/ganho de demandas — agora só existem no projeto/épico
alter table demandas drop column okr;
alter table demandas drop column ganho;

-- 4. Renomeia demanda → atividade
alter table demandas rename to atividades;
alter table movimentos rename column demanda_id to atividade_id;
alter table poker_sessoes rename column demanda_id to atividade_id;
