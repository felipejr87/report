import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checarRateLimit, registrarAcesso } from '../_shared/rate-limit.ts'

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

// Prepara o texto pra soar natural na síntese — números, siglas e
// símbolos que o modelo de voz não sabe pronunciar de forma legível.
// idioma usa a mesma convenção 'pt'|'en' do resto do app (useIdioma),
// não 'pt-BR'/'en-US'.
function prepararTextoParaVoz(texto: string, idioma: 'pt' | 'en' = 'pt'): string {
  let t = texto

  // Markdown e links
  t = t.replace(/\*\*(.*?)\*\*/g, '$1')
  t = t.replace(/\*(.*?)\*/g, '$1')
  t = t.replace(/#{1,6}\s/g, '')
  t = t.replace(/`(.*?)`/g, '$1')
  t = t.replace(/\[(.*?)\]\(.*?\)/g, '$1')

  if (idioma === 'pt') {
    // Moeda — mais importante. O grupo antes da vírgula pode ter
    // separador de milhar ("22.180,50") — precisa tirar o ponto dos
    // dois ramos (com e sem centavos), senão sobra um "." literal.
    t = t.replace(/R\$\s*([\d.]+),([\d]{2})/g, (_m, inteiro: string, centavos: string) => `${inteiro.replace(/\./g, ' ')} reais e ${centavos} centavos`)
    t = t.replace(/R\$\s*([\d.]+)/g, (_m, v: string) => `${v.replace(/\./g, ' ')} reais`)
    t = t.replace(/R\$/g, 'reais')
    t = t.replace(/\$\s*([\d.,]+)/g, '$1 dólares')
    t = t.replace(/€\s*([\d.,]+)/g, '$1 euros')

    // Porcentagem
    t = t.replace(/(\d+(?:,\d+)?)%/g, '$1 por cento')

    // Siglas — "IA" usa lookbehind negativo pra não pegar o final de
    // "POD-IA" (produto real do Felipe) e virar "POD-inteligência artificial".
    t = t.replace(/\bOKR\b/g, 'O K R')
    t = t.replace(/\bKPI\b/g, 'K P I')
    t = t.replace(/\bAPI\b/g, 'A P I')
    t = t.replace(/\bLLM\b/g, 'L L M')
    t = t.replace(/(?<!-)\bIA\b/g, 'inteligência artificial')
    t = t.replace(/\bCEO\b/g, 'C E O')
    t = t.replace(/\bPO\b/g, 'P O')
    t = t.replace(/\bQ(\d)\b/g, 'trimestre $1')
    t = t.replace(/\bSr\.\s/g, 'Senhor ')
    t = t.replace(/\bDr\.\s/g, 'Doutor ')

    // Datas e horas
    t = t.replace(/(\d{2})\/(\d{2})\/(\d{4})/g, '$1 de $2 de $3')
    t = t.replace(/(\d{2})\/(\d{2})/g, '$1 de $2')
    t = t.replace(/(\d{1,2}):(\d{2})/g, '$1 e $2')

    // Símbolos → pausas naturais
    t = t.replace(/✓\s*/g, 'concluído, ')
    t = t.replace(/→\s*/g, '. ')
    t = t.replace(/⚠\s*/g, 'atenção, ')
    t = t.replace(/⚡\s*/g, '')
    t = t.replace(/•\s*/g, ', ')
    t = t.replace(/—/g, ', ')

    // Quebras de linha
    t = t.replace(/\n{2,}/g, '. ')
    t = t.replace(/\n/g, ', ')
  } else {
    t = t.replace(/R\$\s*([\d.,]+)/g, '$1 reais')
    t = t.replace(/\$\s*([\d.,]+)/g, '$1 dollars')
    t = t.replace(/(\d+)%/g, '$1 percent')
    t = t.replace(/✓\s*/g, 'done, ')
    t = t.replace(/→\s*/g, '. ')
    t = t.replace(/\n+/g, '. ')
    t = t.replace(/—/g, ', ')
  }

  t = t.replace(/,\s*,/g, ',')
  t = t.replace(/\.\s*\./g, '.')
  t = t.replace(/\s+/g, ' ')
  t = t.trim()

  // Limitar tamanho para economizar créditos
  return t.slice(0, 500)
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

    const { bloqueado } = await checarRateLimit(req, espacoId, 'tts', supabase)
    if (bloqueado) {
      await registrarAcesso(espacoId, 'tts', req, 429, supabase)
      return new Response(JSON.stringify({ erro: 'Muitas chamadas de voz. Aguarde um momento.', fallback: true }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { texto, idioma: idiomaBody } = await req.json()
    const idioma: 'pt' | 'en' = idiomaBody === 'en' ? 'en' : 'pt'

    if (!texto?.trim()) {
      return new Response(JSON.stringify({ erro: 'Texto vazio.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const textoLimpo = prepararTextoParaVoz(texto, idioma)

    if (!textoLimpo) {
      return new Response(JSON.stringify({ erro: 'Texto vazio após limpeza.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Chamar ElevenLabs TTS — a mesma voz (britânica) serve pra pt e en
    // com eleven_turbo_v2_5, que é multilíngue.
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
      await registrarAcesso(espacoId, 'tts', req, 503, supabase)
      return new Response(JSON.stringify({ erro: 'TTS indisponível.', fallback: true }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await registrarAcesso(espacoId, 'tts', req, 200, supabase)
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
