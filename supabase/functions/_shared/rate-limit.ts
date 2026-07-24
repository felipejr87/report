// Módulo compartilhado — importado via caminho relativo pelas Edge
// Functions do Jarvis. Cada function que usa isso precisa incluir
// este arquivo no próprio deploy (Supabase empacota por function, não
// existe filesystem compartilhado entre deploys).

// Limites por endpoint (chamadas por minuto)
const LIMITES: Record<string, number> = {
  assistente: 20, // 20 mensagens/min — mais que suficiente para uso real
  tts: 30, // 30 chamadas TTS/min
  briefing: 10, // 10 briefings/min
}

// Hash simples do IP (não armazena IP real — privacidade)
async function hashIP(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + 'jarvis-salt-2026')
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function checarRateLimit(
  req: Request,
  espacoId: string,
  endpoint: string,
  // deno-lint-ignore no-explicit-any
  supabase: any
): Promise<{ bloqueado: boolean; restante: number }> {
  const limite = LIMITES[endpoint] || 10
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const ipHash = await hashIP(ip)

  try {
    const { data, error } = await supabase.rpc('incrementar_rate_limit', {
      p_espaco_id: espacoId,
      p_ip_hash: ipHash,
      p_endpoint: endpoint,
      p_limite: limite,
    })

    if (error) throw error

    return {
      bloqueado: data.bloqueado,
      restante: Math.max(0, limite - data.chamadas),
    }
  } catch (e) {
    // Em caso de erro no rate limit, deixar passar (fail open) — um
    // bug no rate limiter não pode derrubar a função principal.
    console.warn('[rate-limit] erro, fail open:', e)
    return { bloqueado: false, restante: limite }
  }
}

export async function registrarAcesso(
  espacoId: string,
  endpoint: string,
  req: Request,
  status: number,
  // deno-lint-ignore no-explicit-any
  supabase: any
) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const ipHash = await hashIP(ip)
    const userAgent = req.headers.get('user-agent')?.slice(0, 200) || null

    await supabase.from('jarvis_access_log').insert({
      espaco_id: espacoId,
      endpoint,
      ip_hash: ipHash,
      user_agent: userAgent,
      status,
    })
  } catch (e) {
    // Log nunca deve quebrar a resposta principal
    console.warn('[access-log] erro:', e)
  }
}
