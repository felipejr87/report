import { FASES, ROTULO_FASE } from './ChipFase'

export default function FiltroFase({ demandas, filtro, onFiltroChange }) {
  return (
    <nav className="filtro-fase" aria-label="Filtrar por fase">
      <button
        className="pill"
        data-ativo={filtro === 'todas'}
        onClick={() => onFiltroChange('todas')}
      >
        Todas
      </button>
      {FASES.map((f) => {
        const total = demandas.filter((d) => d.fase === f).length
        return (
          <button
            key={f}
            className="pill"
            data-fase-ativa={filtro === f ? f : undefined}
            onClick={() => onFiltroChange(f)}
          >
            {ROTULO_FASE[f]} {total}
          </button>
        )
      })}
    </nav>
  )
}
