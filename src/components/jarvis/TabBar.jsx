import { NavLink } from 'react-router-dom'
import { Sparkles, Compass, FolderKanban, Wallet } from 'lucide-react'
import { useTexto } from '../../lib/i18n'

export default function TabBar() {
  const t = useTexto()

  const ABAS = [
    { to: '/jarvis', label: t('tab_jarvis'), Icone: Sparkles, fim: true },
    { to: '/vida', label: t('tab_vida'), Icone: Compass },
    { to: '/projetos', label: t('tab_projetos'), Icone: FolderKanban },
    { to: '/financeiro', label: t('tab_financeiro'), Icone: Wallet },
  ]

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
