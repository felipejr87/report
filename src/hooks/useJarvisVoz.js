import { useRef, useState, useEffect } from 'react'
import { urlFuncao } from '../lib/supabase'

// WAV de 8 amostras de silêncio puro (8kHz/8bit/mono) — só pra
// "destravar" o elemento <audio> dentro do gesto do usuário no iOS.
// Depois de tocado uma vez num clique, esse MESMO elemento pode tocar
// áudio novo sem gesto de novo — por isso reaproveitamos um único
// elemento (audioElRef) em vez de `new Audio()` a cada resposta, que
// voltaria a exigir gesto toda vez.
const SILENCIO_WAV = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA=='

// Frames consecutivos de amplitude acima do limiar antes de considerar
// que é o usuário falando (não um pico de eco/ruído breve). A ~60fps,
// 8 frames ≈ 130ms, perto do que o prompt original pretendia mas sem
// implementar de fato.
const FRAMES_PARA_BARGE_IN = 8
const LIMIAR_AMPLITUDE = 20

export function useJarvisVoz(token, idioma = 'pt') {
  const [falando, setFalando] = useState(false)
  const [carregandoAudio, setCarregandoAudio] = useState(false)

  const audioElRef = useRef(null)
  const streamUrlRef = useRef(null)
  const micStreamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const bargeTimerRef = useRef(null)
  const framesAcimaLimiarRef = useRef(0)

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

  function pararMonitorMic() {
    if (bargeTimerRef.current) {
      cancelAnimationFrame(bargeTimerRef.current)
      bargeTimerRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop())
      micStreamRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
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
    pararMonitorMic()
  }

  useEffect(() => () => pararFala(), []) // eslint-disable-line react-hooks/exhaustive-deps

  // Barge-in — monitora o microfone enquanto o Jarvis fala e para a
  // reprodução assim que detecta o usuário falando por cima.
  // echoCancellation é essencial aqui: sem isso, o próprio áudio do
  // Jarvis vazando do alto-falante pro microfone (mais comum em
  // laptop/celular sem fone) dispara um "barge-in" falso a cada frase.
  async function iniciarMonitorMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      micStreamRef.current = stream

      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioCtx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const buffer = new Uint8Array(analyser.frequencyBinCount)
      framesAcimaLimiarRef.current = 0

      const checarAmplitude = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(buffer)
        const media = buffer.reduce((a, b) => a + b, 0) / buffer.length

        if (media > LIMIAR_AMPLITUDE) {
          framesAcimaLimiarRef.current++
          if (framesAcimaLimiarRef.current >= FRAMES_PARA_BARGE_IN) {
            const el = audioElRef.current
            if (el && !el.paused) { pararFala(); return }
          }
        } else {
          framesAcimaLimiarRef.current = 0
        }
        bargeTimerRef.current = requestAnimationFrame(checarAmplitude)
      }
      bargeTimerRef.current = requestAnimationFrame(checarAmplitude)
    } catch {
      // Microfone indisponível/negado — barge-in fica desligado, sem problema
      console.warn('[barge-in] microfone indisponível')
    }
  }

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
      audio.onplay = () => { setFalando(true); setCarregandoAudio(false); iniciarMonitorMic() }
      audio.onended = () => { setFalando(false); pararMonitorMic(); limparStreamUrl() }
      audio.onerror = () => { setFalando(false); setCarregandoAudio(false); pararMonitorMic() }
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
