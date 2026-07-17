-- =============================================
-- REPORT — Migration 006 · Predecessora + preparação para timeline
-- Uma demanda pode ter no máximo uma predecessora direta (cadeia/árvore
-- de dependências, não um grafo completo).
-- =============================================

alter table demandas add column if not exists predecessora_id uuid references demandas(id) on delete set null;

alter table demandas add constraint demandas_predecessora_nao_e_ela_mesma
  check (predecessora_id is distinct from id);

create index if not exists idx_demandas_predecessora on demandas(predecessora_id);
