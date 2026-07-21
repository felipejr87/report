import { NavLink } from 'react-router-dom'
import { Sparkles, Compass, FolderKanban, Wallet } from 'lucide-react'

const ABAS = [
  { to: '/jarvis', label: 'Jarvis', Icone: Sparkles, fim: true },
  { to: '/vida', label: 'Vida', Icone: Compass },
  { to: '/projetos', label: 'Projetos', Icone: FolderKanban },
  { to: '/financeiro', label: 'Financeiro', Icone: Wallet },
]

export default function TabBar() {
  return (
    <nav className="tab-bar">
      {ABAS.map(({ to, label, Icone, fim }) => (
        <NavLink key={to} to={to} end={fim} className={({ isActive }) => `tab-item${isActive ? ' ativo' : ''}`}>
          <Icone size={20} className="tab-icone" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
