import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import IdiomaToggle from '../IdiomaToggle'
import ThemeToggle from '../ThemeToggle'
import { useTexto } from '../../lib/i18n'

export default function TopBar({ briefing, codigo = 'FE01', idioma = 'pt', onSair }) {
  const t = useTexto()
  const [hora, setHora] = useState('')
  const [data, setData] = useState('')
  const localeData = idioma === 'en' ? 'en-US' : 'pt-BR'

  useEffect(() => {
    function tick() {
      const now = new Date()
      setHora(now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false }))
      setData(now.toLocaleDateString(localeData, { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase())
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [localeData])

  const tempo = briefing?.tempo

  return (
    <header className="hud-topbar">
      <div className="hud-topbar-logo">
        <div className="hud-logo-circle">J</div>
        <div>
          <div className="hud-topbar-title">
            J.A.R.V.I.S. <span className="hud-topbar-codigo">// {codigo}</span>
          </div>
          <div className="hud-topbar-sub">SISTEMA OPERACIONAL PESSOAL · v2.4</div>
        </div>
      </div>

      <div className="hud-topbar-clock">
        <div className="hud-clock-time">{hora}</div>
        <div className="hud-clock-date">{data}</div>
      </div>

      <div className="hud-topbar-right">
        {tempo && (
          <div className="hud-clima">
            <span className="hud-clima-temp">{tempo.temp}°C</span>
            <span className="hud-clima-desc">{tempo.descricao?.toUpperCase()}</span>
            {tempo.probChuva > 30 && <span className="hud-clima-chuva">· CHUVA {tempo.probChuva}%</span>}
          </div>
        )}
        <div className="hud-status-dots">
          <span className="hud-dot hud-dot--on" />
          <span className="hud-dot hud-dot--on hud-dot--blink" />
          <span className="hud-dot hud-dot--amber" />
        </div>
        <span className="hud-online">ONLINE</span>

        <div className="hud-topbar-controles">
          <IdiomaToggle />
          <Link to="/seguranca" className="modal-fechar" title="Segurança & Privacidade" aria-label="Segurança & Privacidade">
            <Lock size={15} />
          </Link>
          <ThemeToggle />
          <button type="button" className="link-acao" onClick={onSair}>{t('sair')}</button>
        </div>
      </div>
    </header>
  )
}
