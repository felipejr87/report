import { useState, useEffect, useCallback } from 'react'
import { Flame } from 'lucide-react'

const FASE_LABEL = {
  pt: { discovery: 'DISCOVERY', refinamento: 'REFINAMENTO', downstream: 'DOWNSTREAM', entregue: 'ENTREGUE', operacao: 'OPERAÇÃO' },
  en: { discovery: 'DISCOVERY', refinamento: 'REFINEMENT', downstream: 'DOWNSTREAM', entregue: 'DELIVERED', operacao: 'LIVE' },
}

export default function PainelProjetos({ cliente, idioma = 'pt', versao = 0 }) {
  const [projetos, setProjetos] = useState([])
  const [atividades, setAtividades] = useState([])
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    if (!cliente) return
    const [{ data: p }, { data: a }] = await Promise.all([
      cliente.from('projetos').select('id, nome, fase, quente, data_entrega'),
      cliente.from('atividades').select('id, projeto_id, fase'),
    ])
    setProjetos(p || [])
    setAtividades(a || [])
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente])

  // `versao` sobe a cada atividade confirmada via chat — sem isso este
  // painel só busca dado uma vez no mount e fica desatualizado depois
  // de uma ação do Jarvis na mesma sessão.
  useEffect(() => { carregar() }, [carregar, versao])

  const labels = FASE_LABEL[idioma] || FASE_LABEL.pt
  const TXT = idioma === 'en'
    ? { carregando: 'LOADING...', vazio: 'No active projects.', semAtividades: 'no activities' }
    : { carregando: 'CARREGANDO...', vazio: 'Nenhum projeto ativo.', semAtividades: 'sem atividades' }

  if (carregando) return <div className="hud-panel-label">{TXT.carregando}</div>
  if (projetos.length === 0) return <span className="hud-dim">{TXT.vazio}</span>

  return (
    <div className="proj-lista">
      {projetos.map((p) => {
        const doProjeto = atividades.filter((a) => a.projeto_id === p.id)
        const total = doProjeto.length
        const entregues = doProjeto.filter((a) => a.fase === 'entregue').length
        const pct = total > 0 ? Math.round((entregues / total) * 100) : 0

        return (
          <div key={p.id} className="proj-item">
            <div className="proj-item-topo">
              <span className="proj-nome">
                {p.quente && <Flame size={12} color="var(--hud-amber)" />}
                {p.nome}
              </span>
              <span className="proj-fase">{labels[p.fase] || p.fase}</span>
            </div>
            <div className="hud-progress-bg">
              <div className="hud-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="proj-meta">{total === 0 ? TXT.semAtividades : `${entregues}/${total}`}</div>
          </div>
        )
      })}
    </div>
  )
}
