import { useState, useRef, useEffect, useCallback } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Mic, Square, ArrowUp, History, Plus, X, Volume2, Volume1, VolumeX, Zap, Check, Umbrella } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { supabaseEspaco, urlFuncao } from '../lib/supabase'
import { useVoz, useFala } from '../hooks/useVoz'
import Header from '../components/Header'
import TabBar from '../components/jarvis/TabBar'

const CHAVE_VOZ_AUTO = 'jarvis_voz_auto'

function renderMsg(texto) {
  return texto
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
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
    if (!sessao) return
    try {
      const res = await fetch(urlFuncao('jarvis-briefing'), { headers: { Authorization: `Bearer ${sessao.token}` } })
      const data = await res.json()
      if (data.ok) setBriefing(data)
    } catch (e) {
      console.warn('[jarvis-briefing]', e)
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

    const hora = new Date().getHours()
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
    const dia = new Date().toLocaleDateString('pt-BR', { weekday: 'long' })

    setMensagens([{
      role: 'assistant',
      content: `${saudacao}, Felipe. ${dia.charAt(0).toUpperCase() + dia.slice(1)}. O que precisa?`,
    }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  useEffect(() => { carregarBriefing(); carregarConversas(); novaConversa() }, [carregarBriefing, carregarConversas, novaConversa])
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
