import { useState, useEffect } from 'react'

const BOOT_LINES = {
  pt: [
    'JARVIS OS v2.4 — inicializando núcleo...',
    'Autenticando espaço {codigo}... ok',
    'Sincronizando agenda, hábitos e finanças... ok',
    'Calibrando interface holográfica... ok',
    'Todos os sistemas operacionais. Bem-vindo, Felipe.',
  ],
  en: [
    'JARVIS OS v2.4 — booting core...',
    'Authenticating space {codigo}... ok',
    'Syncing schedule, habits and finances... ok',
    'Calibrating holographic interface... ok',
    'All systems operational. Welcome, Felipe.',
  ],
}

const CHAVE_BOOT = 'jarvis_boot_done'

export default function BootSequence({ onDone, codigo = 'FE01', idioma = 'pt' }) {
  const [lines, setLines] = useState([])
  const [progress, setProgress] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(CHAVE_BOOT)) { onDone(); return }

    const linhas = (BOOT_LINES[idioma] || BOOT_LINES.pt).map((l) => l.replace('{codigo}', codigo))
    let i = 0
    const interval = setInterval(() => {
      if (i >= linhas.length) {
        clearInterval(interval)
        setTimeout(() => {
          setFading(true)
          setTimeout(() => {
            sessionStorage.setItem(CHAVE_BOOT, '1')
            onDone()
          }, 600)
        }, 400)
        return
      }
      setLines((prev) => [...prev, linhas[i]])
      setProgress(Math.round(((i + 1) / linhas.length) * 100))
      i++
    }, 480)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`hud-boot-overlay ${fading ? 'fading' : ''}`}>
      <div className="hud-boot-content">
        {lines.map((line, idx) => (
          <div key={idx} className="hud-boot-line">&gt; {line}</div>
        ))}
        <div className="hud-boot-bar-bg">
          <div className="hud-boot-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  )
}
