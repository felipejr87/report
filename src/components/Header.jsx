import ThemeToggle from './ThemeToggle'
import UsuarioBadge from './UsuarioBadge'

export default function Header({ espaco, onSair }) {
  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', minWidth: 0 }}>
        <span className="logo esconder-mobile">
          Jarvis<span className="brand-mark">!</span>
        </span>
        <span className="chip-codigo">{espaco.codigo}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
        <UsuarioBadge />
        <ThemeToggle />
        <button type="button" className="link-acao" onClick={onSair}>Sair</button>
      </div>
    </header>
  )
}
