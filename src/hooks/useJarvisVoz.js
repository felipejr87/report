import { useRef, useState, useEffect } from 'react'
import { urlFuncao } from '../lib/supabase'

// WAV de 8 amostras de silêncio puro (8kHz/8bit/mono) — só pra
// "destravar" o elemento <audio> dentro do gesto do usuário no iOS.
// Depois de tocado uma vez num clique, esse MESMO elemento pode tocar
// áudio novo sem gesto de novo — por isso reaproveitamos um único
// elemento (audioElRef) em vez de `new Audio()` a cada resposta, que
// voltaria a exigir gesto toda vez.
const SILENCIO_WAV = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA=='

export function useJarvisVoz(token, idioma = 'pt') {
  const [falando, setFalando] = useState(false)
  const [carregandoAudio, setCarregandoAudio] = useState(false)

  const audioElRef = useRef(null)
  const streamUrlRef = useRef(null)

  function getAudioEl() {
    if (!audioElRef.current) {
      const el = new Audio()
      el.preload = 'auto'
      audioElRef.current = el
    }
    return audioElRef.current
  }

  // Destrava tanto o <audio> (ElevenLabs) quanto o speechSynthesis
  // (fallback) — não dá pra saber de antemão qual dos dois vai tocar,
  // então destrava os dois no mesmo gesto de clique.
  function desbloquear() {
    const el = getAudioEl()
    try {
      el.muted = true
      el.src = SILENCIO_WAV
      const p = el.play()
      if (p?.then) p.then(() => { el.pause(); el.muted = false }).catch(() => { el.muted = false })
    } catch {
      // best-effort — se falhar, o fallback de erro em falar() cobre
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.resume()
      const u = new SpeechSynthesisUtterance('')
      u.volume = 0
      window.speechSynthesis.speak(u)
    }
  }

  function limparStreamUrl() {
    if (streamUrlRef.current) {
      URL.revokeObjectURL(streamUrlRef.current)
      streamUrlRef.current = null
    }
  }

  function pararFala() {
    const el = audioElRef.current
    if (el) {
      el.onplay = null
      el.onended = null
      el.onerror = null
      el.pause()
    }
    limparStreamUrl()
    if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel()
    setFalando(false)
    setCarregandoAudio(false)
  }

  useEffect(() => () => pararFala(), []) // eslint-disable-line react-hooks/exhaustive-deps

  async function falar(texto) {
    if (!texto?.trim()) return

    pararFala()
    setCarregandoAudio(true)

    try {
      const res = await fetch(urlFuncao('jarvis-tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ texto }),
      })

      if (!res.ok || res.headers.get('Content-Type')?.includes('json')) {
        console.warn('[jarvis-voz] fallback para speechSynthesis')
        setCarregandoAudio(false)
        falarFallback(texto)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      streamUrlRef.current = url

      const audio = getAudioEl()
      audio.muted = false
      audio.onplay = () => { setFalando(true); setCarregandoAudio(false) }
      audio.onended = () => { setFalando(false); limparStreamUrl() }
      audio.onerror = () => { setFalando(false); setCarregandoAudio(false) }
      audio.src = url
      await audio.play()
    } catch (e) {
      console.warn('[jarvis-voz] erro, usando fallback:', e)
      setCarregandoAudio(false)
      falarFallback(texto)
    }
  }

  function falarFallback(texto) {
    if (!window.speechSynthesis) return

    const textoLimpo = texto
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300)
    if (!textoLimpo) return

    const langAlvo = idioma === 'en' ? 'en-GB' : 'pt-BR'
    const prefixoAlvo = idioma === 'en' ? 'en' : 'pt'

    const utt = new SpeechSynthesisUtterance(textoLimpo)
    utt.lang = langAlvo
    utt.rate = 0.95
    utt.pitch = 0.95

    function selecionarVoz() {
      const vozes = window.speechSynthesis.getVoices()
      const voz = vozes.find((v) => v.lang === langAlvo && v.localService)
        || vozes.find((v) => v.lang === langAlvo)
        || vozes.find((v) => v.lang.startsWith(prefixoAlvo))
      if (voz) utt.voice = voz
    }
    if (window.speechSynthesis.getVoices().length > 0) selecionarVoz()
    else window.speechSynthesis.addEventListener('voiceschanged', selecionarVoz, { once: true })

    utt.onstart = () => setFalando(true)
    utt.onend = () => setFalando(false)
    utt.onerror = () => setFalando(false)

    window.speechSynthesis.speak(utt)
  }

  const suportado = typeof window !== 'undefined' && (typeof Audio !== 'undefined' || 'speechSynthesis' in window)

  return { falar, pararFala, falando, carregandoAudio, suportado, desbloquear }
}
