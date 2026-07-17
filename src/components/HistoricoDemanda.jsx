import { ROTULO_FASE } from './ChipFase'

const ROTULO_TIPO = {
  criacao: 'Demanda criada',
  edicao: 'Demanda editada',
  estimativa: 'Estimativa alterada',
}

function descricao(mov) {
  if (mov.tipo === 'fase' && mov.detalhe?.de && mov.detalhe?.para) {
    const de = ROTULO_FASE[mov.detalhe.de] || mov.detalhe.de
    const para = ROTULO_FASE[mov.detalhe.para] || mov.detalhe.para
    return `Movida de ${de} para ${para}`
  }
  return ROTULO_TIPO[mov.tipo] || mov.tipo
}

function formatarData(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function HistoricoDemanda({ movimentos }) {
  if (!movimentos || movimentos.length === 0) {
    return <p className="text-micro">Sem histórico ainda.</p>
  }

  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', listStyle: 'none' }}>
      {movimentos.map((m) => (
        <li
          key={m.id}
          className="text-micro"
          style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-sm)', borderBottom: '1px solid var(--line)', paddingBottom: 4 }}
        >
          <span style={{ color: 'var(--text)' }}>{descricao(m)}</span>
          <span style={{ whiteSpace: 'nowrap' }}>{formatarData(m.criado_em)}</span>
        </li>
      ))}
    </ul>
  )
}
