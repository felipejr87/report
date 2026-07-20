import { useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useVoz } from '../hooks/useVoz'
import { urlFuncao } from '../lib/supabase'

export default function CapturaRapida({ cliente, onConfirmado }) {
  const { sessao } = useAuth()
  const toast = useToast()
  const [texto, setTexto] = useState('')
  const [processando, setProcessando] = useState(false)
  const [proposta, setProposta] = useState(null)

  async function processar(textoForcado) {
    const alvo = (textoForcado ?? texto).trim()
    if (!alvo || processando) return
    setProcessando(true)
    setProposta(null)
    try {
      const res = await fetch(urlFuncao('captura'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.token}` },
        body: JSON.stringify({ texto: alvo }),
      })
      const resultado = await res.json()
      if (!res.ok || !resultado.ok) throw new Error(resultado.erro || 'Não consegui interpretar.')
      setProposta(resultado)
    } catch (err) {
      toast?.erro(err.message)
    } finally {
      setProcessando(false)
    }
  }

  const { iniciarEscuta, pararEscuta, escutando, suportado } = useVoz({
    onTranscricao: (transcricao) => {
      setTexto(transcricao)
      processar(transcricao)
    },
    onErro: (e) => toast?.erro(typeof e === 'string' ? e : 'Erro na captura por voz.'),
  })

  async function confirmar() {
    try {
      if (proposta.tipo === 'lancamento') {
        const { error } = await cliente.from('lancamentos').insert({
          espaco_id: sessao.espaco.id,
          descricao: proposta.dados.descricao,
          valor: proposta.dados.valor,
          categoria_id: proposta.dados.categoria_id || null,
          data: proposta.dados.data || new Date().toISOString().split('T')[0],
        })
        if (error) throw error
      } else if (proposta.tipo === 'habito_check') {
        const { error } = await cliente.from('habito_checks').insert({
          habito_id: proposta.dados.habito_id,
          data: proposta.dados.data || new Date().toISOString().split('T')[0],
        })
        if (error) throw error
      } else if (proposta.tipo === 'evento') {
        const { error } = await cliente.from('eventos_cal').insert({
          espaco_id: sessao.espaco.id,
          titulo: proposta.dados.titulo,
          inicio: proposta.dados.inicio,
        })
        if (error) throw error
      } else {
        toast?.erro('Não entendi o que fazer com isso.')
        return
      }
      toast?.sucesso('Registrado.')
      setProposta(null)
      setTexto('')
      onConfirmado?.()
    } catch (err) {
      toast?.erro(err.message)
    }
  }

  return (
    <div>
      <div className="captura-box">
        <input
          type="text"
          placeholder='Ex: "gastei 180 no mercado" · "treinei hoje"'
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && processar()}
        />
        <button type="button" className="btn-secundario" onClick={() => processar()} disabled={!texto.trim() || processando}>
          {processando ? '...' : 'Enviar'}
        </button>
        {suportado && (
          <button
            type="button"
            className="btn-mic-flutuante"
            style={{ position: 'static', width: 40, height: 40, flexShrink: 0 }}
            data-escutando={escutando}
            onClick={escutando ? pararEscuta : iniciarEscuta}
            title={escutando ? 'Parar' : 'Capturar por voz'}
            aria-label={escutando ? 'Parar captura por voz' : 'Capturar por voz'}
          >
            {escutando ? <Square size={16} /> : <Mic size={16} />}
          </button>
        )}
      </div>

      {proposta && (
        <div className="captura-proposta">
          <p className="text-body">{proposta.mensagem_confirmacao}</p>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button type="button" className="btn-primario" onClick={confirmar}>Confirmar</button>
            <button type="button" className="btn-secundario" onClick={() => setProposta(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
