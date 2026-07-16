import { useState, useRef, useEffect } from 'react'
import { Plus, MoreVertical, LogOut } from 'lucide-react'

export default function Header({ espaco, onNova, onSair }) {
  const [menuAberto, setMenuAberto] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function aoClicarFora(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', minWidth: 0 }}>
        <span className="logo esconder-mobile">
          Report<span className="brand-mark">!</span>
        </span>
        <span className="chip-codigo">{espaco.codigo}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <button type="button" className="btn-primario" onClick={onNova}>
          <Plus size={16} style={{ marginRight: 4, verticalAlign: -3 }} />
          Nova
        </button>

        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: 8 }}
            onClick={() => setMenuAberto((v) => !v)}
            aria-label="Mais opções"
            aria-expanded={menuAberto}
          >
            <MoreVertical size={16} />
          </button>
          {menuAberto && (
            <div
              role="menu"
              style={{
                position: 'absolute', right: 0, top: '110%', background: 'var(--surface-hi)',
                border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-modal)', minWidth: 160, zIndex: 10,
              }}
            >
              <button
                type="button"
                role="menuitem"
                className="btn-ghost"
                style={{ width: '100%', justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, border: 'none', borderRadius: 'var(--radius-sm)' }}
                onClick={onSair}
              >
                <LogOut size={14} />
                Sair do espaço
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
