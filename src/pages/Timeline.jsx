import { useEffect, useState } from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabaseEspaco } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { calcularGantt } from '../lib/timeline'
import { ROTULO_FASE, FASES } from '../components/ChipFase'

function formatarData(d) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function Timeline() {
  const { id } = useParams()
  const { sessao } = useAuth()

  const [projeto, setProjeto] = useState(null)
  const [atividades, setAtividades] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  useEffect(() => {
    async function carregar() {
      if (!cliente) return
      setCarregando(true)
      const [{ data: p, error: eP }, { data: a, error: eA }] = await Promise.all([
        cliente.from('projetos').select('*').eq('id', id).single(),
        cliente.from('atividades').select('*').eq('projeto_id', id),
      ])
      if (eP || eA) setErro((eP || eA).message)
      else {
        setProjeto(p)
        setAtividades(a || [])
      }
      setCarregando(false)
    }
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sessao?.token])

  if (!sessao) return <Navigate to="/" replace />

  const mapaNomes = Object.fromEntries(atividades.map((a) => [a.id, a.nome]))
  const { itens, semData, inicio, fim } = calcularGantt(atividades)
  const hoje = new Date()
  const hojePct = inicio && fim
    ? ((hoje.getTime() - inicio.getTime()) / (fim.getTime() - inicio.getTime())) * 100
    : null

  return (
    <div className="detalhe-pagina" style={{ maxWidth: 860 }}>
      <header className="detalhe-header">
        <Link to={`/espaco/projeto/${id}`} className="link-voltar">
          <ArrowLeft size={16} />
          Voltar
        </Link>
      </header>

      <div className="detalhe-titulo-area">
        <span className="text-micro">Timeline do projeto</span>
        <h1 className="text-hero" style={{ fontSize: 28 }}>{projeto?.nome || '...'}</h1>
      </div>

      {erro && <p role="alert" className="campo-erro">{erro}</p>}

      {carregando ? (
        <p className="text-body" style={{ color: 'var(--text-dim)' }}>Carregando...</p>
      ) : atividades.length === 0 ? (
        <p className="text-micro">Nenhuma atividade nesse projeto.</p>
      ) : (
        <>
          <section className="detalhe-secao">
            <h2 className="section-label">Legenda</h2>
            <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
              {FASES.map((f) => (
                <span key={f} className="fase-indicador">
                  <span className="fase-ponto" data-fase={f} aria-hidden="true" />
                  {ROTULO_FASE[f]}
                </span>
              ))}
            </div>
          </section>

          {itens.length > 0 && (
            <section className="detalhe-secao">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
                <span className="text-micro">{formatarData(inicio)}</span>
                <span className="text-micro">{formatarData(fim)}</span>
              </div>

              <div className="gantt">
                {hojePct != null && hojePct >= 0 && hojePct <= 100 && (
                  <div className="gantt-hoje" style={{ left: `${hojePct}%` }} title="Hoje" />
                )}
                {itens.map((item) => (
                  <div key={item.atividade.id} className="gantt-linha">
                    <div className="gantt-label">
                      <Link to={`/espaco/atividade/${item.atividade.id}`} className="link-acao" style={{ fontWeight: 500 }}>
                        {item.atividade.nome}
                      </Link>
                      {item.atividade.predecessora_id && (
                        <span className="text-micro">
                          {' '}depende de {mapaNomes[item.atividade.predecessora_id] || 'atividade de outro projeto'}
                        </span>
                      )}
                    </div>
                    <div className="gantt-trilha">
                      <div
                        className="gantt-barra"
                        data-fase={item.atividade.fase}
                        data-aberta={item.semDataFim}
                        style={{ left: `${item.offsetPct}%`, width: `${item.larguraPct}%` }}
                        title={`${item.atividade.data_inicio} → ${item.atividade.data_fim || 'em andamento'}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {semData.length > 0 && (
            <section className="detalhe-secao">
              <h2 className="section-label">Sem data definida</h2>
              <div className="timeline">
                {semData.map((a) => (
                  <div key={a.id} className="timeline-item">
                    <span className="fase-ponto" data-fase={a.fase} aria-hidden="true" style={{ marginTop: 6 }} />
                    <Link to={`/espaco/atividade/${a.id}`} className="link-acao">{a.nome}</Link>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
