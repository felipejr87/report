-- =============================================
-- JARVIS — Migration 014 · Busca universal (full-text search)
-- Numeração real do repo (a "Migration 008" do prompt assumia um
-- baseline diferente — a última migration real é a 013).
--
-- Fix aplicado: o prompt filtra atividades por "concluida = false",
-- coluna que não existe (decisão da R1: usar fase = 'entregue' como
-- sinal de conclusão). Troquei para "fase <> 'entregue'".
-- =============================================

create index idx_fts_projetos
  on projetos using gin(to_tsvector('portuguese', nome || ' ' || coalesce(resumo, '') || ' ' || coalesce(objetivo, '')));

create index idx_fts_atividades
  on atividades using gin(to_tsvector('portuguese', nome || ' ' || coalesce(resumo, '') || ' ' || coalesce(notas, '')));

create index idx_fts_objetivos
  on objetivos using gin(to_tsvector('portuguese', descricao || ' ' || coalesce(metrica, '')));

create index idx_fts_dividas
  on dividas using gin(to_tsvector('portuguese', nome));

create index idx_fts_movimentos
  on movimentos using gin(to_tsvector('portuguese', coalesce(detalhe ->> 'texto', '')));

create or replace function buscar_espaco(p_espaco_id uuid, p_query text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $function$
declare
  v_ts    tsquery := plainto_tsquery('portuguese', p_query);
  v_ilike text    := '%' || p_query || '%';
  v_result jsonb;
begin
  if p_espaco_id != (auth.jwt() ->> 'espaco_id')::uuid then
    return jsonb_build_object('ok', false, 'erro', 'Não autorizado');
  end if;

  select jsonb_build_object(
    'ok', true,
    'query', p_query,

    'projetos', (
      select jsonb_agg(jsonb_build_object(
        'tipo', 'projeto', 'id', id, 'nome', nome,
        'fase', fase, 'resumo', resumo, 'objetivo', objetivo
      ) order by ts_rank(to_tsvector('portuguese', nome || ' ' || coalesce(resumo, '') || ' ' || coalesce(objetivo, '')), v_ts) desc)
      from projetos
      where espaco_id = p_espaco_id
        and (
          to_tsvector('portuguese', nome || ' ' || coalesce(resumo, '') || ' ' || coalesce(objetivo, '')) @@ v_ts
          or nome ilike v_ilike or resumo ilike v_ilike or objetivo ilike v_ilike
        )
      limit 5
    ),

    'atividades', (
      select jsonb_agg(jsonb_build_object(
        'tipo', 'atividade', 'id', id, 'nome', nome,
        'fase', fase, 'resumo', resumo, 'projeto_id', projeto_id
      ) order by ts_rank(to_tsvector('portuguese', nome || ' ' || coalesce(resumo, '') || ' ' || coalesce(notas, '')), v_ts) desc)
      from atividades
      where espaco_id = p_espaco_id and fase <> 'entregue'
        and (
          to_tsvector('portuguese', nome || ' ' || coalesce(resumo, '') || ' ' || coalesce(notas, '')) @@ v_ts
          or nome ilike v_ilike or resumo ilike v_ilike
        )
      limit 5
    ),

    'objetivos', (
      select jsonb_agg(jsonb_build_object(
        'tipo', 'objetivo', 'id', id,
        'descricao', descricao, 'pilar_id', pilar_id,
        'prazo', prazo, 'status', status
      ))
      from objetivos
      where espaco_id = p_espaco_id
        and (
          to_tsvector('portuguese', descricao || ' ' || coalesce(metrica, '')) @@ v_ts
          or descricao ilike v_ilike
        )
      limit 3
    ),

    'dividas', (
      select jsonb_agg(jsonb_build_object(
        'tipo', 'divida', 'id', id,
        'nome', nome, 'saldo_atual', saldo_atual,
        'parcela', parcela, 'meta_quitacao', meta_quitacao
      ))
      from dividas
      where espaco_id = p_espaco_id and ativa = true
        and (to_tsvector('portuguese', nome) @@ v_ts or nome ilike v_ilike)
      limit 3
    ),

    'lancamentos', (
      select jsonb_agg(jsonb_build_object(
        'tipo', 'lancamento', 'id', id,
        'descricao', descricao, 'valor', valor,
        'data', data, 'categoria_id', categoria_id
      ) order by data desc)
      from lancamentos
      where espaco_id = p_espaco_id
        and descricao ilike v_ilike
      limit 5
    ),

    'movimentos', (
      select jsonb_agg(jsonb_build_object(
        'tipo', 'movimento', 'id', id,
        'texto', detalhe ->> 'texto',
        'status', status, 'atividade_id', atividade_id,
        'criado_em', criado_em
      ) order by criado_em desc)
      from movimentos
      where (detalhe ->> 'texto') ilike v_ilike
        and atividade_id in (select id from atividades where espaco_id = p_espaco_id)
      limit 5
    )
  ) into v_result;

  return v_result;
end;
$function$;
