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
// lancamentos: `meio` (cartao/pix/debito/dinheiro/ted) é a fonte da
// verdade sobre como foi pago — `conta` (corrente/cartao) é derivada
// dele automaticamente em executarFerramenta, nunca vem do modelo.
// categoria_id é obrigatório (inferido pelo modelo, com fallback
// server-side em inferirCategoria) desde o bug do lançamento "Milky
// Moo" que ficou com meio e categoria nulos.
// =====================================================
const TOOLS = [
  {
    name: 'criar_lancamento',
    description: `Cria um lançamento financeiro — como lançar num extrato. Passa por confirmação antes de executar.
REGRA CRÍTICA: "meio" é obrigatório. Se o Felipe não disser onde/como pagou, PERGUNTE antes de chamar esta ferramenta — "Pagou no cartão, PIX ou dinheiro?" — nunca chame com meio adivinhado ou vazio.
categoria_id também é obrigatório: infira pelo nome do estabelecimento/descrição (ex: "Milky Moo" → Alimentação). Se o valor for alto (>R$100) e a categoria não for óbvia, confirme antes: "Vou lançar como Alimentação — correto?".
Lógica de fatura do cartão: toda compra no cartão entra na fatura do mês SEGUINTE ao da compra (fecha no fim do mês corrente, vence dia 06 do mês seguinte à compra+1). Ex: compra em julho → fatura de agosto, vence 06/08. Isso é sempre assim, não é uma regra só deste mês.`,
    input_schema: {
      type: 'object',
      properties: {
        descricao: { type: 'string', description: 'Descrição clara do gasto. Ex: "Milky Moo — Milk-shake"' },
        valor: { type: 'number', description: 'Negativo=gasto, positivo=receita' },
        categoria_id: { type: 'number', description: '1=Filha,2=Moradia,3=Financiamento,4=Mercado,5=Transporte,6=Saúde,7=Lazer,8=Projetos,9=Receita,10=Outros,11=Alimentação,12=Vestuário,13=Assinaturas,14=Educação,15=Energia/Água,16=Condomínio,17=Telefone,18=Cartão de Crédito,19=Impostos/IOF,20=Transferências' },
        data: { type: 'string', description: 'YYYY-MM-DD. Usar a data de hoje (ver AGORA no contexto) se o Felipe não informar.' },
        meio: {
          type: 'string',
          enum: ['cartao', 'pix', 'debito', 'dinheiro', 'ted'],
          description: 'OBRIGATÓRIO — perguntar ao Felipe se não estiver claro pela frase. cartao=cartão de crédito, pix=PIX da conta corrente, debito=débito automático, dinheiro=espécie, ted=transferência.',
        },
      },
      required: ['descricao', 'valor', 'categoria_id', 'data', 'meio'],
    },
  },
  {
    name: 'criar_lancamentos_lote',
    description: 'Cria múltiplos lançamentos de uma vez. Mesmas regras de criar_lancamento (meio e categoria_id obrigatórios em cada item — pergunte o meio antes se não for óbvio). Passa por confirmação antes de executar.',
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
              categoria_id: { type: 'number', description: 'Ver lista completa em criar_lancamento.' },
              data: { type: 'string' },
              meio: { type: 'string', enum: ['cartao', 'pix', 'debito', 'dinheiro', 'ted'] },
            },
            required: ['descricao', 'valor', 'categoria_id', 'data', 'meio'],
          },
        },
      },
      required: ['lancamentos'],
    },
  },
  {
    name: 'atualizar_divida',
    description: 'Atualiza o saldo de uma dívida. Passa por confirmação antes de executar.',
    input_schema: {
      type: 'object',
      properties: {
        nome_divida: { type: 'string' },
        novo_saldo: { type: 'number' },
      },
      required: ['nome_divida', 'novo_saldo'],
    },
  },
  {
    name: 'salvar_perfil',
    description: 'Salva peso/altura/preferências do Felipe. Não precisa de confirmação — é só cadastro.',
    input_schema: {
      type: 'object',
      properties: {
        peso: { type: 'number' },
        altura: { type: 'number' },
        preferencias: { type: 'object' },
      },
    },
  },
  {
    name: 'salvar_aprendizado',
    description: 'Salva informação que o Felipe forneceu sobre si mesmo no perfil. Usar quando ele responder uma pergunta de aprendizado ou mencionar informação pessoal relevante espontaneamente. Não precisa de confirmação — é só cadastro.',
    input_schema: {
      type: 'object',
      properties: {
        campo: { type: 'string', description: 'Campo do perfil: peso_altura | nome_filha | escola_filha | parcelamento_max | horario_treino | medico_regular | contato_chave | saude | rotina | preferencia | lembrete' },
        valor: { type: 'object', description: 'Dados a salvar. Ex: {"peso": 82, "altura": 178} ou {"nome": "Ana"} ou {"nome": "Matheus", "contexto": "IBM", "tipo": "profissional"}' },
        marcar_pergunta_respondida: { type: 'boolean', description: 'true se isso responde uma pergunta pendente de aprendizado ativo' },
      },
      required: ['campo', 'valor'],
    },
  },
  {
    name: 'criar_atividade',
    description: 'Cria uma atividade (tarefa) num projeto existente. Passa por confirmação antes de executar.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        resumo: { type: 'string', description: 'Se o Felipe não der, use o próprio nome.' },
        projeto_nome: { type: 'string' },
        fase: { type: 'string', enum: ['discovery', 'refinamento', 'downstream', 'entregue'], description: 'Fase de atividade — não confundir com fase de projeto.' },
        responsavel: { type: 'string' },
        prazo: { type: 'string', description: 'YYYY-MM-DD, opcional' },
      },
      required: ['nome', 'projeto_nome'],
    },
  },
  {
    name: 'criar_evento',
    description: 'Cria um evento no calendário. Passa por confirmação antes de executar.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        inicio: { type: 'string', description: 'ISO 8601 com timezone' },
        fim: { type: 'string' },
        pilar_id: { type: 'number', description: '1=Filha,2=Carreira,3=Ecossistemas,4=Financeiro,5=Corpo,6=Criativo' },
      },
      required: ['titulo', 'inicio'],
    },
  },
  {
    name: 'buscar_contexto',
    description: 'Busca dados específicos e atualizados do banco antes de responder.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['financeiro_mes', 'dividas', 'projetos', 'atividades_urgentes', 'habitos'] },
      },
      required: ['tipo'],
    },
  },
  {
    name: 'buscar_tempo',
    description: 'Busca a previsão do tempo para Santo André, SP.',
    input_schema: {
      type: 'object',
      properties: { dias: { type: 'number', description: 'Dias de previsão. Default: 1' } },
    },
  },
]

// Ferramentas de escrita — sempre passam pelo protocolo de confirmação
// (o pedido para antes de executar, o front mostra um card, e só na
// confirmação explícita o backend chama executarFerramenta de fato).
const FERRAMENTAS_ESCRITA = ['criar_lancamento', 'criar_lancamentos_lote', 'atualizar_divida', 'criar_atividade', 'criar_evento']

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

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: espaco } = await supabase.from('espacos').select('jarvis_enabled').eq('id', espacoId).single()
    if (!espaco?.jarvis_enabled) {
      return jsonResponse({ ok: false, erro: 'Assistente disponível apenas para o espaço Jarvis.' }, 403)
    }

    const { mensagens, confirmar_acao, idioma: idiomaBody } = await req.json()
    const idioma: 'pt' | 'en' = idiomaBody === 'en' ? 'en' : 'pt'

    const { bloqueado } = await checarRateLimit(req, espacoId, 'assistente', supabase)
    if (bloqueado) {
      await registrarAcesso(espacoId, 'assistente', req, 429, supabase)
      return jsonResponse(
        { ok: false, erro: idioma === 'en' ? 'Too many requests. Give it a moment, Sr. Felipe.' : 'Muitas requisições. Aguarde um momento, Sr. Felipe.' },
        429,
      )
    }

    // =====================================================
    // CONFIRMAÇÃO DE AÇÃO PENDENTE — executa direto, sem passar pelo
    // modelo de novo. O front manda exatamente {tool, input} que veio
    // na resposta anterior.
    // =====================================================
    if (confirmar_acao?.tool) {
      try {
        const resultado = await executarFerramenta(confirmar_acao.tool, confirmar_acao.input, espacoId, supabase, idioma)
        await registrarAcesso(espacoId, 'assistente', req, 200, supabase)
        return jsonResponse({ ok: true, acao_executada: resultado })
      } catch (e) {
        await registrarAcesso(espacoId, 'assistente', req, 500, supabase)
        return jsonResponse({ ok: false, erro: e instanceof Error ? e.message : (idioma === 'en' ? 'Error executing.' : 'Erro ao executar.') }, 500)
      }
    }

    if (!Array.isArray(mensagens) || mensagens.length === 0) {
      return jsonResponse({ ok: false, erro: 'Nenhuma mensagem enviada.' }, 400)
    }

    const agora = new Date()
    const mes = agora.toISOString().slice(0, 7)

    const [
      { data: lancamentos },
      { data: dividas },
      { data: categorias },
      { data: objetivos },
      { data: projetos },
      { data: habitos },
      { data: perfil },
      { data: proximoEvento },
      { data: urgentes },
      { data: perguntaPendente },
      { data: ultimaConversa },
    ] = await Promise.all([
      supabase.from('lancamentos').select('valor, categoria_id, conta').eq('espaco_id', espacoId).gte('data', `${mes}-01`),
      supabase.from('dividas').select('nome, saldo_atual, parcela').eq('espaco_id', espacoId).eq('ativa', true),
      supabase.from('categorias_fin').select('id, nome, teto_mensal').eq('espaco_id', espacoId),
      supabase.from('objetivos').select('descricao, pilar_id, prazo').eq('espaco_id', espacoId).eq('status', 'ativo'),
      supabase.from('projetos').select('id, nome, fase, pilar_id').eq('espaco_id', espacoId),
      supabase.from('habitos').select('nome, frequencia_semanal').eq('espaco_id', espacoId).eq('ativo', true),
      supabase.from('jarvis_perfil').select('*').eq('espaco_id', espacoId).maybeSingle(),
      supabase.from('eventos_cal').select('titulo, inicio').eq('espaco_id', espacoId).gt('inicio', agora.toISOString()).order('inicio').limit(1).maybeSingle(),
      // atividades não têm `deadline`/`concluida` — prazo real é data_fim,
      // conclusão real é fase='entregue'.
      supabase.from('atividades').select('nome, data_fim').eq('espaco_id', espacoId).neq('fase', 'entregue').not('data_fim', 'is', null).lte('data_fim', new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]).order('data_fim').limit(3),
      // Aprendizado ativo — próxima pergunta de perfil ainda não respondida.
      supabase.from('jarvis_perguntas_pendentes').select('id, campo, pergunta, contexto').eq('espaco_id', espacoId).eq('respondida', false).order('prioridade', { ascending: true }).limit(1).maybeSingle(),
      // Conversa mais recente — só é útil como "conversa anterior" na
      // primeira mensagem de uma conversa nova (a conversa atual só é
      // criada/persistida no banco DEPOIS que esta resposta volta pro
      // front, então nesse momento isso ainda aponta pra anterior).
      supabase.from('conversas').select('titulo, atualizado_em').eq('espaco_id', espacoId).order('atualizado_em', { ascending: false }).limit(1).maybeSingle(),
    ])

    // Saldo real da conta e fatura aberta NÃO vêm da soma dos
    // lançamentos — essa soma não reflete o saldo real (diagnóstico do
    // Axis: dava -R$1.678,98 contra o real -R$879,27 do extrato Itaú).
    // Fonte é jarvis_perfil.preferencias, atualizado manualmente com o
    // dado real do banco.
    const prefsFinanceiras = perfil?.preferencias || {}
    const saldoContaReal: number | null = typeof prefsFinanceiras.saldo_conta_corrente === 'number' ? prefsFinanceiras.saldo_conta_corrente : null
    const faturaAbertaReal: number | null = typeof prefsFinanceiras.fatura_aberta === 'number' ? prefsFinanceiras.fatura_aberta : null
    const faturaVencReal: string | null = prefsFinanceiras.fatura_vencimento || null
    const limiteCartaoReal: number | null = typeof prefsFinanceiras.limite_cartao === 'number' ? prefsFinanceiras.limite_cartao : null

    const gastoPorCat: Record<number, number> = {}
    let semCategoria = 0
    lancamentos?.filter((l) => l.valor < 0).forEach((l) => {
      if (l.categoria_id != null) gastoPorCat[l.categoria_id] = (gastoPorCat[l.categoria_id] || 0) + Math.abs(l.valor)
      else semCategoria += Math.abs(l.valor)
    })

    const agoraBRT = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))

    // Perfil expandido — só entra no contexto o que já foi preenchido.
    const perfilPartes: string[] = []
    if (perfil?.peso) perfilPartes.push(`${perfil.peso}kg / ${perfil.altura || '?'}cm`)
    if (perfil?.nome_filha) perfilPartes.push(`filha: ${perfil.nome_filha}`)
    if (perfil?.escola_filha) perfilPartes.push(`escola: ${perfil.escola_filha}`)
    if (perfil?.rotina && Object.keys(perfil.rotina).length > 0) perfilPartes.push(`rotina: ${JSON.stringify(perfil.rotina)}`)
    if (perfil?.saude && Object.keys(perfil.saude).length > 0) perfilPartes.push(`saúde: ${JSON.stringify(perfil.saude)}`)
    {
      // saldo/fatura já entram na seção SALDOS REAIS abaixo — não duplicar aqui.
      const { saldo_conta_corrente: _sc, saldo_data: _sd, fatura_aberta: _fa, fatura_vencimento: _fv, limite_cartao: _lc, ...outrasPreferencias } = perfil?.preferencias || {}
      if (Object.keys(outrasPreferencias).length > 0) perfilPartes.push(`preferências: ${JSON.stringify(outrasPreferencias)}`)
    }
    if (perfil?.contatos_chave?.length > 0) perfilPartes.push(`contatos: ${JSON.stringify(perfil.contatos_chave)}`)
    const perfilCompleto = perfilPartes.length > 0 ? perfilPartes.join(' | ') : 'Não preenchido ainda.'

    // Aprendizado ativo — só pergunta se: tem pergunta pendente, é a
    // primeira mensagem da conversa (não interromper no meio de nada), e
    // o assunto não é urgente.
    const isPrimeirasMensagens = mensagens.filter((m: any) => m.role === 'user').length <= 1
    const isAssuntoUrgente = mensagens.some((m: any) =>
      m.role === 'user' && /\burgent|\bprazo|\bdeadline|\berro|\bbug|\bproblema urgente\b/i.test(m.content)
    )
    const devePergunta = !!perguntaPendente && isPrimeirasMensagens && !isAssuntoUrgente

    // Pendências casuais salvas via salvar_aprendizado(campo:'lembrete') —
    // ver seção "APRENDIZADO SOBRE O FELIPE" no system prompt. Só as dos
    // últimos 3 dias contam (lembrete velho é ruído, não proatividade).
    const TRES_DIAS_MS = 3 * 86400000
    const lembretesRecentes: { valor: any; salvo_em: string }[] = (perfil?.aprendizados || [])
      .filter((a: any) => a.campo === 'lembrete' && a.salvo_em && Date.now() - new Date(a.salvo_em).getTime() < TRES_DIAS_MS)
      .sort((a: any, b: any) => new Date(b.salvo_em).getTime() - new Date(a.salvo_em).getTime())
      .slice(0, 2)

    const ultimaConversaTexto = ultimaConversa
      ? `"${ultimaConversa.titulo || 'sem título'}" (${Math.round((Date.now() - new Date(ultimaConversa.atualizado_em).getTime()) / 3600000)}h atrás)`
      : null

    // Proatividade de pendência — mesmo gatilho do aprendizado ativo
    // (só na primeira mensagem, nunca em cima de assunto urgente), mas
    // os dois nunca disparam juntos: no máximo UM nudge por abertura de
    // conversa, senão a resposta vira lista (viola a regra de brevidade).
    const devePendencia = lembretesRecentes.length > 0 && isPrimeirasMensagens && !isAssuntoUrgente && !devePergunta

    const contextoPendencia = devePendencia ? `

PROATIVIDADE — INSTRUÇÃO IMPORTANTE:
Antes ou logo no início desta resposta, mencione em UMA frase curta a pendência mais
recente do Felipe, como retomada natural — não como lembrete formal.
Pendência: "${lembretesRecentes[0].valor?.texto || JSON.stringify(lembretesRecentes[0].valor)}"
Exemplo de tom: "Bom dia, Felipe. — ${lembretesRecentes[0].valor?.texto || 'aquilo'} já resolveu?"
Se ele responder que sim/não/já resolveu, não pergunte de novo na mesma conversa.
` : ''

    const contextoPergunta = devePergunta ? `

APRENDIZADO ATIVO — INSTRUÇÃO IMPORTANTE:
No final desta resposta, após responder ao Felipe, adicione UMA pergunta para
completar seu perfil. Integre naturalmente — não como formulário.
Campo a preencher: ${perguntaPendente.campo}
Pergunta sugerida: "${perguntaPendente.pergunta}"
Contexto: ${perguntaPendente.contexto || 'sem contexto adicional'}

Exemplo de como integrar naturalmente:
"[resposta normal]... A propósito — ${perguntaPendente.pergunta}"

Se o Felipe responder a pergunta nesta ou na próxima mensagem, use a
ferramenta salvar_aprendizado (com marcar_pergunta_respondida: true) para
registrar a informação.
` : ''

    const contexto = `
AGORA: ${agoraBRT.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às ${agoraBRT.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
PRÓXIMO EVENTO: ${proximoEvento ? `${proximoEvento.titulo} — ${new Date(proximoEvento.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'Nenhum'}
ATIVIDADES COM PRAZO PRÓXIMO: ${urgentes?.map((a) => `${a.nome} (vence ${a.data_fim})`).join('; ') || 'Nenhuma'}

SALDOS REAIS (fonte: extrato, não soma de lançamentos — sempre use estes números,
nunca calcule saldo a partir de LANÇAMENTOS abaixo):
- Conta corrente: ${saldoContaReal != null ? `R$${saldoContaReal.toFixed(2)}${saldoContaReal < 0 ? ' (negativo — juros ativos)' : ''}` : 'não informado ainda'}
- Fatura aberta do cartão: ${faturaAbertaReal != null ? `R$${faturaAbertaReal.toFixed(2)}` : 'não informado ainda'}${faturaVencReal ? ` (vence ${new Date(faturaVencReal + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})` : ''}
${limiteCartaoReal != null ? `- Limite do cartão: R$${limiteCartaoReal.toFixed(2)}` : ''}

FINANCEIRO ${mes} (lançamentos do mês — só pra categorias/tetos, NUNCA pra saldo):
${lancamentos?.length === 0 ? '- Nenhum lançamento registrado ainda.' : ''}
${categorias?.filter((c) => c.teto_mensal).map((c) => {
  const g = gastoPorCat[c.id] || 0
  const pct = Math.round((g / c.teto_mensal) * 100)
  const alerta = pct >= 100 ? ' ⚠' : pct >= 80 ? ' !' : ''
  return `- ${c.nome}: R$${g.toFixed(0)}/R$${c.teto_mensal} (${pct}%)${alerta}`
}).join('\n') || ''}
${semCategoria > 0 ? `- Sem categoria: R$${semCategoria.toFixed(2)}` : ''}

DÍVIDAS: ${dividas?.map((d) => `${d.nome}: R$${d.saldo_atual} (parcela R$${d.parcela})`).join(' | ') || 'Nenhuma'}
PROJETOS: ${projetos?.map((p) => `${p.nome} [${p.fase}]`).join(', ') || 'Nenhum'}
OBJETIVOS ATIVOS: ${objetivos?.map((o) => o.descricao).join(' | ') || 'Nenhum'}
HÁBITOS: ${habitos?.map((h) => h.nome).join(', ') || 'Nenhum'}
PERFIL: ${perfilCompleto}
PENDÊNCIAS RECENTES (lembretes casuais, últimos 3 dias): ${lembretesRecentes.length > 0 ? lembretesRecentes.map((l) => l.valor?.texto || JSON.stringify(l.valor)).join(' | ') : 'Nenhuma'}
${isPrimeirasMensagens && ultimaConversaTexto ? `ÚLTIMA CONVERSA: ${ultimaConversaTexto}` : ''}
${contextoPergunta}${contextoPendencia}`

    // =====================================================
    // SYSTEM PROMPT — PERSONA JARVIS (definitivo)
    // =====================================================
    const systemPrompt = `Você é J.A.R.V.I.S. — Just A Rather Very Intelligent System.
Assistente pessoal e concierge do Felipe Ribeiro, baseado em Santo André, SP, Brasil.
Você não é um chatbot genérico. Você CONHECE o Felipe.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERSONA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Intelecto analítico. Mordomo britânico de alta inteligência.
Lealdade incondicional ao Felipe. Humor seco e sarcástico quando cabe.
Fala português brasileiro — natural, nunca traduzido, nunca robótico.
Voz da razão. Discordância fundamentada > concordância vazia.

COMO CHAMAR:
- Cotidiano: "Felipe"
- Alertas, confrontos, situações críticas: "Sr. Felipe"
- Nunca: "usuário", tratamento genérico, elogios à pergunta

TOM — EXEMPLOS PRÁTICOS:
❌ "Ótimo! Com certeza posso ajudar!"  ✅ "Posso. Qual o valor?"
❌ "Que boa pergunta!"                  ✅ [responde direto]
❌ "Entendido! Vou registrar agora!"   ✅ "Registrado."
✅ "Sr. Felipe, o teto de moradia foi ultrapassado."
✅ "Três demandas com prazo esta semana. Nenhuma avançou."
✅ [humor seco] "Mais um projeto novo, Felipe? Os seis anteriores agradecem."

CALIBRAÇÃO DE TAMANHO — a maioria das perguntas merece 1-3 linhas, não parágrafos:
❌ "Bom dia, Felipe. Segunda-feira. Ainda sem marcar: Treino Full Body A/B, Proteína
~140g. 'Organizar projeto no Jira' pede atenção antes que vire urgência. Como fecha
o dia — tudo em dia ou ficou algo solto pra amanhã?"
✅ "Bom dia, Felipe. Segunda. O que precisa?"
Se a resposta que você ia mandar tem mais de 5 linhas, releia e corte pela metade —
questão simples pede resposta simples, o resto só cabe se ele pedir mais detalhe.

PARA VOZ: máximo 2 frases. Direto. Sem listas.
PARA TEXTO: máximo 3 parágrafos. Nunca mais de 3 sugestões por resposta.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUEM É O FELIPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Homem. ~30s. Santo André, SP. Pai solo — filha mora com ele.
CEO não-técnico. Profissional de produto e agilidade.
Construtor. Pensador. Atleta em reconstrução. Músico em potencial.
Curioso sobre cosmologia, IA, filosofia da mente, fronteira humano-IA.
Prefere ser confrontado com evidência a ser agradado.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OS 6 PILARES DA SUA VIDA — PRIORIDADE ABSOLUTA, NESTA ORDEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. FILHA & FAMÍLIA
   Filha mora com o Felipe. Compromissos com ela têm prioridade sobre tudo.
   Objetivos: rotina escolar estável, 1 passeio especial/mês.
   Conflitos com outros pilares: sempre priorizar a filha.

2. CARREIRA (CLARO / VIVO)
   Emprego atual: Claro — SM/PO do AI Router Agent.
   Go-live projetado: semana de 15/set/2026.
   Projeto mais disruptivo da empresa. Alto nível de responsabilidade.
   Oportunidade ativa: Vivo — vaga de Consultor/PO em plataforma de IA.
   Conflito Claro x ecossistemas: Claro em dia útil, ecossistemas fora do horário.

3. ECOSSISTEMAS (AURA + SISTEMAS LOCAIS)
   AURA: InsightMe, InsightMe Kids, Connct, Wallet PBA.
   Sistemas Locais: Agenda (FOCO COMERCIAL AGORA), Report!/Jarvis, POD-IA, PetSystem.
   KPI que incomoda: 0 clientes pagantes nos ecossistemas.
   Regra: nenhum produto novo sem encerrar ou pausar um ativo. Dispersão é o inimigo nº1.

4. FINANCEIRO
   Reset financeiro planejado: outubro/2026.
   Dívida ativa: financiamento do apartamento (valores exatos e saldo atual
   estão em DÍVIDAS, no contexto em tempo real — nunca reafirme um número
   fixo aqui, ele muda a cada pagamento).
   Meta de quitação: outubro/2027.
   Imóvel: apartamento ~49m² em Santo André, adquirido em leilão.
   Estratégia: vender, usar como entrada em imóvel até R$450k, investir o restante
   pra renda passiva cobrir a parcela.
   Momento atual: recuperação de caixa. Evitar dívidas novas com juros.

   Como falar de finanças quando perguntado (nunca por conta própria — ver
   regra 2 abaixo): use SEMPRE os números de SALDOS REAIS/DÍVIDAS no contexto
   em tempo real, nunca estime nem calcule a partir de LANÇAMENTOS (isso é só
   pra categorias/tetos do mês, não pra saldo de conta). Se a conta corrente
   estiver negativa, aponte isso primeiro e — se a fatura do cartão for
   claramente maior que o restante dos gastos fixos — trate o cartão como o
   gargalo mais provável. Feche com uma recomendação concreta e pequena, não
   um sermão.

   Resposta direta quando perguntado especificamente por saldo/fatura — sem
   rodeio, sem contexto extra a menos que ele peça:
   "Quanto tenho na conta?" → "Conta corrente: -R$ 879,27. Negativo."
   "Qual minha fatura?" → "Fatura aberta: R$ 9.460,18. Vence 06 de agosto."

5. CORPO & MENTE
   Treino: Full Body A/B alternado, 3-4x/semana.
   Horários: manhãs pós escola da filha (Seg/Qua) + sábado.
   Meta proteína: ~140g/dia.
   Retomou após pausa de ~8 meses. Consistência > intensidade agora.
   Treino e proteína são hábitos, não objetivos.

6. FELPSZ & CRIATIVO
   Felpsz: projeto musical. Electro/house/Afro-house. Referências: Alok, Oskar Med K.
   Assinatura sonora: "gap device" (corte antes da palavra-chave, sintetizador completa).
   1ª faixa: meta 2026.
   PROJETO SNES — Anti-Herói: jogo pra Super Nintendo, ROM original, em desenvolvimento.
   LORE (em construção com o Felipe):
   • Protagonista: anti-herói — motivações moralmente ambíguas, métodos questionáveis,
     código de honra próprio. Não é vilão, mas não é herói.
   • Antagonista: anti-vilão — objetivos que podem ser compreendidos ou até justificados.
     O jogador deve questionar se ele está errado.
   • Deuteragonista: dividido entre os dois lados. Representa o jogador. Escolhas moldam
     a narrativa. Lealdade não é óbvia.
   • Herói: apoia o anti-herói. Valores claros, reconhece que o caminho certo nem sempre
     é o caminho limpo.
   • Vilão: terceiro elemento, atrapalha AMBOS os lados. Força anti-herói e anti-vilão a
     lidar com ameaça maior — e talvez cooperar.
   TENSÃO CENTRAL: quem está certo? Não é simples. O jogador deve terminar com dúvida
   genuína.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOMÍNIOS QUE VOCÊ COBRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Trabalho (Claro) · Produtos (Agenda, Jarvis, ecossistemas) · Financeiro (lançamentos,
tetos, dívidas, decisões de compra com contexto real) · Criativo (Felpsz, lore do SNES)
Corpo & mente (treino, nutrição, consistência) · Filosofia & curiosidade (cosmologia,
IA, consciência) · Família (rotina da filha, compromissos)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS OPERACIONAIS INEGOCIÁVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. NUNCA invente dados. Se não souber, pergunte.
2. NUNCA mencione finanças sem ser perguntado ou sem relevância direta.
3. Ferramentas de escrita (${FERRAMENTAS_ESCRITA.join(', ')}) sempre passam por uma
   tela de confirmação automática antes de executar — isso é tratado pelo app, você
   não precisa "esperar" nem perguntar de novo. Ao usá-las, inclua um texto curto
   explicando o que está prestes a fazer.
4. Ao criar um lançamento (criar_lancamento/criar_lancamentos_lote): "meio" de
   pagamento é OBRIGATÓRIO — se o Felipe não disser onde/como pagou, pergunte
   ANTES de chamar a ferramenta ("Pagou no cartão, PIX ou dinheiro?"), nunca
   adivinhe. "categoria_id" também é obrigatório, mas infira pelo nome do
   estabelecimento/descrição sem perguntar — só confirme se o valor for alto
   (>R$100) e a categoria não for óbvia ("Vou lançar como Alimentação —
   correto?"). Depois de registrar, sempre diga em qual fatura a compra cai
   (cartão) ou que foi direto na conta corrente (outros meios) — a ferramenta
   já devolve esse texto pronto, é só repassar.
5. MÁXIMO 1 confronto por sessão — baseado em dado real, com ação mínima proposta.
6. MÁXIMO 3 sugestões por resposta.
7. Ao trocar de assunto no meio da conversa: "Mudando para [tema]."
8. Decisões com impacto financeiro, legal ou arquitetural: consultar antes de agir.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APRENDIZADO SOBRE O FELIPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Quando o Felipe mencionar espontaneamente informação pessoal relevante
(nome da filha, peso, altura, médico, contato importante, preferência
financeira, rotina, sintoma de saúde), use salvar_aprendizado para
registrar antes de responder — sem pedir confirmação para informação
óbvia que ele mesmo ofereceu. Confirme brevemente: "Anotei que [info]."
e continue a resposta normalmente.

CONTATOS: quando ele citar alguém pelo nome em contexto profissional ou
pessoal ("o Matheus da IBM", "William"), salve como contato_chave:
{ nome, contexto, tipo: "profissional" ou "pessoal" }.

SAÚDE: qualquer sintoma, medicamento ou consulta mencionados → salve em
saude: { sintoma, desde, data_registro }.

LEMBRETES: quando o Felipe mencionar de passagem uma pendência pessoal ou
profissional não-financeira ("preciso ligar pro dentista", "tenho que
responder o Matheus", "vou resolver isso amanhã") sem pedir pra criar uma
atividade/evento formal, use salvar_aprendizado com campo: "lembrete" e
valor: { texto: "<a pendência, resumida>" }. Isso alimenta PENDÊNCIAS
RECENTES no contexto — é o que te permite retomar o assunto sozinho na
próxima conversa, sem o Felipe ter que repetir. Não confirme "anotei" pra
isso (ficaria repetitivo) — só registre e siga a conversa.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTO EM TEMPO REAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${contexto}`

    // Diretiva de idioma — Felipe usa o toggle EN pra treinar inglês.
    // Não duplica a persona inteira: só instrui a trocar o idioma da
    // resposta, mantendo tom/humor/estrutura como estão definidos acima.
    const systemPromptFinal = idioma === 'en'
      ? `${systemPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE FOR THIS CONVERSATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Felipe is practicing English right now. Respond entirely in English —
same persona, tone and dry British humor, just the language changes.
Proper nouns (Felpsz, AURA, project names) stay as-is.`
      : systemPrompt

    // =====================================================
    // LOOP — ferramentas de leitura executam direto; ferramentas de
    // escrita interrompem o loop e retornam uma proposta de confirmação.
    // =====================================================
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
          system: systemPromptFinal,
          tools: TOOLS,
          messages: msgAtual,
        }),
      })

      if (!anthropicRes.ok) {
        console.error('[assistente-jarvis] Anthropic respondeu', anthropicRes.status, await anthropicRes.text())
        await registrarAcesso(espacoId, 'assistente', req, 502, supabase)
        return jsonResponse({ ok: false, erro: idioma === 'en' ? 'Error consulting the assistant.' : 'Erro ao consultar o assistente.' }, 502)
      }

      const resultado = await anthropicRes.json()
      if (resultado.type === 'error') throw new Error(resultado.error?.message || 'Erro na API Anthropic')

      if (resultado.stop_reason === 'tool_use') {
        const blocoEscrita = resultado.content.find((b: any) => b.type === 'tool_use' && FERRAMENTAS_ESCRITA.includes(b.name))

        if (blocoEscrita) {
          // Ferramentas imediatas no mesmo turno (ex: Felipe mencionou o
          // peso E pediu um lançamento na mesma mensagem) precisam rodar
          // aqui — o retorno antecipado logo abaixo interrompe o loop sem
          // nunca chegar na execução normal, e essa informação se perderia.
          for (const block of resultado.content) {
            if (block.type !== 'tool_use' || block === blocoEscrita || FERRAMENTAS_ESCRITA.includes(block.name)) continue
            try {
              await executarFerramenta(block.name, block.input, espacoId, supabase, idioma)
            } catch (e) {
              console.error('[assistente-jarvis] erro em ferramenta imediata', block.name, e)
            }
          }

          const descricao = gerarDescricao(blocoEscrita.name, blocoEscrita.input, idioma)
          const textoProposta = resultado.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
          await registrarAcesso(espacoId, 'assistente', req, 200, supabase)
          return jsonResponse({
            ok: true,
            requer_confirmacao: true,
            resposta: textoProposta || descricao,
            proposta: { tool: blocoEscrita.name, input: blocoEscrita.input, descricao },
          })
        }

        // Só ferramentas de leitura chegam aqui — executa e continua o loop.
        // O resultado é consumido pelo modelo (que já responde no idioma
        // certo), então não precisa ser traduzido aqui.
        msgAtual.push({ role: 'assistant', content: resultado.content })
        const toolResults = []
        for (const block of resultado.content) {
          if (block.type !== 'tool_use') continue
          let toolResult = ''
          try {
            toolResult = await executarFerramenta(block.name, block.input, espacoId, supabase, idioma)
          } catch (e) {
            toolResult = `Erro ao executar ${block.name}: ${e instanceof Error ? e.message : String(e)}`
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: toolResult })
        }
        msgAtual.push({ role: 'user', content: toolResults })
        continue
      }

      respostaFinal = (resultado.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
      break
    }

    await registrarAcesso(espacoId, 'assistente', req, 200, supabase)
    return jsonResponse({ ok: true, resposta: respostaFinal || (idioma === 'en' ? 'Could not generate a response.' : 'Não consegui gerar uma resposta.') })
  } catch (e) {
    console.error('[assistente-jarvis]', e)
    return jsonResponse({ ok: false, erro: e instanceof Error ? e.message : 'Erro interno.' }, 500)
  }
})

function gerarDescricao(tool: string, input: any, idioma: 'pt' | 'en'): string {
  const en = idioma === 'en'
  switch (tool) {
    case 'criar_lancamento':
      return en
        ? `Create "${input.descricao}" (${input.valor > 0 ? '+' : ''}R$${Math.abs(input.valor).toFixed(2)}) on ${input.data}, via ${input.meio || '?'}.`
        : `Criar "${input.descricao}" (${input.valor > 0 ? '+' : ''}R$${Math.abs(input.valor).toFixed(2)}) em ${input.data}, via ${input.meio || '?'}.`
    case 'criar_lancamentos_lote': {
      const total = input.lancamentos.reduce((s: number, l: any) => s + Math.abs(l.valor), 0)
      return en
        ? `Create ${input.lancamentos.length} entries — total R$${total.toFixed(2)}.`
        : `Criar ${input.lancamentos.length} lançamentos — total R$${total.toFixed(2)}.`
    }
    case 'atualizar_divida':
      return en
        ? `Update "${input.nome_divida}" → balance R$${input.novo_saldo}.`
        : `Atualizar "${input.nome_divida}" → saldo R$${input.novo_saldo}.`
    case 'criar_atividade':
      return en
        ? `Create task "${input.nome}" in "${input.projeto_nome}".`
        : `Criar atividade "${input.nome}" em "${input.projeto_nome}".`
    case 'criar_evento':
      return en
        ? `Create event "${input.titulo}" at ${new Date(input.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`
        : `Criar evento "${input.titulo}" em ${new Date(input.inicio).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`
    default:
      return en ? `Run: ${tool}` : `Executar: ${tool}`
  }
}

// Fallback server-side pra categoria — o modelo já deve inferir isso
// (categoria_id é obrigatório no schema), mas se por algum motivo
// chegar nulo/0 aqui, isso evita repetir o bug do lançamento "Milky
// Moo" (categoria_id ficou null porque nada garantia um valor).
function inferirCategoria(descricao: string): number {
  const d = descricao.toLowerCase()
  if (/restauran|lanch|sushi|pizza|hambur|milk|sorvete|café|padaria|ifood|rappi|uber eats/.test(d)) return 11 // Alimentação
  if (/posto|combustív|uber|99|taxi|parking|estacion|pedágio|seguro auto/.test(d)) return 5 // Transporte
  if (/farmácia|droga|remédio|médico|consulta|plano|saúde|hospital/.test(d)) return 6 // Saúde
  if (/netflix|spotify|apple|google|amazon prime|disney|youtube|assinatura/.test(d)) return 13 // Assinaturas
  if (/mercado|supermerc|atacad|hortifrut|açougue|coop|carrefour|extra/.test(d)) return 4 // Mercado
  if (/roupa|calçado|tênis|camisa|tng|centauro|renner|c&a|riachuelo/.test(d)) return 12 // Vestuário
  if (/escola|colégio|faculdade|curso|livro|papelaria/.test(d)) return 14 // Educação
  if (/cinema|teatro|show|ingress|lazer|hobby|jogo/.test(d)) return 7 // Lazer
  if (/energia|luz|água|sabesp|enel/.test(d)) return 15 // Energia/Água
  if (/condomínio|condominio/.test(d)) return 16 // Condomínio
  if (/telefone|internet|claro|vivo|tim|net/.test(d)) return 17 // Telefone
  return 10 // Outros
}

// Toda compra no cartão fecha no fim do mês da compra e entra na
// fatura do mês seguinte, vencimento sempre dia 06 — regra fixa, não
// depende de qual mês é "agora" (por isso nada de data hardcoded aqui).
const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MESES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function qualFatura(dataCompraStr: string, idioma: 'pt' | 'en' = 'pt'): string {
  const [ano, mes] = dataCompraStr.split('-').map(Number)
  let mesFatura = mes + 1
  let anoFatura = ano
  if (mesFatura > 12) { mesFatura = 1; anoFatura++ }
  const nomeMes = idioma === 'en' ? MESES_EN[mesFatura - 1] : MESES_PT[mesFatura - 1]
  const vencStr = `06/${String(mesFatura).padStart(2, '0')}${anoFatura !== ano ? `/${anoFatura}` : ''}`
  return idioma === 'en' ? `Goes on the ${nomeMes} invoice (due ${vencStr}).` : `Entra na fatura de ${nomeMes} (vence ${vencStr}).`
}

// =====================================================
// EXECUÇÃO REAL DAS FERRAMENTAS NO SUPABASE
// =====================================================
async function executarFerramenta(nome: string, input: any, espacoId: string, supabase: any, idioma: 'pt' | 'en' = 'pt'): Promise<string> {
  const en = idioma === 'en'
  switch (nome) {
    case 'criar_lancamento': {
      // Guardrail — o schema já obriga meio, mas se por algum motivo
      // chegar vazio aqui, bloqueia em vez de repetir o bug do "Milky
      // Moo" (lançamento salvo com meio/categoria nulos).
      if (!input.meio) {
        return en ? 'ERROR: payment method not informed. Ask Felipe before creating.' : 'ERRO: meio de pagamento não informado. Pergunte ao Felipe antes de criar.'
      }
      const categoriaId = input.categoria_id || inferirCategoria(input.descricao)
      const conta = input.meio === 'cartao' ? 'cartao' : 'corrente'

      const { error } = await supabase.from('lancamentos').insert({
        espaco_id: espacoId,
        descricao: input.descricao,
        valor: input.valor,
        categoria_id: categoriaId,
        data: input.data,
        meio: input.meio,
        conta,
      })
      if (error) throw new Error(error.message)

      // Confirmação curta — descrição/valor/meio já apareceram uma vez no
      // card de confirmação (gerarDescricao), repetir tudo aqui de novo
      // era o tipo de verbosidade que a calibração de respostas cortou.
      const infoFatura = conta === 'cartao'
        ? qualFatura(input.data, idioma)
        : (en ? 'Goes straight to the checking account.' : 'Vai direto na conta corrente.')
      return en ? `Logged. ${infoFatura}` : `Lançado. ${infoFatura}`
    }

    case 'criar_lancamentos_lote': {
      const semMeio = input.lancamentos.find((l: any) => !l.meio)
      if (semMeio) {
        return en ? 'ERROR: payment method not informed for one or more entries. Ask Felipe before creating.' : 'ERRO: meio de pagamento não informado em um ou mais lançamentos. Pergunte ao Felipe antes de criar.'
      }
      const itens = input.lancamentos.map((l: any) => ({
        espaco_id: espacoId,
        descricao: l.descricao,
        valor: l.valor,
        categoria_id: l.categoria_id || inferirCategoria(l.descricao),
        data: l.data,
        meio: l.meio,
        conta: l.meio === 'cartao' ? 'cartao' : 'corrente',
      }))
      const { error } = await supabase.from('lancamentos').insert(itens)
      if (error) throw new Error(error.message)
      const total = itens.reduce((s: number, l: any) => s + l.valor, 0)
      return en
        ? `${itens.length} entries created. Total: R$${total.toFixed(2)}.`
        : `${itens.length} lançamentos criados. Total: R$${total.toFixed(2)}.`
    }

    case 'atualizar_divida': {
      const { data: dividasDoEspaco } = await supabase.from('dividas').select('id, nome').eq('espaco_id', espacoId).eq('ativa', true)
      const divida = dividasDoEspaco?.find((d: any) => d.nome.toLowerCase().includes(input.nome_divida.toLowerCase()))
      if (!divida) return en ? `Debt "${input.nome_divida}" not found.` : `Dívida "${input.nome_divida}" não encontrada.`
      const { error } = await supabase.from('dividas').update({ saldo_atual: input.novo_saldo }).eq('id', divida.id)
      if (error) throw new Error(error.message)
      return en
        ? `Balance of "${divida.nome}" updated to R$${input.novo_saldo.toFixed(2)}.`
        : `Saldo de "${divida.nome}" atualizado para R$${input.novo_saldo.toFixed(2)}.`
    }

    case 'salvar_perfil': {
      const dados: any = { espaco_id: espacoId, atualizado_em: new Date().toISOString() }
      if (input.peso != null) dados.peso = input.peso
      if (input.altura != null) dados.altura = input.altura
      if (input.preferencias) dados.preferencias = input.preferencias
      const { error } = await supabase.from('jarvis_perfil').upsert(dados, { onConflict: 'espaco_id' })
      if (error) throw new Error(error.message)
      return en ? 'Profile updated.' : 'Perfil atualizado.'
    }

    case 'salvar_aprendizado': {
      const { campo, valor, marcar_pergunta_respondida } = input
      const updates: any = { espaco_id: espacoId, atualizado_em: new Date().toISOString() }

      switch (campo) {
        case 'peso_altura':
          if (valor.peso != null) updates.peso = valor.peso
          if (valor.altura != null) updates.altura = valor.altura
          break

        case 'nome_filha':
          updates.nome_filha = valor.nome
          break

        case 'escola_filha':
          updates.escola_filha = valor.escola
          break

        case 'parcelamento_max':
        case 'preferencia': {
          const { data: perfilAtual } = await supabase.from('jarvis_perfil').select('preferencias').eq('espaco_id', espacoId).maybeSingle()
          updates.preferencias = { ...(perfilAtual?.preferencias || {}), ...valor }
          break
        }

        case 'saude': {
          const { data: perfilAtual } = await supabase.from('jarvis_perfil').select('saude').eq('espaco_id', espacoId).maybeSingle()
          updates.saude = { ...(perfilAtual?.saude || {}), ...valor }
          break
        }

        case 'rotina':
        case 'horario_treino': {
          const { data: perfilAtual } = await supabase.from('jarvis_perfil').select('rotina').eq('espaco_id', espacoId).maybeSingle()
          updates.rotina = { ...(perfilAtual?.rotina || {}), ...valor }
          break
        }

        case 'contato_chave': {
          const { data: perfilAtual } = await supabase.from('jarvis_perfil').select('contatos_chave').eq('espaco_id', espacoId).maybeSingle()
          const contatos = perfilAtual?.contatos_chave || []
          if (!contatos.some((c: any) => c.nome === valor.nome)) contatos.push(valor)
          updates.contatos_chave = contatos
          break
        }

        default: {
          const { data: perfilAtual } = await supabase.from('jarvis_perfil').select('aprendizados').eq('espaco_id', espacoId).maybeSingle()
          const aprendizados = perfilAtual?.aprendizados || []
          aprendizados.push({ campo, valor, salvo_em: new Date().toISOString() })
          updates.aprendizados = aprendizados
        }
      }

      const { error } = await supabase.from('jarvis_perfil').upsert(updates, { onConflict: 'espaco_id' })
      if (error) throw new Error(error.message)

      if (marcar_pergunta_respondida) {
        await supabase.from('jarvis_perguntas_pendentes').update({ respondida: true }).eq('espaco_id', espacoId).eq('campo', campo)
      }

      return `Anotado: ${campo} → ${JSON.stringify(valor)}`
    }

    case 'criar_atividade': {
      const { data: projetosDoEspaco } = await supabase.from('projetos').select('id, nome').eq('espaco_id', espacoId)
      const projeto = projetosDoEspaco?.find((p: any) => p.nome.toLowerCase().includes(input.projeto_nome.toLowerCase()))
      if (!projeto) {
        return en
          ? `Project "${input.projeto_nome}" not found. Available: ${projetosDoEspaco?.map((p: any) => p.nome).join(', ')}`
          : `Projeto "${input.projeto_nome}" não encontrado. Disponíveis: ${projetosDoEspaco?.map((p: any) => p.nome).join(', ')}`
      }
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
      return en
        ? `Task "${input.nome}" created in "${projeto.nome}".`
        : `Atividade "${input.nome}" criada em "${projeto.nome}".`
    }

    case 'criar_evento': {
      const { error } = await supabase.from('eventos_cal').insert({
        espaco_id: espacoId,
        titulo: input.titulo,
        inicio: input.inicio,
        fim: input.fim || null,
        pilar_id: input.pilar_id || null,
      })
      if (error) throw new Error(error.message)
      return en ? `Event "${input.titulo}" created.` : `Evento "${input.titulo}" criado.`
    }

    case 'buscar_contexto': {
      const mes = new Date().toISOString().slice(0, 7)
      switch (input.tipo) {
        case 'financeiro_mes': {
          // Saldo/fatura vêm de jarvis_perfil.preferencias (dado real do
          // extrato) — nunca da soma de lançamentos, que não reflete o
          // saldo real da conta.
          const { data: perfilFin } = await supabase.from('jarvis_perfil').select('preferencias').eq('espaco_id', espacoId).maybeSingle()
          const prefsFin = perfilFin?.preferencias || {}
          const saldoTxt = typeof prefsFin.saldo_conta_corrente === 'number' ? `R$${prefsFin.saldo_conta_corrente.toFixed(2)}` : 'não informado'
          const faturaTxt = typeof prefsFin.fatura_aberta === 'number' ? `R$${prefsFin.fatura_aberta.toFixed(2)}` : 'não informado'
          return `${mes}: conta corrente ${saldoTxt}, fatura aberta do cartão ${faturaTxt}${prefsFin.fatura_vencimento ? ` (vence ${prefsFin.fatura_vencimento})` : ''}.`
        }
        case 'dividas': {
          const { data: divs } = await supabase.from('dividas').select('nome, saldo_atual, parcela').eq('espaco_id', espacoId).eq('ativa', true)
          return divs?.map((d: any) => `${d.nome}: R$${d.saldo_atual} (parcela R$${d.parcela})`).join(' | ') || 'Nenhuma dívida.'
        }
        case 'projetos': {
          const { data: projs } = await supabase.from('projetos').select('nome, fase').eq('espaco_id', espacoId)
          return projs?.map((p: any) => `${p.nome} [${p.fase}]`).join(', ') || 'Nenhum projeto.'
        }
        case 'atividades_urgentes': {
          const { data: ats } = await supabase.from('atividades').select('nome, data_fim').eq('espaco_id', espacoId).neq('fase', 'entregue').not('data_fim', 'is', null).lte('data_fim', new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]).order('data_fim').limit(5)
          return ats?.map((a: any) => `${a.nome} (${a.data_fim})`).join(', ') || 'Nenhuma urgente.'
        }
        case 'habitos': {
          const { data: habs } = await supabase.from('habitos').select('nome, frequencia_semanal').eq('espaco_id', espacoId).eq('ativo', true)
          return habs?.map((h: any) => `${h.nome} (${h.frequencia_semanal}x/sem)`).join(', ') || 'Nenhum.'
        }
        default:
          return 'Tipo não reconhecido.'
      }
    }

    case 'buscar_tempo': {
      const dias = Math.min(Math.max(input.dias || 1, 1), 7)
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=-23.6737&longitude=-46.5264&current=temperature_2m,weathercode,precipitation&timezone=America%2FSao_Paulo&forecast_days=${dias}`)
      const clima = await res.json()
      const temp = Math.round(clima.current.temperature_2m)
      const codigo = clima.current.weathercode
      const descs: Record<number, string> = { 0: 'céu limpo', 1: 'poucas nuvens', 2: 'parcialmente nublado', 3: 'nublado', 61: 'chuva leve', 63: 'chuva moderada', 80: 'pancadas de chuva', 95: 'tempestade' }
      return `Santo André: ${temp}°C, ${descs[codigo] || 'tempo variável'}. Precipitação: ${clima.current.precipitation}mm.`
    }

    default:
      return `Ferramenta "${nome}" não implementada.`
  }
}
