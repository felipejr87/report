-- =============================================
-- REPORT — Migration 003 · Campos de planejamento
-- Link de referência ao Jira e datas de início/fim, usados para
-- importar dados de acompanhamento reais (planilha paralela).
-- =============================================

alter table demandas add column link_jira text;
alter table demandas add column data_inicio date;
alter table demandas add column data_fim date;
