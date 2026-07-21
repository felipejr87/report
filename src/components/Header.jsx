import ThemeToggle from './ThemeToggle'
import IdiomaToggle from './IdiomaToggle'
import UsuarioBadge from './UsuarioBadge'
import BuscaUniversal from './BuscaUniversal'
import { useTexto } from '../lib/i18n'

export default function Header({ espaco, onSair }) {
  const isJarvis = espaco?.jarvis_enabled === true
  const t = useTexto()

  return (
    <>
      <header className="app-header" data-jarvis={isJarvis}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', minWidth: 0 }}>
          <span className="logo esconder-mobile">
            Jarvis<span className="brand-mark">!</span>
          </span>
          {!isJarvis && <span className="chip-codigo">{espaco.codigo}</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <UsuarioBadge />
          {isJarvis && <IdiomaToggle />}
          <ThemeToggle />
          <button type="button" className="link-acao" onClick={onSair}>{isJarvis ? t('sair') : 'Sair'}</button>
        </div>
      </header>
      <div style={{ paddingTop: 'var(--space-sm)' }}>
        <BuscaUniversal />
      </div>
    </>
  )
}
