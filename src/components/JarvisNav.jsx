import { NavLink } from 'react-router-dom'

const ABAS = [
  { to: '/espaco', label: 'Projetos', fim: true },
  { to: '/jarvis/pilares', label: 'Pilares' },
  { to: '/jarvis/financeiro', label: 'Financeiro' },
  { to: '/jarvis/calendario', label: 'Calendário' },
  { to: '/jarvis/habitos', label: 'Hábitos' },
  { to: '/jarvis/brief', label: 'Brief' },
]

export default function JarvisNav() {
  return (
    <nav className="jarvis-nav">
      {ABAS.map((a) => (
        <NavLink
          key={a.to}
          to={a.to}
          end={a.fim}
          className={({ isActive }) => `jarvis-nav-aba${isActive ? ' ativo' : ''}`}
        >
          {a.label}
        </NavLink>
      ))}
    </nav>
  )
}
