import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import IdiomaToggle from '../IdiomaToggle'
import ThemeToggle from '../ThemeToggle'
import { useTexto } from '../../lib/i18n'

// Cluster de controles de sistema (idioma/segurança/tema/sair) — as
// abas HUD (Vida/Projetos/Financeiro) não usam <Header/>, então sem
// isso o acesso a /seguranca e ao logout desapareceria dessas telas.
export default function HudAbaControles({ onSair }) {
  const t = useTexto()
  return (
    <div className="hud-topbar-controles">
      <IdiomaToggle />
      <Link to="/seguranca" className="modal-fechar" title="Segurança & Privacidade" aria-label="Segurança & Privacidade">
        <Lock size={15} />
      </Link>
      <ThemeToggle />
      <button type="button" className="link-acao" onClick={onSair}>{t('sair')}</button>
    </div>
  )
}
