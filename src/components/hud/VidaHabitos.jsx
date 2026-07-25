import { useState, useEffect, useCallback } from 'react'

function inicioSemanaISO() {
  const hoje = new Date()
  const diaSemana = (hoje.getDay() + 6) % 7
  const inicio = new Date(hoje)
  inicio.setDate(hoje.getDate() - diaSemana)
  inicio.setHours(0, 0, 0, 0)
  return inicio.toISOString().split('T')[0]
}

export default function VidaHabitos({ cliente, idioma = 'pt' }) {
  const [habitos, setHabitos] = useState([])
  const [checks, setChecks] = useState([])
  const [eventos, setEventos] = useState([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    if (!cliente) return
    const inicioSemana = inicioSemanaISO()
    const inicioHoje = new Date()
    inicioHoje.setHours(0, 0, 0, 0)

    const { data: hs } = await cliente.from('habitos').select('id, nome, frequencia_semanal').eq('ativo', true).order('criado_em')
    const [{ data: cks }, { data: evs }] = await Promise.all([
      cliente.from('habito_checks').select('habito_id').in('habito_id', (hs || []).map((h) => h.id)).gte('data', inicioSemana),
      cliente.from('eventos_cal').select('titulo, inicio').gte('inicio', inicioHoje.toISOString()).order('inicio').limit(4),
    ])

    setHabitos(hs || [])
    setChecks(cks || [])
    setEventos(evs || [])
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente])

  useEffect(() => { carregar() }, [carregar])

  const TXT = idioma === 'en'
    ? { carregando: 'LOADING...', semHabito: 'No habits yet.', semEvento: 'No upcoming events.' }
    : { carregando: 'CARREGANDO...', semHabito: 'Nenhum hábito ainda.', semEvento: 'Sem próximos eventos.' }

  if (carregando) return <div className="hud-panel-label">{TXT.carregando}</div>

  return (
    <>
      {habitos.length === 0 ? (
        <span className="hud-dim">{TXT.semHabito}</span>
      ) : (
        <div className="vida-habitos">
          {habitos.map((h) => {
            const feitos = checks.filter((c) => c.habito_id === h.id).length
            const pct = h.frequencia_semanal > 0 ? Math.min(100, Math.round((feitos / h.frequencia_semanal) * 100)) : 0
            return (
              <div key={h.id}>
                <div className="vida-habito-topo">
                  <span className="vida-habito-nome">{h.nome}</span>
                  <span className="vida-habito-contagem">{feitos}/{h.frequencia_semanal}</span>
                </div>
                <div className="hud-progress-bg">
                  <div className={`hud-progress-fill ${pct >= 100 ? '' : 'hud-progress-fill--amber'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="vida-agenda">
        {eventos.length === 0 ? (
          <span className="hud-dim">{TXT.semEvento}</span>
        ) : (
          eventos.map((e, i) => (
            <div key={i} className="vida-agenda-item">
              <span className="vida-agenda-hora">
                {new Date(e.inicio).toLocaleDateString(idioma === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
              <span>{e.titulo}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}
