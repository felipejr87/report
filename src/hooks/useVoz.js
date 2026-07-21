import { useRef, useState } from 'react'

const ERRO_SEM_SUPORTE = { pt: 'Navegador não suporta reconhecimento de voz. Use o Chrome.', en: 'Browser does not support speech recognition. Use Chrome.' }

export function useVoz({ onTranscricao, onErro, idioma = 'pt' }) {
  const reconhecimentoRef = useRef(null)
  const [escutando, setEscutando] = useState(false)
  const suportado = typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  function iniciarEscuta() {
    if (!suportado) {
      onErro?.(ERRO_SEM_SUPORTE[idioma] || ERRO_SEM_SUPORTE.pt)
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    // Butler britânico — en-GB no reconhecimento também, mais consistente
    // com a persona quando o idioma ativo é inglês.
    rec.lang = idioma === 'en' ? 'en-GB' : 'pt-BR'
    rec.interimResults = false
    rec.maxAlternatives = 1

    rec.onresult = (e) => onTranscricao?.(e.results[0][0].transcript)
    rec.onerror = (e) => onErro?.(e.error)
    rec.onend = () => setEscutando(false)

    reconhecimentoRef.current = rec
    rec.start()
    setEscutando(true)
  }

  function pararEscuta() {
    reconhecimentoRef.current?.stop()
    setEscutando(false)
  }

  return { iniciarEscuta, pararEscuta, escutando, suportado }
}
