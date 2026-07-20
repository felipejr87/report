-- =============================================
-- JARVIS R1 — Migration 010 · Fase do épico + timeline no nível de projeto
-- Numeração real do repo (a numbering do prompt original, "003", está
-- desatualizada — o repo já estava na 009).
--
-- Decisões de escopo (evitar duas fontes de verdade pro mesmo conceito):
-- - NÃO adiciona atividades.concluida/concluida_em: já existe
--   atividades.fase = 'entregue' pra isso.
-- - NÃO adiciona atividades.deadline: já existe atividades.data_fim.
-- =============================================

-- 1. Fase do épico (projeto) — separada da fase da atividade (discovery/
--    refinamento/downstream/entregue), que já existe e não muda.
alter table projetos add column fase text
  not null default 'discovery'
  check (fase in ('discovery', 'construcao', 'lancamento', 'operacao', 'pausado', 'encerrado'));

alter table projetos add column resumo text;
alter table projetos add column data_lancamento date;
alter table projetos add column pilar text;

-- atualizado_em em projetos — não existia (só em atividades); necessário
-- pro trigger da seção 4 e pra sinalizar tração também no nível de épico.
alter table projetos add column atualizado_em timestamptz default now();

-- 2. Campo de notas livres na atividade (bloco "notas" do detalhe, além do
--    resumo/objetivo estruturados).
alter table atividades add column notas text;

-- 3. Timeline de ações no nível de projeto (épico) — hoje movimentos só
--    aceita atividade_id (not null). Passa a aceitar projeto_id também,
--    exigindo que pelo menos um dos dois esteja preenchido.
alter table movimentos alter column atividade_id drop not null;
alter table movimentos add column projeto_id uuid references projetos(id) on delete cascade;

alter table movimentos add constraint movimentos_atividade_ou_projeto
  check (atividade_id is not null or projeto_id is not null);

create policy "movimentos: select via projeto"
  on movimentos for select
  using (
    projeto_id in (
      select id from projetos
      where espaco_id = (auth.jwt() ->> 'espaco_id')::uuid
    )
  );

create policy "movimentos: insert via projeto"
  on movimentos for insert
  with check (
    projeto_id in (
      select id from projetos
      where espaco_id = (auth.jwt() ->> 'espaco_id')::uuid
    )
  );

create policy "movimentos: update via projeto"
  on movimentos for update
  using (
    projeto_id in (
      select id from projetos
      where espaco_id = (auth.jwt() ->> 'espaco_id')::uuid
    )
  );

-- 4. Novo tipo de movimento: conclusão (fechamento explícito de atividade
--    ou de épico, distinto de uma simples troca de fase).
alter table movimentos drop constraint if exists movimentos_tipo_check;
alter table movimentos add constraint movimentos_tipo_check
  check (tipo in ('criacao', 'fase', 'edicao', 'estimativa', 'acao_planejada', 'acao_concluida', 'conclusao'));

-- 5. Índices de leitura rápida de pendências, separados por atividade e
--    por projeto (substituem o antigo idx_movimentos_pendente, que só
--    cobria o caso de atividade).
drop index if exists idx_movimentos_pendente;

create index idx_movimentos_pendente_atividade
  on movimentos(atividade_id, status, ordem)
  where tipo = 'acao_planejada' and status = 'pendente' and atividade_id is not null;

create index idx_movimentos_pendente_projeto
  on movimentos(projeto_id, status, ordem)
  where tipo = 'acao_planejada' and status = 'pendente' and projeto_id is not null;

-- 6. Trigger: qualquer movimento novo — ou reaberto/concluído via update,
--    caso do "concluir ação" que faz update na linha existente — marca a
--    atividade/projeto dono como atualizado agora. Hoje isso já é feito
--    manualmente em lib/timeline.js; o trigger garante o mesmo em qualquer
--    caminho futuro que insira/atualize movimentos direto.
create or replace function tg_atualizar_atividade_em_movimento() returns trigger as $$
begin
  if new.atividade_id is not null then
    update atividades set atualizado_em = now() where id = new.atividade_id;
  end if;
  if new.projeto_id is not null then
    update projetos set atualizado_em = now() where id = new.projeto_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger tg_atualizar_atividade_em_movimento
  after insert or update on movimentos
  for each row execute function tg_atualizar_atividade_em_movimento();
