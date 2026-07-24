-- RPC incrementar_rate_limit — chamada pelas Edge Functions (via service
-- role, dentro de supabase/functions/_shared/rate-limit.ts) pra contar
-- chamadas por espaço+ip_hash+endpoint numa janela fixa de 1 minuto.
--
-- Corrige um bug do design original: computar janela_fim como
-- now() + interval '1 minute' a cada chamada gera um timestamp
-- ligeiramente diferente por chamada (diferença de milissegundos), e
-- como janela_fim faz parte da chave do ON CONFLICT
-- (idx_rate_limit_janela, já existente), isso faria o ON CONFLICT quase
-- nunca bater — cada chamada criaria uma linha nova em vez de
-- incrementar a existente, e o rate limit nunca bloquearia nada de
-- verdade. Fix: janela_fim é o próximo minuto "redondo" do relógio
-- (date_trunc('minute', now()) + 1 minute), igual pra toda chamada
-- dentro do mesmo minuto real.
create or replace function incrementar_rate_limit(
  p_espaco_id uuid,
  p_ip_hash   text,
  p_endpoint  text,
  p_limite    int
)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_chamadas int;
  v_bloqueado boolean;
  v_janela_ini timestamptz := date_trunc('minute', now());
  v_janela_fim timestamptz := date_trunc('minute', now()) + interval '1 minute';
begin
  delete from jarvis_rate_limit where janela_fim < now();

  insert into jarvis_rate_limit (espaco_id, ip_hash, endpoint, chamadas, janela_ini, janela_fim)
  values (p_espaco_id, p_ip_hash, p_endpoint, 1, v_janela_ini, v_janela_fim)
  on conflict (espaco_id, ip_hash, endpoint, janela_fim)
  do update set chamadas = jarvis_rate_limit.chamadas + 1
  returning chamadas into v_chamadas;

  v_bloqueado := v_chamadas > p_limite;

  return jsonb_build_object('chamadas', v_chamadas, 'bloqueado', v_bloqueado);
end;
$function$;
