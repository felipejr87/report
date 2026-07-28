import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checarRateLimit, registrarAcesso } from '../_shared/rate-limit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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

const MODOS = ['ata', 'todos', 'resumo'] as const
type Modo = typeof MODOS[number]

const PROMPTS: Record<'pt' | 'en', Record<Modo, (conteudo: string) => string>> = {
  pt: {
    ata: (conteudo) => `Você é J.A.R.V.I.S. Transforme as notas abaixo em uma ata profissional e concisa.
Estrutura: Data, Participantes (se mencionados), Pauta, Decisões, Encaminhamentos.
Seja direto. Não invente informações que não estão nas notas.
NOTAS:\n\n${conteudo}`,
    todos: (conteudo) => `Você é J.A.R.V.I.S. Extraia todos os action items e to-dos das notas abaixo.
Formato: lista com responsável (se mencionado), prazo (se mencionado) e prioridade inferida.
Só extraia o que está explicitamente nas notas — não invente tarefas.
NOTAS:\n\n${conteudo}`,
    resumo: (conteudo) => `Você é J.A.R.V.I.S. Resuma as notas abaixo em 3-5 pontos principais.
Cada ponto: 1 frase. Direto. Sem rodeios.
NOTAS:\n\n${conteudo}`,
  },
  en: {
    ata: (conteudo) => `You are J.A.R.V.I.S. Turn the notes below into a concise, professional meeting summary.
Structure: Date, Attendees (if mentioned), Agenda, Decisions, Action items.
Be direct. Don't invent information that isn't in the notes.
NOTES:\n\n${conteudo}`,
    todos: (conteudo) => `You are J.A.R.V.I.S. Extract every action item and to-do from the notes below.
Format: a list with owner (if mentioned), due date (if mentioned) and inferred priority.
Only extract what's explicitly in the notes — don't invent tasks.
NOTES:\n\n${conteudo}`,
    resumo: (conteudo) => `You are J.A.R.V.I.S. Summarize the notes below into 3-5 main points.
Each point: 1 sentence. Direct. No fluff.
NOTES:\n\n${conteudo}`,
  },
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      console.error('[anotacoes-processar] ANTHROPIC_API_KEY não configurada')
      return jsonResponse({ ok: false, erro: 'Assistente ainda não está configurado.' }, 501)
    }

    const espacoId = espacoIdDoToken(req)
    if (!espacoId) return jsonResponse({ ok: false, erro: 'Sessão inválida.' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: espaco } = await supabase.from('espacos').select('jarvis_enabled').eq('id', espacoId).single()
    if (!espaco?.jarvis_enabled) {
      return jsonResponse({ ok: false, erro: 'Assistente disponível apenas para o espaço Jarvis.' }, 403)
    }

    const { conteudo, modo, idioma: idiomaBody } = await req.json()
    const idioma: 'pt' | 'en' = idiomaBody === 'en' ? 'en' : 'pt'

    if (typeof conteudo !== 'string' || !conteudo.trim()) {
      return jsonResponse({ ok: false, erro: idioma === 'en' ? 'No content to process.' : 'Nenhum conteúdo para processar.' }, 400)
    }
    if (!MODOS.includes(modo)) {
      return jsonResponse({ ok: false, erro: idioma === 'en' ? 'Invalid mode.' : 'Modo inválido.' }, 400)
    }

    const { bloqueado } = await checarRateLimit(req, espacoId, 'anotacoes', supabase)
    if (bloqueado) {
      await registrarAcesso(espacoId, 'anotacoes', req, 429, supabase)
      return jsonResponse(
        { ok: false, erro: idioma === 'en' ? 'Too many requests. Give it a moment, Sr. Felipe.' : 'Muitas requisições. Aguarde um momento, Sr. Felipe.' },
        429,
      )
    }

    const prompt = PROMPTS[idioma][modo as Modo](conteudo)

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!anthropicRes.ok) {
      console.error('[anotacoes-processar] Anthropic respondeu', anthropicRes.status, await anthropicRes.text())
      await registrarAcesso(espacoId, 'anotacoes', req, 502, supabase)
      return jsonResponse({ ok: false, erro: idioma === 'en' ? 'Error consulting the assistant.' : 'Erro ao consultar o assistente.' }, 502)
    }

    const resultado = await anthropicRes.json()
    const texto = resultado.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n') || ''

    await registrarAcesso(espacoId, 'anotacoes', req, 200, supabase)
    return jsonResponse({ ok: true, texto: texto || (idioma === 'en' ? 'Could not generate a response.' : 'Não consegui gerar uma resposta.') })
  } catch (e) {
    console.error('[anotacoes-processar]', e)
    return jsonResponse({ ok: false, erro: e instanceof Error ? e.message : 'Erro interno.' }, 500)
  }
})
