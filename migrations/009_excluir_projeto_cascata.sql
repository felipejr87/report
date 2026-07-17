-- =============================================
-- REPORT — Migration 009 · Excluir projeto apaga suas atividades junto
-- Antes, projeto_id usava ON DELETE SET NULL — apagar um projeto deixava
-- as atividades órfãs, sem tela nenhuma pra encontrá-las depois. Trocado
-- para CASCADE: excluir o projeto (épico) excluir tudo que está nele,
-- de forma explícita (a UI avisa quantas atividades serão apagadas antes
-- de confirmar).
-- =============================================

alter table atividades drop constraint demandas_projeto_id_fkey;
alter table atividades add constraint atividades_projeto_id_fkey
  foreign key (projeto_id) references projetos(id) on delete cascade;
