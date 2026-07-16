import { Plus } from 'lucide-react'

export default function EstadoVazio({ onCriar }) {
  return (
    <div className="estado-vazio">
      <p className="text-body">Nenhuma demanda ainda.<br />Crie a primeira para começar.</p>
      <button type="button" className="btn-primario" onClick={onCriar}>
        <Plus size={16} style={{ marginRight: 4, verticalAlign: -3 }} />
        Criar demanda
      </button>
    </div>
  )
}
