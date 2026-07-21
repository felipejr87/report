import { useState, useRef, useEffect, useCallback } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Mic, Square, ArrowUp, History, Plus, X, Volume2, Volume1, VolumeX, Zap, Check, Umbrella } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { supabaseEspaco, urlFuncao } from '../lib/supabase'
import { useVoz, useFala } from '../hooks/useVoz'
import Header from '../components/Header'
import TabBar from '../components/jarvis/TabBar'
import IndicadorFala from '../components/jarvis/IndicadorFala'

const CHAVE_VOZ_AUTO = 'jarvis_voz_auto'

function renderMsg(texto) {
  return texto
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

// Frases curtas, tom J.A.R.V.I.S. — diretas, sem clichê de pôster
// motivacional. Uma por período, sorteada a cada nova conversa.
const FRASES_MOTIVACIONAIS = {
  manha: [
    'O dia começa agora — o resto é execução.',
    'Prioridade clara vale mais que agenda cheia.',
    'Um problema resolvido hoje não some, mas para de crescer.',
    'Menos abas abertas, mais coisa entregue.',
    'Disciplina de hoje é o resultado de outubro.',
  ],
  tarde: [
    'Metade do caminho andado. Segue no ritmo.',
    'Ajusta a rota, não precisa recomeçar.',
    'O que já rendeu, rendeu. Próximo passo.',
    'Sem pressa, sem parar.',
    'Tarde de continuar, não de justificar.',
  ],
  noite: [
    'O dia não precisa ser perfeito pra ter valido.',
    'Fechar bem hoje abre bem amanhã.',
    'Descansar é parte do plano, não desvio dele.',
    'O que não foi feito espera. Você, não.',
    'Silêncio agora, retomada amanhã.',
  ],
}

function frase(periodo) {
  const opcoes = FRASES_MOTIVACIONAIS[periodo]
  return opcoes[Math.floor(Math.random() * opcoes.length)]
}

function periodoDe(saudacao) {
  if (saudacao === 'Bom dia') return 'manha'
  if (saudacao === 'Boa tarde') return 'tarde'
  return 'noite'
}

function horaEvento(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

// Constrói a saudação inicial usando o briefing (clima/agenda/atividades)
// já carregado — conteúdo muda de peso conforme o período do dia:
// manhã = digest completo, tarde = leve, noite = sugestões + fechamento.
function montarSaudacao(dados) {
  const agoraFallback = new Date().getHours()
  if (!dados) {
    const saud = agoraFallback < 12 ? 'Bom dia' : agoraFallback < 18 ? 'Boa tarde' : 'Boa noite'
    return `${saud}, Felipe. O que precisa?`
  }

  const periodo = periodoDe(dados.saudacao)
  const dia = dados.diaSemana.charAt(0).toUpperCase() + dados.diaSemana.slice(1)
  const linhas = [`${dados.saudacao}, Felipe. ${dia}, ${dados.hora}.`]

  if (periodo === 'manha') {
    if (dados.tempo) {
      const chuva = dados.tempo.probChuva > 40 ? ` — ${dados.tempo.probChuva}% de chance de chuva` : ''
      linhas.push(`${dados.tempo.temp}°C, ${dados.tempo.descricao}${chuva}.`)
    }
    linhas.push(
      dados.eventosHoje.length > 0
        ? `Agenda: ${dados.eventosHoje.slice(0, 3).map((e) => `${horaEvento(e.inicio)} ${e.titulo}`).join('; ')}.`
        : 'Agenda livre hoje.'
    )
    if (dados.urgentes.length > 0) {
      linhas.push(`Prioridade: "${dados.urgentes[0].nome}" vence em breve.`)
    } else if (dados.paradas.length > 0) {
      linhas.push(`"${dados.paradas[0].nome}" está parada há dias — vale um empurrão.`)
    }
    linhas.push(frase('manha'))
    linhas.push('O que precisa?')
  } else if (periodo === 'tarde') {
    const proximo = dados.eventosHoje.find((e) => new Date(e.inicio) > new Date())
    if (proximo) linhas.push(`Próximo compromisso: ${proximo.titulo} às ${horaEvento(proximo.inicio)}.`)
    linhas.push(frase('tarde'))
    linhas.push('O que precisa?')
  } else {
    if (dados.habitosPendentes.length > 0) {
      linhas.push(`Ainda sem marcar: ${dados.habitosPendentes.slice(0, 2).map((h) => h.nome).join(', ')}.`)
    }
    if (dados.urgentes.length > 0) linhas.push(`Amanhã: "${dados.urgentes[0].nome}" tem prioridade.`)
    if (dados.paradas.length > 0) linhas.push(`"${dados.paradas[0].nome}" pede atenção antes que vire urgência.`)
    linhas.push(frase('noite'))
    linhas.push('Como fecha o dia — tudo em dia ou ficou algo solto pra amanhã?')
  }

  return linhas.join('\n')
}

export default function JarvisHome() {
  const { sessao, sair } = useAuth()
  const toast = useToast()
  const [conversas, setConversas] = useState([])
  const [conversaId, setConversaId] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const [vozAutomatica, setVozAutomatica] = useState(() => localStorage.getItem(CHAVE_VOZ_AUTO) === 'true')
  const [acaoPendente, setAcaoPendente] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [briefing, setBriefing] = useState(null)
  const rodapeRef = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const msgInicialEnviada = useRef(false)

  const { falar, pararFala, falando, suportado: falaSuportada, desbloquear } = useFala()

  function toggleVozAutomatica() {
    const novo = !vozAutomatica
    setVozAutomatica(novo)
    localStorage.setItem(CHAVE_VOZ_AUTO, String(novo))
    if (novo) desbloquear()
    else pararFala()
  }

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const carregarBriefing = useCallback(async () => {
    if (!sessao) return null
    try {
      const res = await fetch(urlFuncao('jarvis-briefing'), { headers: { Authorization: `Bearer ${sessao.token}` } })
      const data = await res.json()
      if (data.ok) { setBriefing(data); return data }
      return null
    } catch (e) {
      console.warn('[jarvis-briefing]', e)
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  const carregarConversas = useCallback(async () => {
    if (!cliente) return
    const { data } = await cliente.from('conversas').select('id, titulo, atualizado_em').order('atualizado_em', { ascending: false }).limit(20)
    setConversas(data || [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  const novaConversa = useCallback(async () => {
    if (!cliente) return
    setConversaId(null)
    setMostrarHistorico(false)
    setAcaoPendente(null)

    const dados = await carregarBriefing()
    setMensagens([{ role: 'assistant', content: montarSaudacao(dados) }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token, carregarBriefing])

  useEffect(() => { carregarConversas(); novaConversa() }, [carregarConversas, novaConversa])
  useEffect(() => { rodapeRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens, acaoPendente])

  // Suporta /jarvis?msg=... (usado pelas sugestões da aba Vida)
  useEffect(() => {
    const msg = searchParams.get('msg')
    if (msg && mensagens.length > 0 && !msgInicialEnviada.current) {
      msgInicialEnviada.current = true
      setSearchParams({}, { replace: true })
      enviar(msg)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensagens, searchParams])

  if (!sessao) return <Navigate to="/" replace />

  async function carregarConversa(id) {
    setConversaId(id)
    setMostrarHistorico(false)
    setAcaoPendente(null)
    const { data } = await cliente.from('conversa_mensagens').select('role, content, criado_em').eq('conversa_id', id).order('criado_em')
    setMensagens((data || []).map((m) => ({ role: m.role, content: m.content })))
  }

  async function persistirConversa(historico, primeiroTextoUsuario, qtdNovas = 2) {
    let convId = conversaId

    if (!convId) {
      const titulo = primeiroTextoUsuario.slice(0, 60) + (primeiroTextoUsuario.length > 60 ? '...' : '')
      const { data: nova, error } = await cliente
        .from('conversas')
        .insert({ espaco_id: sessao.espaco.id, titulo, atualizado_em: new Date().toISOString() })
        .select()
        .single()
      if (error) { toast?.erro(error.message); return }
      convId = nova.id
      setConversaId(convId)
      await carregarConversas()
    } else {
      await cliente.from('conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', convId)
    }

    const novas = historico.slice(-qtdNovas)
    await cliente.from('conversa_mensagens').insert(
      novas.map((m) => ({ conversa_id: convId, role: m.role, content: m.content }))
    )
  }

  async function enviar(textoOverride) {
    const texto = (textoOverride ?? input).trim()
    if (!texto || carregando) return

    if (vozAutomatica) desbloquear()

    const historicoAtual = [...mensagens, { role: 'user', content: texto }]
    setMensagens(historicoAtual)
    setInput('')
    setCarregando(true)
    setAcaoPendente(null)

    try {
      const res = await fetch(urlFuncao('assistente-jarvis'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.token}` },
        body: JSON.stringify({ mensagens: historicoAtual.map((m) => ({ role: m.role, content: m.content })) }),
      })
      const data = await res.json()
      const respostaAssistente = res.ok && data.ok ? data.resposta : (data.erro || 'Erro ao processar. Tente novamente.')
      if (!(res.ok && data.ok)) toast?.erro(respostaAssistente)

      const novoHistorico = [...historicoAtual, { role: 'assistant', content: respostaAssistente }]
      setMensagens(novoHistorico)
      if (res.ok && data.requer_confirmacao) setAcaoPendente(data.proposta)
      if (vozAutomatica) falar(respostaAssistente)
      await persistirConversa(novoHistorico, texto)
    } catch {
      setMensagens((prev) => [...prev, { role: 'assistant', content: 'Erro de conexão. Verifique sua internet.' }])
    }
    setCarregando(false)
  }

  async function confirmarAcao() {
    if (!acaoPendente) return
    setConfirmando(true)
    try {
      const res = await fetch(urlFuncao('assistente-jarvis'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.token}` },
        body: JSON.stringify({ confirmar_acao: { tool: acaoPendente.tool, input: acaoPendente.input } }),
      })
      const data = await res.json()
      const texto = res.ok && data.ok ? data.acao_executada : (data.erro || 'Erro ao executar.')
      const msg = { role: 'assistant', content: `✓ ${texto}` }
      const novoHistorico = [...mensagens, msg]
      setMensagens(novoHistorico)
      setAcaoPendente(null)
      if (vozAutomatica) falar(texto)
      await persistirConversa(novoHistorico, texto, 1)
      carregarBriefing()
    } catch {
      toast?.erro('Erro de conexão ao confirmar.')
    }
    setConfirmando(false)
  }

  async function cancelarAcao() {
    setAcaoPendente(null)
    const novoHistorico = [...mensagens, { role: 'assistant', content: 'Cancelado.' }]
    setMensagens(novoHistorico)
    await persistirConversa(novoHistorico, 'Cancelado.', 1)
  }

  const { iniciarEscuta, pararEscuta, escutando, suportado } = useVoz({
    onTranscricao: (texto) => enviar(texto),
    onErro: (e) => toast?.erro(typeof e === 'string' ? e : 'Erro na captura por voz.'),
  })

  const isJarvis = sessao.espaco.jarvis_enabled === true

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 'var(--space-md)', paddingBottom: 76, display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', height: '100vh', position: 'relative' }}>
      <Header espaco={sessao.espaco} onSair={sair} />
      <IndicadorFala ativo={falando} />

      {briefing && (
        <div className="jarvis-briefing">
          {briefing.tempo && (
            <div className="bv-tempo-inline">
              <span className="tempo-num">{briefing.tempo.temp}°C</span>
              <span className="tempo-txt">{briefing.tempo.descricao}</span>
              {briefing.tempo.probChuva > 40 && (
                <span className="tempo-chuva"><Umbrella size={11} /> {briefing.tempo.probChuva}%</span>
              )}
            </div>
          )}
          {briefing.eventosHoje?.length > 0 && (
            <div className="bv-eventos-inline">
              {briefing.eventosHoje.slice(0, 2).map((e, i) => (
                <span key={i} className="bv-ev">
                  <span className="bv-ev-hora">{new Date(e.inicio).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</span>
                  {e.titulo}
                </span>
              ))}
            </div>
          )}
          {(briefing.urgentes?.length > 0 || briefing.paradas?.length > 0) && (
            <div className="bv-sugestao-inline">
              → {briefing.urgentes?.length > 0 ? `"${briefing.urgentes[0].nome}" — prazo próximo` : `"${briefing.paradas[0].nome}" parada há dias`}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="btn-secundario" onClick={() => setMostrarHistorico((v) => !v)}>
          <History size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
          Histórico
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          {falaSuportada && (
            <button
              type="button"
              className="link-acao"
              data-ativo={vozAutomatica}
              onClick={toggleVozAutomatica}
              title={vozAutomatica ? 'Desativar resposta por voz' : 'Ativar resposta por voz'}
              aria-label={vozAutomatica ? 'Desativar resposta por voz' : 'Ativar resposta por voz'}
            >
              {falando ? <Volume2 size={14} /> : vozAutomatica ? <Volume1 size={14} /> : <VolumeX size={14} />}
            </button>
          )}
          <button type="button" className="link-acao" onClick={novaConversa}>
            <Plus size={14} />
            Nova conversa
          </button>
        </div>
      </div>

      {mostrarHistorico && (
        <div className="historico-sidebar">
          <div className="historico-header">
            <span className="text-titulo" style={{ fontSize: 14 }}>Conversas anteriores</span>
            <button type="button" className="modal-fechar" onClick={() => setMostrarHistorico(false)} aria-label="Fechar">
              <X size={16} />
            </button>
          </div>
          {conversas.length === 0 && <p className="text-micro" style={{ padding: 'var(--space-md)' }}>Nenhuma conversa salva ainda.</p>}
          {conversas.map((c) => (
            <button
              key={c.id}
              type="button"
              className="historico-item"
              data-ativo={c.id === conversaId}
              onClick={() => carregarConversa(c.id)}
            >
              <span className="hist-titulo">{c.titulo || 'Conversa'}</span>
              <span className="hist-data">{new Date(c.atualizado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
            </button>
          ))}
        </div>
      )}

      <div className="chat-historico">
        {mensagens.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.role === 'assistant' && <span className="chat-avatar">J</span>}
            <div className="chat-msg-corpo">
              <div className="chat-bubble" dangerouslySetInnerHTML={{ __html: renderMsg(m.content) }} />
              {m.role === 'assistant' && falaSuportada && (
                <button type="button" className="btn-ouvir-msg" onClick={() => falar(m.content)} title="Ouvir esta mensagem" aria-label="Ouvir esta mensagem">
                  <Volume2 size={12} />
                </button>
              )}
            </div>
          </div>
        ))}

        {carregando && (
          <div className="chat-msg assistant">
            <span className="chat-avatar">J</span>
            <div className="chat-bubble">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </div>
          </div>
        )}

        {acaoPendente && (
          <div className="confirmacao-card">
            <p className="conf-titulo"><Zap size={13} /> Confirmar ação</p>
            <p className="conf-desc">{acaoPendente.descricao}</p>
            <div className="conf-acoes">
              <button type="button" className="conf-sim" onClick={confirmarAcao} disabled={confirmando}>
                <Check size={14} /> {confirmando ? 'Executando...' : 'Confirmar'}
              </button>
              <button type="button" className="conf-nao" onClick={cancelarAcao} disabled={confirmando}>
                <X size={14} /> Cancelar
              </button>
            </div>
          </div>
        )}

        <div ref={rodapeRef} />
      </div>

      <div className="chat-input-area">
        {suportado && (
          <button
            type="button"
            className="chat-mic"
            data-ativo={escutando}
            onClick={() => { if (!escutando && vozAutomatica) desbloquear(); (escutando ? pararEscuta : iniciarEscuta)() }}
            title={escutando ? 'Parar' : 'Falar'}
            aria-label={escutando ? 'Parar captura por voz' : 'Falar com o assistente'}
          >
            {escutando ? <Square size={16} /> : <Mic size={16} />}
          </button>
        )}
        <input
          className="chat-input"
          type="text"
          placeholder={escutando ? 'Ouvindo...' : 'Fale com o Jarvis...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enviar()}
          disabled={carregando || escutando}
        />
        <button type="button" className="chat-enviar" onClick={() => enviar()} disabled={!input.trim() || carregando} aria-label="Enviar">
          <ArrowUp size={18} />
        </button>
      </div>

      {isJarvis && <TabBar />}
    </div>
  )
}
