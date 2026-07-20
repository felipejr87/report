import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import bcrypt from 'npm:bcryptjs'
import { create } from 'https://deno.land/x/djwt@v3.0.1/mod.ts'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Rate limit por IP, persistido no banco (o Map em memória não sobrevive
    // entre invocações da Edge Function).
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const agora = new Date()

    const { data: limite } = await supabase
      .from('login_rate_limit')
      .select('contagem, reset_em')
      .eq('ip', ip)
      .maybeSingle()

    let contagem = 1
    let resetEm = new Date(agora.getTime() + 60_000)

    if (limite && new Date(limite.reset_em) > agora) {
      contagem = limite.contagem + 1
      resetEm = new Date(limite.reset_em)
    }

    await supabase
      .from('login_rate_limit')
      .upsert({ ip, contagem, reset_em: resetEm.toISOString() })

    if (contagem > 5) {
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
    const { data: espaco, error } = await supabase
      .from('espacos')
      .select('id, nome, senha_hash, jarvis_enabled')
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

    // Gerar JWT customizado assinado com o JWT secret oficial do projeto.
    // Projetos novos não injetam SUPABASE_JWT_SECRET automaticamente nas Edge
    // Functions (nomes com prefixo SUPABASE_ são reservados e não podem ser
    // definidos manualmente) — por isso lemos também de JWT_SIGNING_SECRET,
    // que deve ser configurado como secret da função no dashboard com o valor
    // de Project Settings → API → JWT Settings → Legacy JWT Secret.
    // CRÍTICO: usar exatamente esse valor — é a única chave que o RLS do Supabase aceita.
    const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET') || Deno.env.get('JWT_SIGNING_SECRET')
    if (!jwtSecret) {
      console.error('[entrar-espaco] JWT signing secret não configurado (SUPABASE_JWT_SECRET / JWT_SIGNING_SECRET ausentes)')
      return new Response(
        JSON.stringify({ ok: false, erro: 'Erro interno.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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
      JSON.stringify({ ok: true, token, espaco: { id: espaco.id, nome: espaco.nome, codigo, jarvis_enabled: espaco.jarvis_enabled === true } }),
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
