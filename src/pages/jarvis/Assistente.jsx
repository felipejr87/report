import { useState, useRef, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { Mic, Square, ArrowUp } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { supabaseEspaco, urlFuncao } from '../../lib/supabase'
import { useVoz } from '../../hooks/useVoz'
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
  const [mensagens, setMensagens] = useState([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const rodapeRef = useRef(null)

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  useEffect(() => {
    async function boasVindas() {
      if (!cliente) return
      const mes = new Date().toISOString().slice(0, 7)
      const { data: lncs } = await cliente.from('lancamentos').select('valor').gte('data', `${mes}-01`)
      const saldo = (lncs || []).reduce((s, l) => s + l.valor, 0)
      const hora = new Date().getHours()
      const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

      setMensagens([{
        role: 'assistant',
        content: `${saudacao}, Felipe.${lncs?.length ? ` Saldo este mês: **R$ ${saldo.toFixed(2).replace('.', ',')}**.` : ''}\n\nComo posso ajudar a decidir hoje?`,
      }])
    }
    boasVindas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  useEffect(() => { rodapeRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens])

  if (!sessao) return <Navigate to="/" replace />

  async function enviar(textoOverride) {
    const texto = (textoOverride ?? input).trim()
    if (!texto || carregando) return

    const historico = [...mensagens, { role: 'user', content: texto }]
    setMensagens(historico)
    setInput('')
    setCarregando(true)

    try {
      const res = await fetch(urlFuncao('assistente-jarvis'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.token}` },
        body: JSON.stringify({ mensagens: historico.map((m) => ({ role: m.role, content: m.content })) }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setMensagens((prev) => [...prev, { role: 'assistant', content: data.resposta }])
      } else {
        toast?.erro(data.erro || 'Erro ao falar com o assistente.')
        setMensagens((prev) => [...prev, { role: 'assistant', content: data.erro || 'Desculpe, ocorreu um erro. Tente novamente.' }])
      }
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
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', height: '100vh' }}>
      <Header espaco={sessao.espaco} onSair={sair} />

      <div className="chat-historico">
        {mensagens.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.role === 'assistant' && <span className="chat-avatar">J</span>}
            <div className="chat-bubble" dangerouslySetInnerHTML={{ __html: renderMsg(m.content) }} />
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
          placeholder={escutando ? 'Ouvindo...' : 'Pergunte ou peça uma decisão...'}
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
