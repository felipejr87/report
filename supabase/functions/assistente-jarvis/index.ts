import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

// Deriva espaco_id do JWT já validado pelo gateway (verify_jwt=true) —
// nunca aceitar espaco_id vindo do corpo da requisição, senão qualquer
// espaço autenticado poderia pedir o contexto financeiro de outro.
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
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      console.error('[assistente-jarvis] ANTHROPIC_API_KEY não configurada')
      return new Response(
        JSON.stringify({ ok: false, erro: 'Assistente ainda não está configurado.' }),
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

    const { mensagens } = await req.json()
    if (!Array.isArray(mensagens) || mensagens.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Nenhuma mensagem enviada.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: espaco } = await supabase.from('espacos').select('jarvis_enabled').eq('id', espacoId).single()
    if (!espaco?.jarvis_enabled) {
      return new Response(
        JSON.stringify({ ok: false, erro: 'Assistente disponível apenas para o espaço Jarvis.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const mes = new Date().toISOString().slice(0, 7)
    const inicioMes = `${mes}-01`

    const [
      { data: lancamentos },
      { data: dividas },
      { data: categorias },
      { data: objetivos },
      { data: projetos },
      { data: habitos },
      { data: perfil },
    ] = await Promise.all([
      supabase.from('lancamentos').select('valor, descricao, categoria_id, data').eq('espaco_id', espacoId).gte('data', inicioMes),
      supabase.from('dividas').select('nome, saldo_atual, parcela, taxa_mensal, meta_quitacao').eq('espaco_id', espacoId).eq('ativa', true),
      supabase.from('categorias_fin').select('id, nome, teto_mensal').eq('espaco_id', espacoId),
      supabase.from('objetivos').select('descricao, pilar_id, prazo, status').eq('espaco_id', espacoId).eq('status', 'ativo'),
      supabase.from('projetos').select('nome, fase, pilar_id').eq('espaco_id', espacoId),
      supabase.from('habitos').select('nome, frequencia_semanal').eq('espaco_id', espacoId).eq('ativo', true),
      supabase.from('jarvis_perfil').select('*').eq('espaco_id', espacoId).maybeSingle(),
    ])

    const receita = lancamentos?.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0) || 0
    const gastos = lancamentos?.filter((l) => l.valor < 0).reduce((s, l) => s + Math.abs(l.valor), 0) || 0
    const saldo = receita - gastos

    const gastoPorCat: Record<number, number> = {}
    lancamentos?.filter((l) => l.valor < 0).forEach((l) => {
      if (l.categoria_id != null) gastoPorCat[l.categoria_id] = (gastoPorCat[l.categoria_id] || 0) + Math.abs(l.valor)
    })

    const contextoFinanceiro = `
SITUAÇÃO FINANCEIRA (${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}):
- Receita do mês: R$ ${receita.toFixed(2)}
- Gastos do mês: R$ ${gastos.toFixed(2)}
- Saldo disponível: R$ ${saldo.toFixed(2)}
- Dívidas ativas: ${dividas?.map((d) => `${d.nome} (saldo: R$ ${d.saldo_atual}, parcela: R$ ${d.parcela || 0})`).join('; ') || 'Nenhuma'}

CATEGORIAS E TETOS:
${categorias?.filter((c) => c.teto_mensal).map((c) => {
  const gasto = gastoPorCat[c.id] || 0
  const pct = Math.round((gasto / c.teto_mensal) * 100)
  return `- ${c.nome}: R$ ${gasto.toFixed(0)} de R$ ${c.teto_mensal} (${pct}%)`
}).join('\n') || 'Nenhuma categoria com teto definido'}

OBJETIVOS ATIVOS:
${objetivos?.map((o) => `- ${o.descricao}${o.prazo ? ` (prazo: ${new Date(o.prazo).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })})` : ''}`).join('\n') || 'Nenhum'}

PROJETOS ATIVOS:
${projetos?.map((p) => `- ${p.nome} (fase: ${p.fase})`).join('\n') || 'Nenhum'}

HÁBITOS:
${habitos?.map((h) => `- ${h.nome} (meta: ${h.frequencia_semanal}x/semana)`).join('\n') || 'Nenhum'}

PERFIL FÍSICO:
${perfil ? `Peso: ${perfil.peso ?? '?'}kg, Altura: ${perfil.altura ?? '?'}cm` : 'Não informado ainda — perguntar quando relevante'}
`

    const systemPrompt = `Você é o Jarvis, assistente pessoal do Felipe.
Você conhece o contexto financeiro, objetivos e rotina do Felipe e ajuda a tomar decisões práticas com base na situação real dele.

Quando o Felipe pedir recomendações de compra:
1. Se faltar dado necessário (peso/altura pra colchão, uso pra eletrônico etc.), PERGUNTE primeiro.
2. Apresente 3 opções em faixas de preço diferentes (econômica, intermediária, premium).
3. Analise a situação financeira real (saldo disponível, dívidas, tetos de categoria).
4. Faça uma recomendação final clara com justificativa.
5. Sugira a forma de pagamento com base no saldo real.

Seja direto, sem enrolação. Use os dados reais informados abaixo, nunca suposições.
Se a compra não for necessária ou o momento não for ideal, diga isso claramente.

${contextoFinanceiro}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: mensagens,
      }),
    })

    if (!response.ok) {
      console.error('[assistente-jarvis] Anthropic respondeu', response.status, await response.text())
      return new Response(
        JSON.stringify({ ok: false, erro: 'Erro ao consultar o assistente.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const resultado = await response.json()
    const resposta = resultado.content?.[0]?.text || 'Erro ao processar resposta.'

    return new Response(
      JSON.stringify({ ok: true, resposta }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    console.error('[assistente-jarvis]', e)
    return new Response(
      JSON.stringify({ ok: false, erro: 'Erro interno.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
