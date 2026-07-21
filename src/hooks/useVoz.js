import { useEffect, useRef, useState } from 'react'

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

export function useFala(idioma = 'pt') {
  const [falando, setFalando] = useState(false)
  const suportado = typeof window !== 'undefined' && 'speechSynthesis' in window

  // iOS Safari (principalmente em PWA standalone) só deixa falar() funcionar
  // se ele acontecer "dentro" de um gesto direto do usuário — depois de um
  // await (ex: esperar a resposta da API), o navegador já não considera mais
  // gesto válido e o speak() é silenciosamente ignorado, sem erro nenhum.
  // Chamar isso de forma síncrona no clique/onKeyDown (antes de qualquer
  // await) "destrava" o motor de voz pro resto da sessão da página.
  function desbloquear() {
    if (!suportado) return
    window.speechSynthesis.resume()
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    window.speechSynthesis.speak(u)
  }

  function falar(texto) {
    if (!suportado) return
    window.speechSynthesis.cancel()

    const textoLimpo = texto
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/`(.*?)`/g, '$1')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!textoLimpo) return

    const langAlvo = idioma === 'en' ? 'en-GB' : 'pt-BR'
    const prefixoAlvo = idioma === 'en' ? 'en' : 'pt'

    const utterance = new SpeechSynthesisUtterance(textoLimpo)
    utterance.lang = langAlvo
    utterance.rate = 1.05
    utterance.pitch = 1.0
    utterance.volume = 1.0

    function selecionarVoz() {
      const vozes = window.speechSynthesis.getVoices()
      const voz = vozes.find((v) => v.lang === langAlvo && v.localService)
        || vozes.find((v) => v.lang === langAlvo)
        || vozes.find((v) => v.lang.startsWith(prefixoAlvo))
      if (voz) utterance.voice = voz
    }

    if (window.speechSynthesis.getVoices().length > 0) {
      selecionarVoz()
    } else {
      window.speechSynthesis.addEventListener('voiceschanged', selecionarVoz, { once: true })
    }

    utterance.onstart = () => setFalando(true)
    utterance.onend = () => setFalando(false)
    utterance.onerror = () => setFalando(false)

    window.speechSynthesis.speak(utterance)
  }

  function pararFala() {
    window.speechSynthesis.cancel()
    setFalando(false)
  }

  useEffect(() => () => window.speechSynthesis.cancel(), [])

  return { falar, pararFala, falando, suportado, desbloquear }
}
