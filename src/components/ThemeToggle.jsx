import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export default function ThemeToggle() {
  const { tema, alternar } = useTheme()
  const escuro = tema === 'dark'

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={alternar}
      aria-label={escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      aria-pressed={escuro}
    >
      <span className="theme-toggle-knob" data-escuro={escuro}>
        {escuro ? <Moon size={12} /> : <Sun size={12} />}
      </span>
    </button>
  )
}
