import { AlertTriangle } from 'lucide-react'
import { useReducedMotion } from '../hooks/useReducedMotion'

const LIMITE_DIAS = 3

function diasDesde(dataIso) {
  const ms = Date.now() - new Date(dataIso).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export default function BadgeParado({ atualizadoEm }) {
  const reduzido = useReducedMotion()
  const dias = diasDesde(atualizadoEm)
  if (dias < LIMITE_DIAS) return null

  return (
    <span className="badge-parado" data-pulse={!reduzido}>
      <AlertTriangle size={12} />
      Sem movimento há {dias}d
    </span>
  )
}
