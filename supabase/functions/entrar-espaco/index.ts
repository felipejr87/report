import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import bcrypt from 'npm:bcryptjs'
import { create } from 'https://deno.land/x/djwt@v3.0.1/mod.ts'

// Rate limit simples em memória (por IP, 5 tentativas/min)
const tentativas = new Map<string, { count: number; reset: number }>()

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Rate limit por IP
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    const agora = Date.now()
    const entry = tentativas.get(ip) || { count: 0, reset: agora + 60_000 }

    if (agora > entry.reset) {
      entry.count = 0
      entry.reset = agora + 60_000
    }
    entry.count++
    tentativas.set(ip, entry)

    if (entry.count > 5) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Muitas tentativas. Aguarde 1 minuto.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { codigo, senha } = await req.json()

    if (!codigo || !senha) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Código e senha são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar espaço pelo código (service role — bypass RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: espaco, error } = await supabase
      .from('espacos')
      .select('id, nome, senha_hash')
      .eq('codigo', codigo.toUpperCase().trim())
      .single()

    // Mensagem genérica — não revelar se código existe ou não
    const ERRO_CREDENCIAIS = 'Código ou senha incorretos.'

    if (error || !espaco) {
      return new Response(
        JSON.stringify({ ok: false, erro: ERRO_CREDENCIAIS }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const senhaValida = await bcrypt.compare(senha, espaco.senha_hash)
    if (!senhaValida) {
      return new Response(
        JSON.stringify({ ok: false, erro: ERRO_CREDENCIAIS }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Gerar JWT customizado assinado com SUPABASE_JWT_SECRET
    // CRÍTICO: usar exatamente esta chave — é a única que o RLS do Supabase aceita
    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET')!
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    )

    const agora_s = Math.floor(Date.now() / 1000)
    const token = await create(
      { alg: 'HS256', typ: 'JWT' },
      {
        sub:       espaco.id,
        espaco_id: espaco.id,   // claim lido pelo RLS
        role:      'authenticated',
        iss:       'supabase',
        iat:       agora_s,
        exp:       agora_s + 60 * 60 * 8, // 8 horas
      },
      key
    )

    return new Response(
      JSON.stringify({ ok: true, token, espaco: { id: espaco.id, nome: espaco.nome, codigo } }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('[entrar-espaco]', e)
    return new Response(
      JSON.stringify({ ok: false, erro: 'Erro interno.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
