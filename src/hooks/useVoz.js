import { useRef, useState } from 'react'

const ERRO_SEM_SUPORTE = { pt: 'Navegador não suporta reconhecimento de voz. Use o Chrome.', en: 'Browser does not support speech recognition. Use Chrome.' }

// Rede de segurança — em alguns navegadores (sobretudo iOS/WebKit,
// visto na prática depois de algumas capturas seguidas na mesma
// sessão) o reconhecimento deixa de disparar 'onend' sozinho e a
// captura fica "escutando" pra sempre até o usuário parar na mão.
// Esse timeout garante que toda captura se comporta igual, sempre.
const TIMEOUT_MAX_MS = 15000

export function useVoz({ onTranscricao, onErro, idioma = 'pt' }) {
  const reconhecimentoRef = useRef(null)
  const timeoutRef = useRef(null)
  const [escutando, setEscutando] = useState(false)
  const suportado = typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  function limparTimeout() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  function encerrar() {
    limparTimeout()
    setEscutando(false)
  }

  function iniciarEscuta() {
    if (!suportado) {
      onErro?.(ERRO_SEM_SUPORTE[idioma] || ERRO_SEM_SUPORTE.pt)
      return
    }

    // Se por algum motivo uma captura anterior ainda estiver viva,
    // encerra ela antes de abrir outra — duas instâncias disputando o
    // microfone ao mesmo tempo é uma causa conhecida de captura presa.
    if (reconhecimentoRef.current) {
      try { reconhecimentoRef.current.abort() } catch { /* já parado */ }
      reconhecimentoRef.current = null
    }
    limparTimeout()

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    // Butler britânico — en-GB no reconhecimento também, mais consistente
    // com a persona quando o idioma ativo é inglês.
    rec.lang = idioma === 'en' ? 'en-GB' : 'pt-BR'
    rec.interimResults = false
    rec.maxAlternatives = 1

    rec.onresult = (e) => onTranscricao?.(e.results[0][0].transcript)
    // onerror sozinho não garantia o fim da captura — só onend fazia
    // isso, e nem sempre dispara depois de um erro. Agora os dois
    // encerram o estado.
    rec.onerror = (e) => { onErro?.(e.error); encerrar() }
    rec.onend = () => encerrar()

    reconhecimentoRef.current = rec
    rec.start()
    setEscutando(true)

    timeoutRef.current = setTimeout(() => {
      try { rec.stop() } catch { /* ignore */ }
      encerrar()
    }, TIMEOUT_MAX_MS)
  }

  function pararEscuta() {
    if (reconhecimentoRef.current) {
      try { reconhecimentoRef.current.stop() } catch { /* já parado */ }
    }
    encerrar()
  }

  return { iniciarEscuta, pararEscuta, escutando, suportado }
}
