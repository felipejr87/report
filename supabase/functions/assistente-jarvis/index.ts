import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// Deriva espaco_id do JWT já validado pelo gateway (verify_jwt=true) —
// nunca aceitar espaco_id vindo do corpo da requisição.
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

// =====================================================
// FERRAMENTAS — nomes/enums batem com o schema real do banco.
// Fases de ATIVIDADE (discovery/refinamento/downstream/entregue) são
// diferentes das fases de PROJETO (discovery/construcao/lancamento/
// operacao/pausado/encerrado) — criar_atividade usa o enum de atividade.
// =====================================================
const TOOLS = [
  {
    name: 'criar_lancamento',
    description: 'Cria um lançamento financeiro (gasto ou receita). Use quando o Felipe disser que gastou ou recebeu algo, ou pedir para registrar uma despesa.',
    input_schema: {
      type: 'object',
      properties: {
        descricao: { type: 'string', description: 'Descrição do lançamento. Ex: "Mercado Assaí", "Salário Claro"' },
        valor: { type: 'number', description: 'Valor em reais. NEGATIVO para gasto, POSITIVO para receita. Ex: -187.50 ou 9000' },
        categoria_id: { type: 'number', description: 'ID da categoria: 1=Filha, 2=Moradia, 3=Financiamento, 4=Mercado, 5=Transporte, 6=Saúde, 7=Lazer, 8=Projetos, 9=Receita, 10=Outros' },
        data: { type: 'string', description: 'Data no formato YYYY-MM-DD. Use a data de hoje se não especificado.' },
        meio: { type: 'string', enum: ['cartao', 'pix', 'debito', 'dinheiro', 'ted'], description: 'Meio de pagamento' },
      },
      required: ['descricao', 'valor', 'categoria_id', 'data'],
    },
  },
  {
    name: 'criar_lancamentos_lote',
    description: 'Cria múltiplos lançamentos de uma vez. Use quando o Felipe pedir para registrar vários gastos juntos.',
    input_schema: {
      type: 'object',
      properties: {
        lancamentos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              descricao: { type: 'string' },
              valor: { type: 'number' },
              categoria_id: { type: 'number' },
              data: { type: 'string' },
              meio: { type: 'string' },
            },
            required: ['descricao', 'valor', 'categoria_id', 'data'],
          },
        },
      },
      required: ['lancamentos'],
    },
  },
  {
    name: 'atualizar_divida',
    description: 'Atualiza o saldo atual de uma dívida. Use quando o Felipe pagar uma parcela ou quitar algo.',
    input_schema: {
      type: 'object',
      properties: {
        nome_divida: { type: 'string', description: 'Nome ou parte do nome da dívida para localizar' },
        novo_saldo: { type: 'number', description: 'Novo saldo devedor em reais' },
      },
      required: ['nome_divida', 'novo_saldo'],
    },
  },
  {
    name: 'salvar_perfil',
    description: 'Salva peso/altura/preferências do Felipe. Use quando ele informar esses dados.',
    input_schema: {
      type: 'object',
      properties: {
        peso: { type: 'number', description: 'Peso em kg' },
        altura: { type: 'number', description: 'Altura em cm' },
        preferencias: { type: 'object', description: 'Preferências variadas, ex: {"parcelamento_max": 12}' },
      },
    },
  },
  {
    name: 'criar_atividade',
    description: 'Cria uma nova atividade (tarefa) dentro de um projeto existente.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome da atividade' },
        resumo: { type: 'string', description: 'Descrição curta do que é a atividade — se o Felipe não der uma, use o próprio nome.' },
        projeto_nome: { type: 'string', description: 'Nome ou parte do nome do projeto onde criar' },
        fase: { type: 'string', enum: ['discovery', 'refinamento', 'downstream', 'entregue'], description: 'Fase da atividade (não confundir com fase de projeto)' },
        responsavel: { type: 'string', description: 'Responsável. Default: Felipe' },
        prazo: { type: 'string', description: 'Data prevista de conclusão, formato YYYY-MM-DD (opcional)' },
      },
      required: ['nome', 'projeto_nome'],
    },
  },
  {
    name: 'buscar_contexto',
    description: 'Busca informações específicas e atualizadas no banco antes de responder.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['financeiro_mes', 'dividas', 'projetos', 'atividades_paradas', 'habitos_semana'],
        },
        mes: { type: 'string', description: 'Mês no formato YYYY-MM. Default: mês atual' },
      },
      required: ['tipo'],
    },
  },
]

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      console.error('[assistente-jarvis] ANTHROPIC_API_KEY não configurada')
      return jsonResponse({ ok: false, erro: 'Assistente ainda não está configurado.' }, 501)
    }

    const espacoId = espacoIdDoToken(req)
    if (!espacoId) return jsonResponse({ ok: false, erro: 'Sessão inválida.' }, 401)

    const { mensagens } = await req.json()
    if (!Array.isArray(mensagens) || mensagens.length === 0) {
      return jsonResponse({ ok: false, erro: 'Nenhuma mensagem enviada.' }, 400)
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: espaco } = await supabase.from('espacos').select('jarvis_enabled').eq('id', espacoId).single()
    if (!espaco?.jarvis_enabled) {
      return jsonResponse({ ok: false, erro: 'Assistente disponível apenas para o espaço Jarvis.' }, 403)
    }

    const mes = new Date().toISOString().slice(0, 7)

    const [
      { data: lancamentos },
      { data: dividas },
      { data: categorias },
      { data: objetivos },
      { data: projetos },
      { data: habitos },
      { data: perfil },
    ] = await Promise.all([
      supabase.from('lancamentos').select('valor, descricao, categoria_id, data').eq('espaco_id', espacoId).gte('data', `${mes}-01`),
      supabase.from('dividas').select('id, nome, saldo_atual, parcela, taxa_mensal').eq('espaco_id', espacoId).eq('ativa', true),
      supabase.from('categorias_fin').select('id, nome, teto_mensal').eq('espaco_id', espacoId),
      supabase.from('objetivos').select('descricao, pilar_id, prazo').eq('espaco_id', espacoId).eq('status', 'ativo'),
      supabase.from('projetos').select('id, nome, fase, pilar_id').eq('espaco_id', espacoId),
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

    const contexto = `
CONTEXTO DO FELIPE — ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}

FINANCEIRO:
- Receita do mês: R$ ${receita.toFixed(2)}
- Gastos do mês: R$ ${gastos.toFixed(2)}
- Saldo disponível: R$ ${saldo.toFixed(2)}
- ${lancamentos?.length === 0 ? 'Nenhum lançamento registrado ainda este mês.' : `${lancamentos?.length} lançamentos registrados.`}

CATEGORIAS (gasto / teto):
${categorias?.filter((c) => c.teto_mensal).map((c) => {
  const g = gastoPorCat[c.id] || 0
  const pct = Math.round((g / c.teto_mensal) * 100)
  return `- [${c.id}] ${c.nome}: R$${g.toFixed(0)} / R$${c.teto_mensal} (${pct}%)`
}).join('\n') || 'Nenhuma categoria com teto.'}

DÍVIDAS ATIVAS:
${dividas?.map((d) => `- ${d.nome}: saldo R$${d.saldo_atual}, parcela R$${d.parcela || 0}`).join('\n') || 'Nenhuma'}

PROJETOS:
${projetos?.map((p) => `- [${p.id}] ${p.nome} (${p.fase})`).join('\n') || 'Nenhum'}

OBJETIVOS:
${objetivos?.map((o) => `- ${o.descricao}${o.prazo ? ` → ${new Date(o.prazo).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}` : ''}`).join('\n') || 'Nenhum'}

HÁBITOS: ${habitos?.map((h) => h.nome).join(', ') || 'Nenhum'}

PERFIL FÍSICO: ${perfil ? `${perfil.peso ?? '?'}kg / ${perfil.altura ?? '?'}cm` : 'Não informado — perguntar quando relevante'}

HOJE: ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
`

    const systemPrompt = `Você é o Jarvis, assistente pessoal do Felipe.
Você TEM ACESSO ao banco de dados e PODE EXECUTAR ações reais usando as ferramentas disponíveis.
Quando o Felipe pedir para criar lançamentos, registrar gastos, atualizar dívidas ou criar tarefas:
1. Use a ferramenta correta para EXECUTAR a ação de verdade.
2. Confirme o que foi feito depois da execução.
3. Nunca finja ter feito algo sem usar a ferramenta.

Para recomendações de compra: apresente 3 opções, analise o saldo real, recomende forma de pagamento.
Para perguntas sobre o financeiro: use buscar_contexto se precisar de dados mais atualizados que os já informados abaixo.
Modo confronto: se algo não fizer sentido financeiramente, diga diretamente.
Seja conciso e prático.

${contexto}`

    const msgAtual: any[] = [...mensagens]
    let respostaFinal = ''
    let iteracoes = 0
    const MAX_ITERACOES = 5

    while (iteracoes < MAX_ITERACOES) {
      iteracoes++

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
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
          tools: TOOLS,
          messages: msgAtual,
        }),
      })

      if (!anthropicRes.ok) {
        console.error('[assistente-jarvis] Anthropic respondeu', anthropicRes.status, await anthropicRes.text())
        return jsonResponse({ ok: false, erro: 'Erro ao consultar o assistente.' }, 502)
      }

      const resultado = await anthropicRes.json()

      if (resultado.type === 'error') {
        throw new Error(resultado.error?.message || 'Erro na API Anthropic')
      }

      if (resultado.stop_reason === 'tool_use') {
        msgAtual.push({ role: 'assistant', content: resultado.content })

        const toolResults = []
        for (const block of resultado.content) {
          if (block.type !== 'tool_use') continue

          let toolResult = ''
          try {
            toolResult = await executarFerramenta(block.name, block.input, espacoId, supabase)
          } catch (e) {
            toolResult = `Erro ao executar ${block.name}: ${e instanceof Error ? e.message : String(e)}`
          }

          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: toolResult })
        }

        msgAtual.push({ role: 'user', content: toolResults })
        continue
      }

      respostaFinal = (resultado.content || [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n')
      break
    }

    return jsonResponse({ ok: true, resposta: respostaFinal || 'Não consegui gerar uma resposta.' })
  } catch (e) {
    console.error('[assistente-jarvis]', e)
    return jsonResponse({ ok: false, erro: e instanceof Error ? e.message : 'Erro interno.' }, 500)
  }
})

// =====================================================
// EXECUÇÃO REAL DAS FERRAMENTAS NO SUPABASE
// =====================================================
async function executarFerramenta(nome: string, input: any, espacoId: string, supabase: any): Promise<string> {
  switch (nome) {
    case 'criar_lancamento': {
      const { error } = await supabase.from('lancamentos').insert({
        espaco_id: espacoId,
        descricao: input.descricao,
        valor: input.valor,
        categoria_id: input.categoria_id,
        data: input.data,
        meio: input.meio || null,
      })
      if (error) throw new Error(error.message)
      return `Lançamento criado: ${input.descricao} (${input.valor > 0 ? '+' : ''}R$${Math.abs(input.valor).toFixed(2)}) em ${input.data}`
    }

    case 'criar_lancamentos_lote': {
      const itens = input.lancamentos.map((l: any) => ({ ...l, espaco_id: espacoId }))
      const { error } = await supabase.from('lancamentos').insert(itens)
      if (error) throw new Error(error.message)
      const total = itens.reduce((s: number, l: any) => s + l.valor, 0)
      return `${itens.length} lançamentos criados. Total: R$${total.toFixed(2)}`
    }

    case 'atualizar_divida': {
      const { data: dividasDoEspaco } = await supabase.from('dividas').select('id, nome').eq('espaco_id', espacoId).eq('ativa', true)
      const divida = dividasDoEspaco?.find((d: any) => d.nome.toLowerCase().includes(input.nome_divida.toLowerCase()))
      if (!divida) return `Dívida "${input.nome_divida}" não encontrada.`
      const { error } = await supabase.from('dividas').update({ saldo_atual: input.novo_saldo }).eq('id', divida.id)
      if (error) throw new Error(error.message)
      return `Dívida "${divida.nome}" atualizada: novo saldo R$${input.novo_saldo.toFixed(2)}`
    }

    case 'salvar_perfil': {
      const dados: any = { espaco_id: espacoId, atualizado_em: new Date().toISOString() }
      if (input.peso != null) dados.peso = input.peso
      if (input.altura != null) dados.altura = input.altura
      if (input.preferencias) dados.preferencias = input.preferencias
      const { error } = await supabase.from('jarvis_perfil').upsert(dados, { onConflict: 'espaco_id' })
      if (error) throw new Error(error.message)
      return `Perfil atualizado: ${JSON.stringify(dados)}`
    }

    case 'criar_atividade': {
      const { data: projetosDoEspaco } = await supabase.from('projetos').select('id, nome').eq('espaco_id', espacoId)
      const projeto = projetosDoEspaco?.find((p: any) => p.nome.toLowerCase().includes(input.projeto_nome.toLowerCase()))
      if (!projeto) return `Projeto "${input.projeto_nome}" não encontrado. Projetos disponíveis: ${projetosDoEspaco?.map((p: any) => p.nome).join(', ')}`
      const { error } = await supabase.from('atividades').insert({
        espaco_id: espacoId,
        projeto_id: projeto.id,
        nome: input.nome,
        resumo: input.resumo || input.nome,
        fase: input.fase || 'discovery',
        responsavel: input.responsavel || 'Felipe',
        data_fim: input.prazo || null,
      })
      if (error) throw new Error(error.message)
      return `Atividade "${input.nome}" criada no projeto "${projeto.nome}"`
    }

    case 'buscar_contexto': {
      const mes = input.mes || new Date().toISOString().slice(0, 7)
      switch (input.tipo) {
        case 'financeiro_mes': {
          const { data: lncs } = await supabase.from('lancamentos').select('valor, descricao, categoria_id, data').eq('espaco_id', espacoId).gte('data', `${mes}-01`)
          const receita = lncs?.filter((l: any) => l.valor > 0).reduce((s: number, l: any) => s + l.valor, 0) || 0
          const gastos = lncs?.filter((l: any) => l.valor < 0).reduce((s: number, l: any) => s + Math.abs(l.valor), 0) || 0
          return `Mês ${mes}: receita R$${receita.toFixed(2)}, gastos R$${gastos.toFixed(2)}, saldo R$${(receita - gastos).toFixed(2)}, ${lncs?.length || 0} lançamentos.`
        }
        case 'dividas': {
          const { data: divs } = await supabase.from('dividas').select('nome, saldo_atual, parcela').eq('espaco_id', espacoId).eq('ativa', true)
          return divs?.map((d: any) => `${d.nome}: R$${d.saldo_atual} (parcela R$${d.parcela})`).join('; ') || 'Nenhuma dívida ativa.'
        }
        case 'projetos': {
          const { data: projs } = await supabase.from('projetos').select('nome, fase').eq('espaco_id', espacoId)
          return projs?.map((p: any) => `${p.nome} (${p.fase})`).join('; ') || 'Nenhum projeto.'
        }
        case 'atividades_paradas': {
          const { data: ats } = await supabase
            .from('atividades')
            .select('nome, atualizado_em')
            .eq('espaco_id', espacoId)
            .neq('fase', 'entregue')
            .lt('atualizado_em', new Date(Date.now() - 3 * 86400000).toISOString())
          return ats?.map((a: any) => {
            const dias = Math.floor((Date.now() - new Date(a.atualizado_em).getTime()) / 86400000)
            return `${a.nome} (${dias}d)`
          }).join(', ') || 'Nenhuma atividade parada.'
        }
        case 'habitos_semana': {
          const { data: habs } = await supabase.from('habitos').select('nome, frequencia_semanal').eq('espaco_id', espacoId).eq('ativo', true)
          return habs?.map((h: any) => `${h.nome} (meta ${h.frequencia_semanal}x/semana)`).join('; ') || 'Nenhum hábito.'
        }
        default:
          return 'Tipo de contexto não reconhecido.'
      }
    }

    default:
      return `Ferramenta "${nome}" não implementada.`
  }
}
