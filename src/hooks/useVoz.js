import { useRef, useState } from 'react'

const ERRO_SEM_SUPORTE = { pt: 'Navegador não suporta reconhecimento de voz. Use o Chrome.', en: 'Browser does not support speech recognition. Use Chrome.' }

// Silêncio contínuo depois de já ter ouvido algo (ou de ter aberto o
// mic) — fecha sozinho e confirma o que foi captado até aqui.
const TIMEOUT_SILENCIO_MS = 8000
// Teto absoluto de uma captura — iOS Safari corta conexões longas.
const TIMEOUT_MAX_MS = 30000

export function useVoz({ onTranscricao, onInterim, onErro, idioma = 'pt' }) {
  const reconhecimentoRef = useRef(null)
  const timeoutSilencioRef = useRef(null)
  const timeoutMaxRef = useRef(null)
  const textoRef = useRef('')
  // Fonte da verdade fora do React — onresult final, onend e os dois
  // timeouts podem todos tentar finalizar a mesma captura; esse ref
  // garante que só o primeiro a chegar vale, os outros são ignorados.
  const ativoRef = useRef(false)
  const [escutando, setEscutando] = useState(false)
  const suportado = typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

  function limparTimeouts() {
    clearTimeout(timeoutSilencioRef.current)
    clearTimeout(timeoutMaxRef.current)
  }

  // Único caminho de saída da captura — sempre CONFIRMA o que foi
  // ouvido até aqui (mesmo que só parcial/interim), nunca descarta.
  // Chamado por: resultado final, onend, os dois timeouts e o botão ⏹.
  function finalizar(texto) {
    if (!ativoRef.current) return
    ativoRef.current = false
    limparTimeouts()
    setEscutando(false)

    const rec = reconhecimentoRef.current
    reconhecimentoRef.current = null
    if (rec) {
      rec.onresult = null
      rec.onerror = null
      rec.onend = null
      try { rec.stop() } catch { /* já parado */ }
    }

    if (texto) onTranscricao?.(texto)
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
    limparTimeouts()

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    // Butler britânico — en-GB no reconhecimento também, mais consistente
    // com a persona quando o idioma ativo é inglês.
    rec.lang = idioma === 'en' ? 'en-GB' : 'pt-BR'
    rec.interimResults = true
    rec.maxAlternatives = 1

    textoRef.current = ''
    ativoRef.current = true
    reconhecimentoRef.current = rec

    rec.onresult = (e) => {
      let texto = ''
      let final = false
      for (let i = e.resultIndex; i < e.results.length; i++) {
        texto += e.results[i][0].transcript
        if (e.results[i].isFinal) final = true
      }
      textoRef.current = texto
      onInterim?.(texto)

      // Cada novo pedaço de fala reseta o relógio de silêncio.
      clearTimeout(timeoutSilencioRef.current)
      timeoutSilencioRef.current = setTimeout(() => finalizar(textoRef.current.trim() || null), TIMEOUT_SILENCIO_MS)

      if (final) finalizar(texto.trim() || null)
    }

    // onend dispara sozinho em silêncio total, ou de forma inconsistente
    // entre browsers/SOs — se ninguém finalizou antes, usa o que foi
    // captado até aqui (mesmo que só interim, nunca descarta).
    rec.onend = () => finalizar(textoRef.current.trim() || null)

    rec.onerror = (e) => {
      // 'aborted' vem do abort() que nós mesmos disparamos — ignorar.
      if (e.error === 'aborted') { ativoRef.current = false; return }
      // 'no-speech' = silêncio total — fechar sem erro.
      if (e.error === 'no-speech') { finalizar(null); return }

      console.warn('[useVoz] erro:', e.error)
      ativoRef.current = false
      limparTimeouts()
      setEscutando(false)
      reconhecimentoRef.current = null
      onErro?.(e.error)
    }

    rec.start()
    setEscutando(true)

    timeoutSilencioRef.current = setTimeout(() => finalizar(textoRef.current.trim() || null), TIMEOUT_SILENCIO_MS)
    timeoutMaxRef.current = setTimeout(() => finalizar(textoRef.current.trim() || null), TIMEOUT_MAX_MS)
  }

  // Chamado pelo botão ⏹ — CONFIRMA o que foi ouvido até agora, nunca aborta.
  function pararEscuta() {
    finalizar(textoRef.current.trim() || null)
  }

  return { iniciarEscuta, pararEscuta, escutando, suportado }
}
