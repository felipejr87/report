-- =============================================
-- REPORT — Migration 005 · Timeline de ações
-- Substitui o campo estático demandas.proximo_passo por uma timeline de
-- ações planejadas/concluídas em movimentos.
-- =============================================

-- 1. Expandir movimentos para suportar ações planejadas e concluídas
alter table movimentos add column if not exists status text
  default 'concluido'
  check (status in ('pendente', 'concluido'));

alter table movimentos add column if not exists ordem int default 0;

alter table movimentos add column if not exists concluido_em timestamptz;

alter table movimentos drop constraint if exists movimentos_tipo_check;
alter table movimentos add constraint movimentos_tipo_check
  check (tipo in ('criacao', 'fase', 'edicao', 'estimativa', 'acao_planejada', 'acao_concluida'));

create index if not exists idx_movimentos_pendente
  on movimentos(demanda_id, status, ordem)
  where tipo = 'acao_planejada' and status = 'pendente';

-- 2. Policy de UPDATE em movimentos (faltava — só havia select/insert;
--    concluir uma ação exige dar update numa linha existente)
create policy "movimentos: update via demanda"
  on movimentos for update
  using (
    demanda_id in (
      select id from demandas
      where espaco_id = (auth.jwt() ->> 'espaco_id')::uuid
    )
  );

-- 3. Preservar o conteúdo de demandas.proximo_passo como ação planejada
--    (ou concluída, se proximo_passo_feito já estava marcado) antes de
--    remover a coluna — sem isso os dados reais das demandas existentes
--    seriam perdidos.
insert into movimentos (demanda_id, tipo, status, ordem, detalhe, concluido_em, criado_em)
select
  id,
  case when proximo_passo_feito then 'acao_concluida' else 'acao_planejada' end,
  case when proximo_passo_feito then 'concluido' else 'pendente' end,
  0,
  jsonb_build_object('texto', proximo_passo, 'origem', 'migração proximo_passo'),
  case when proximo_passo_feito then atualizado_em else null end,
  criado_em
from demandas
where proximo_passo is not null and btrim(proximo_passo) <> '';

-- 4. Remover os campos antigos de demandas (substituídos pela timeline)
alter table demandas drop column if exists proximo_passo;
alter table demandas drop column if exists proximo_passo_feito;

-- 5. projeto já existe (migration 004) — mantido por segurança/idempotência
alter table demandas add column if not exists projeto text;
