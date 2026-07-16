import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import bcrypt from 'npm:bcryptjs'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { codigo, nome, senha } = await req.json()

    // Validações
    if (!codigo || !nome || !senha) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Código, nome e senha são obrigatórios.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (senha.length < 8) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Senha deve ter pelo menos 8 caracteres.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const codigoNorm = codigo.toUpperCase().trim().replace(/\s+/g, '-')
    if (!/^[A-Z0-9-]{4,20}$/.test(codigoNorm)) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Código inválido. Use 4-20 caracteres: letras maiúsculas, números ou hífen.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Hash da senha
    const senha_hash = await bcrypt.hash(senha, 12)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data, error } = await supabase
      .from('espacos')
      .insert({ codigo: codigoNorm, nome, senha_hash })
      .select('id, codigo, nome')
      .single()

    if (error) {
      if (error.code === '23505') { // unique_violation
        return new Response(
          JSON.stringify({ ok: false, erro: 'Este código já está em uso. Escolha outro.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      throw error
    }

    return new Response(
      JSON.stringify({ ok: true, espaco: data }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('[criar-espaco]', e)
    return new Response(
      JSON.stringify({ ok: false, erro: 'Erro interno.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
