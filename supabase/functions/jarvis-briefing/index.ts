import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

// Coordenadas de Santo André, SP
const SANTO_ANDRE = { lat: -23.6737, lon: -46.5264 }

function espacoIdDoToken(req: Request): string | null {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    return JSON.parse(atob(partes[1])).espaco_id || null
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const espacoId = espacoIdDoToken(req)
    if (!espacoId) return new Response(JSON.stringify({ ok: false, erro: 'Sessão inválida.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const hoje = new Date()
    const hojeStr = hoje.toISOString().split('T')[0]
    const amanha = new Date(hoje.getTime() + 86400000).toISOString().split('T')[0]
    const hora = hoje.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
    const diaSemana = hoje.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' })

    // 1. Previsão do tempo — falha silenciosa, briefing continua sem ela
    let tempo = null
    try {
      const resClima = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${SANTO_ANDRE.lat}&longitude=${SANTO_ANDRE.lon}` +
        `&current=temperature_2m,weathercode,precipitation,windspeed_10m` +
        `&hourly=precipitation_probability&timezone=America%2FSao_Paulo&forecast_days=1`
      )
      const clima = await resClima.json()
      const temp = Math.round(clima.current.temperature_2m)
      const probChuva = Math.max(...(clima.hourly?.precipitation_probability?.slice(0, 12) || [0]))
      const codigo = clima.current.weathercode
      const descricoes: Record<number, string> = {
        0: 'céu limpo', 1: 'poucas nuvens', 2: 'parcialmente nublado',
        3: 'nublado', 45: 'neblina', 51: 'garoa leve', 61: 'chuva leve',
        63: 'chuva moderada', 65: 'chuva intensa', 80: 'pancadas de chuva',
        95: 'tempestade',
      }
      tempo = { temp, descricao: descricoes[codigo] || 'tempo variável', probChuva, chuva: clima.current.precipitation > 0 }
    } catch {
      tempo = null
    }

    // 2. Eventos de hoje
    const { data: eventosHoje } = await supabase
      .from('eventos_cal')
      .select('titulo, inicio, fim')
      .eq('espaco_id', espacoId)
      .gte('inicio', hojeStr + 'T00:00:00')
      .lte('inicio', hojeStr + 'T23:59:59')
      .order('inicio')

    // 3. Atividades urgentes — atividades não têm `deadline`/`concluida`;
    //    decisão da R1: conclusão = fase='entregue', prazo = data_fim.
    const { data: urgentes } = await supabase
      .from('atividades')
      .select('id, nome, data_fim, projeto_id')
      .eq('espaco_id', espacoId)
      .neq('fase', 'entregue')
      .not('data_fim', 'is', null)
      .lte('data_fim', amanha)
      .order('data_fim')
      .limit(3)

    // 4. Paradas há mais de 5 dias
    const { data: paradas } = await supabase
      .from('atividades')
      .select('nome, atualizado_em')
      .eq('espaco_id', espacoId)
      .neq('fase', 'entregue')
      .lt('atualizado_em', new Date(Date.now() - 5 * 86400000).toISOString())
      .order('atualizado_em')
      .limit(2)

    // 5. Hábitos — status da semana
    const { data: habitos } = await supabase
      .from('habitos').select('id, nome, frequencia_semanal').eq('espaco_id', espacoId).eq('ativo', true)

    const inicioSemana = new Date()
    inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay())
    const { data: checks } = await supabase
      .from('habito_checks').select('habito_id, data').gte('data', inicioSemana.toISOString().split('T')[0])

    const checksPorHabito: Record<string, number> = {}
    checks?.forEach((c) => { checksPorHabito[c.habito_id] = (checksPorHabito[c.habito_id] || 0) + 1 })
    const habitosPendentes = habitos?.filter((h) => (checksPorHabito[h.id] || 0) < h.frequencia_semanal) || []

    const saudacao = (() => {
      const h = hoje.getHours()
      if (h < 12) return 'Bom dia'
      if (h < 18) return 'Boa tarde'
      return 'Boa noite'
    })()

    return new Response(JSON.stringify({
      ok: true,
      saudacao,
      hora,
      diaSemana,
      tempo,
      eventosHoje: eventosHoje || [],
      urgentes: urgentes || [],
      paradas: paradas || [],
      habitosPendentes,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('[jarvis-briefing]', e)
    return new Response(JSON.stringify({ ok: false, erro: e instanceof Error ? e.message : 'Erro interno.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
