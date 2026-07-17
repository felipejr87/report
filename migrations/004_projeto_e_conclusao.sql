-- =============================================
-- REPORT — Migration 004 · Projeto/Tema + conclusão do próximo passo
-- =============================================

alter table demandas add column projeto text;
alter table demandas add column proximo_passo_feito boolean not null default false;

create index idx_demandas_projeto on demandas(espaco_id, projeto);
