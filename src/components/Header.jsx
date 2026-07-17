import ThemeToggle from './ThemeToggle'

export default function Header({ espaco, onNova, onSair }) {
  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', minWidth: 0 }}>
        <span className="logo esconder-mobile">
          Report<span className="brand-mark">!</span>
        </span>
        <span className="chip-codigo">{espaco.codigo}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
        <ThemeToggle />
        <button type="button" className="link-acao" onClick={onSair}>Sair</button>
        <button type="button" className="btn-primario" onClick={onNova}>Nova</button>
      </div>
    </header>
  )
}
