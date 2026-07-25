import { Sparkles, Compass, FolderKanban, Wallet } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTexto } from '../../lib/i18n'

export default function HudTabBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const t = useTexto()

  const TABS = [
    { id: 'jarvis', label: t('tab_jarvis'), Icone: Sparkles, path: '/jarvis' },
    { id: 'vida', label: t('tab_vida'), Icone: Compass, path: '/vida' },
    { id: 'projetos', label: t('tab_projetos'), Icone: FolderKanban, path: '/projetos' },
    { id: 'financeiro', label: t('tab_financeiro'), Icone: Wallet, path: '/financeiro' },
  ]

  return (
    <nav className="hud-tabbar">
      {TABS.map(({ id, label, Icone, path }) => {
        const ativo = pathname === path || pathname.startsWith(path + '/')
        return (
          <button key={id} type="button" className={`hud-tab-btn ${ativo ? 'hud-tab-btn--ativo' : ''}`} onClick={() => navigate(path)}>
            <Icone size={20} />
            {label}
          </button>
        )
      })}
    </nav>
  )
}
