const LIMITE_DIAS = 3

function diasDesde(dataIso) {
  const ms = Date.now() - new Date(dataIso).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export default function BadgeParado({ atualizadoEm }) {
  const dias = diasDesde(atualizadoEm)
  if (dias < LIMITE_DIAS) return null

  return <span className="badge-parado">sem movimento {dias}d</span>
}
