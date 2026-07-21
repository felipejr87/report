import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

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
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY')
    const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID')
    if (!apiKey || !voiceId) {
      console.error('[jarvis-tts] ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID não configuradas')
      return new Response(JSON.stringify({ erro: 'TTS não configurado.', fallback: true }), {
        status: 501,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Mesma checagem de acesso das outras functions do Jarvis — evita
    // que um espaço sem jarvis_enabled queime crédito do ElevenLabs.
    const espacoId = espacoIdDoToken(req)
    if (!espacoId) {
      return new Response(JSON.stringify({ erro: 'Sessão inválida.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: espaco } = await supabase.from('espacos').select('jarvis_enabled').eq('id', espacoId).single()
    if (!espaco?.jarvis_enabled) {
      return new Response(JSON.stringify({ erro: 'TTS disponível apenas para o espaço Jarvis.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { texto } = await req.json()
    if (!texto?.trim()) {
      return new Response(JSON.stringify({ erro: 'Texto vazio.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Limpar markdown antes de enviar para TTS
    const textoLimpo = texto
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/`(.*?)`/g, '$1')
      .replace(/✓\s*/g, '')
      .replace(/→\s*/g, '')
      .replace(/⚡\s*/g, '')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim()
      // Limitar tamanho para economizar créditos
      .slice(0, 500)

    if (!textoLimpo) {
      return new Response(JSON.stringify({ erro: 'Texto vazio após limpeza.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Chamar ElevenLabs TTS — eleven_turbo_v2_5 é multilíngue (cobre
    // pt-BR e en, então a resposta do assistente já sai no idioma
    // certo sem precisar mandar idioma separado pra cá).
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: textoLimpo,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.85,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    })

    if (!res.ok) {
      const erro = await res.text()
      console.error('[jarvis-tts] ElevenLabs erro:', res.status, erro)
      return new Response(JSON.stringify({ erro: 'TTS indisponível.', fallback: true }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Retornar o stream de áudio diretamente
    return new Response(res.body, {
      headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache' },
    })
  } catch (e) {
    console.error('[jarvis-tts]', e)
    return new Response(JSON.stringify({ erro: e instanceof Error ? e.message : 'Erro interno.', fallback: true }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
