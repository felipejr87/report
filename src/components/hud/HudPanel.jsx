// Painel com vidro holográfico + corner brackets
export default function HudPanel({ label, children, className = '', style = {}, amber = false }) {
  return (
    <div className={`hud-panel ${amber ? 'hud-panel--amber' : ''} ${className}`} style={style}>
      {label && <div className="hud-panel-label">◤ {label}</div>}
      {children}
    </div>
  )
}
