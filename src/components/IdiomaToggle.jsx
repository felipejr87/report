import { useIdioma } from '../hooks/useIdioma'

export default function IdiomaToggle() {
  const { idioma, alternar } = useIdioma()
  const ingles = idioma === 'en'

  return (
    <button
      type="button"
      className="idioma-toggle"
      onClick={alternar}
      aria-label={ingles ? 'Switch to Portuguese' : 'Mudar para inglês'}
      aria-pressed={ingles}
      title={ingles ? 'Switch to Portuguese' : 'Mudar para inglês'}
    >
      {ingles ? 'EN' : 'PT'}
    </button>
  )
}
