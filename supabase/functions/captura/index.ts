import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

// Decodifica o payload do JWT já validado pelo gateway (verify_jwt=true) —
// não precisa reverificar assinatura aqui, só ler o espaco_id do claim.
function espacoIdDoToken(req: Request): string | null {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    const payload = JSON.parse(atob(partes[1]))
    return payload.espaco_id || null
  } catch {
    return null
  }
}

// Nunca enviar dados sensíveis (nome da filha, saúde) pra API externa.
function pseudonimizar(texto: string): string {
  return texto
    .replace(/\b(filha|minha filha|a menina)\b/gi, '[filha]')
    .replace(/\b(psicóloga|psicóloga dela|consulta)\b/gi, '[consulta]')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) {
      console.error('[captura] GEMINI_API_KEY não configurada')
      return new Response(
        JSON.stringify({ ok: false, erro: 'Captura por texto ainda não está configurada.' }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const espacoId = espacoIdDoToken(req)
    if (!espacoId) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Sessão inválida.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { texto } = await req.json()
    if (!texto || !texto.trim()) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Texto vazio.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: cats } = await supabase.from('categorias_fin').select('id, nome').eq('espaco_id', espacoId)
    const { data: habitos } = await supabase.from('habitos').select('id, nome').eq('espaco_id', espacoId).eq('ativo', true)

    const textoPseudo = pseudonimizar(texto.trim())

    const prompt = `Você é um parser de captura de dados pessoais. Interprete a entrada do usuário e retorne JSON.

Categorias disponíveis: ${(cats || []).map((c) => `${c.id}:${c.nome}`).join(', ')}
Hábitos disponíveis: ${(habitos || []).map((h) => `${h.id}:${h.nome}`).join(', ')}

Entrada: "${textoPseudo}"

Retorne APENAS JSON válido, sem explicação:
{
  "tipo": "lancamento" | "habito_check" | "evento" | "desconhecido",
  "confianca": 0.0-1.0,
  "mensagem_confirmacao": "texto amigável descrevendo o que será feito",
  "dados": {}
}

Para "lancamento": dados = { descricao, valor (negativo=gasto), categoria_id, data (YYYY-MM-DD, hoje se omitido) }
Para "habito_check": dados = { habito_id, data (YYYY-MM-DD, hoje se omitido) }
Para "evento": dados = { titulo, inicio (ISO 8601) }`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )

    if (!res.ok) {
      console.error('[captura] Gemini respondeu', res.status, await res.text())
      return new Response(
        JSON.stringify({ ok: false, erro: 'Erro ao interpretar o texto.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const resultado = await res.json()
    const parsed = JSON.parse(resultado.candidates[0].content.parts[0].text)

    return new Response(
      JSON.stringify({ ok: true, ...parsed }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('[captura]', e)
    return new Response(
      JSON.stringify({ ok: false, erro: 'Erro interno.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
