import { useRef, useState } from 'react'

export function useVoz({ onTranscricao, onErro }) {
  const reconhecimentoRef = useRef(null)
  const [escutando, setEscutando] = useState(false)
  const suportado = typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  function iniciarEscuta() {
    if (!suportado) {
      onErro?.('Navegador não suporta reconhecimento de voz. Use o Chrome.')
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = 'pt-BR'
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
