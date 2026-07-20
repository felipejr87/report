import { useState, useRef, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { Mic, Square, ArrowUp, History, Plus, X, Volume2, Volume1, VolumeX } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { supabaseEspaco, urlFuncao } from '../../lib/supabase'
import { useVoz, useFala } from '../../hooks/useVoz'

const CHAVE_VOZ_AUTO = 'jarvis_voz_auto'
import Header from '../../components/Header'

function renderMsg(texto) {
  return texto
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

export default function Assistente() {
  const { sessao, sair } = useAuth()
  const toast = useToast()
  const [conversas, setConversas] = useState([])
  const [conversaId, setConversaId] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const [vozAutomatica, setVozAutomatica] = useState(() => localStorage.getItem(CHAVE_VOZ_AUTO) === 'true')
  const rodapeRef = useRef(null)

  const { falar, pararFala, falando, suportado: falaSuportada } = useFala()

  function toggleVozAutomatica() {
    const novo = !vozAutomatica
    setVozAutomatica(novo)
    localStorage.setItem(CHAVE_VOZ_AUTO, String(novo))
    if (!novo) pararFala()
  }

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

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

    const mes = new Date().toISOString().slice(0, 7)
    const { data: lncs } = await cliente.from('lancamentos').select('valor').gte('data', `${mes}-01`)
    const saldo = (lncs || []).reduce((s, l) => s + l.valor, 0)
    const hora = new Date().getHours()
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

    setMensagens([{
      role: 'assistant',
      content: `${saudacao}, Felipe. ${lncs?.length ? `Saldo este mês: **R$ ${saldo.toFixed(2).replace('.', ',')}**.` : 'Nenhum lançamento registrado este mês ainda.'}\n\nO que posso ajudar a decidir ou fazer hoje?`,
    }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  useEffect(() => { carregarConversas(); novaConversa() }, [carregarConversas, novaConversa])
  useEffect(() => { rodapeRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens])

  if (!sessao) return <Navigate to="/" replace />

  async function carregarConversa(id) {
    setConversaId(id)
    setMostrarHistorico(false)
    const { data } = await cliente.from('conversa_mensagens').select('role, content, criado_em').eq('conversa_id', id).order('criado_em')
    setMensagens((data || []).map((m) => ({ role: m.role, content: m.content })))
  }

  async function persistirConversa(historico, primeiroTextoUsuario) {
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

    const ultimasDuas = historico.slice(-2)
    await cliente.from('conversa_mensagens').insert(
      ultimasDuas.map((m) => ({ conversa_id: convId, role: m.role, content: m.content }))
    )
  }

  async function enviar(textoOverride) {
    const texto = (textoOverride ?? input).trim()
    if (!texto || carregando) return

    const historicoAtual = [...mensagens, { role: 'user', content: texto }]
    setMensagens(historicoAtual)
    setInput('')
    setCarregando(true)

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
      if (vozAutomatica) falar(respostaAssistente)
      await persistirConversa(novoHistorico, texto)
    } catch {
      setMensagens((prev) => [...prev, { role: 'assistant', content: 'Erro de conexão. Verifique sua internet.' }])
    }
    setCarregando(false)
  }

  const { iniciarEscuta, pararEscuta, escutando, suportado } = useVoz({
    onTranscricao: (texto) => enviar(texto),
    onErro: (e) => toast?.erro(typeof e === 'string' ? e : 'Erro na captura por voz.'),
  })

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', height: '100vh', position: 'relative' }}>
      <Header espaco={sessao.espaco} onSair={sair} />

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

        <div ref={rodapeRef} />
      </div>

      <div className="chat-input-area">
        {suportado && (
          <button
            type="button"
            className="chat-mic"
            data-ativo={escutando}
            onClick={escutando ? pararEscuta : iniciarEscuta}
            title={escutando ? 'Parar' : 'Falar'}
            aria-label={escutando ? 'Parar captura por voz' : 'Falar com o assistente'}
          >
            {escutando ? <Square size={16} /> : <Mic size={16} />}
          </button>
        )}
        <input
          className="chat-input"
          type="text"
          placeholder={escutando ? 'Ouvindo...' : 'Pergunte ou peça uma ação...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enviar()}
          disabled={carregando || escutando}
        />
        <button type="button" className="chat-enviar" onClick={() => enviar()} disabled={!input.trim() || carregando} aria-label="Enviar">
          <ArrowUp size={18} />
        </button>
      </div>
    </div>
  )
}
