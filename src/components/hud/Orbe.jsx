const STATUS_LABELS = {
  pt: { aguardando: 'AGUARDANDO COMANDO', ouvindo: '● OUVINDO', processando: '● PROCESSANDO', falando: '● RESPONDENDO' },
  en: { aguardando: 'AWAITING COMMAND', ouvindo: '● LISTENING', processando: '● PROCESSING', falando: '● RESPONDING' },
}

// status: 'aguardando' | 'ouvindo' | 'processando' | 'falando'
export default function Orbe({ status = 'aguardando', size = 230, idioma = 'pt' }) {
  const labels = STATUS_LABELS[idioma] || STATUS_LABELS.pt

  return (
    <div className="orbe-wrapper" style={{ '--orbe-size': `${size}px` }}>
      <div className="orbe-container">
        <div className="orbe-ring orbe-ring--dashed" />
        <div className="orbe-ring orbe-ring--fast" />
        <div className="orbe-ring orbe-ring--rev" />
        <div className="orbe-ring orbe-ring--conic" />
        <div className="orbe-core">
          <span className="orbe-j">J</span>
        </div>
      </div>

      <div className={`orbe-status ${status !== 'aguardando' ? 'orbe-status--active' : ''}`}>
        {labels[status] || labels.aguardando}
      </div>

      <div className="orbe-wave">
        {Array.from({ length: 16 }, (_, i) => (
          <span
            key={i}
            className={`wave-bar ${status === 'ouvindo' || status === 'falando' ? 'wave-bar--active' : ''}`}
            style={{ animationDelay: `${i * 0.06}s`, '--wave-dur': `${0.7 + (i % 5) * 0.12}s` }}
          />
        ))}
      </div>
    </div>
  )
}
