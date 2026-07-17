export default function FiltroProjeto({ demandas, filtro, onFiltroChange }) {
  const projetos = [...new Set(demandas.map((d) => d.projeto).filter(Boolean))].sort()

  if (projetos.length === 0) return null

  return (
    <label className="campo" style={{ width: '100%', maxWidth: 320, alignSelf: 'flex-start' }}>
      <span className="text-label">Projeto / Tema</span>
      <select value={filtro} onChange={(e) => onFiltroChange(e.target.value)}>
        <option value="todos">Todos os projetos</option>
        {projetos.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
    </label>
  )
}
