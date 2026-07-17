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
  const [demandas, setDemandas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  useEffect(() => {
    async function carregar() {
      if (!cliente) return
      setCarregando(true)
      const [{ data: p, error: eP }, { data: d, error: eD }] = await Promise.all([
        cliente.from('projetos').select('*').eq('id', id).single(),
        cliente.from('demandas').select('*').eq('projeto_id', id),
      ])
      if (eP || eD) setErro((eP || eD).message)
      else {
        setProjeto(p)
        setDemandas(d || [])
      }
      setCarregando(false)
    }
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sessao?.token])

  if (!sessao) return <Navigate to="/" replace />

  const mapaNomes = Object.fromEntries(demandas.map((d) => [d.id, d.nome]))
  const { itens, semData, inicio, fim } = calcularGantt(demandas)
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
      ) : demandas.length === 0 ? (
        <p className="text-micro">Nenhuma demanda nesse projeto.</p>
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
                  <div key={item.demanda.id} className="gantt-linha">
                    <div className="gantt-label">
                      <Link to={`/espaco/demanda/${item.demanda.id}`} className="link-acao" style={{ fontWeight: 500 }}>
                        {item.demanda.nome}
                      </Link>
                      {item.demanda.predecessora_id && (
                        <span className="text-micro">
                          {' '}depende de {mapaNomes[item.demanda.predecessora_id] || 'demanda de outro projeto'}
                        </span>
                      )}
                    </div>
                    <div className="gantt-trilha">
                      <div
                        className="gantt-barra"
                        data-fase={item.demanda.fase}
                        data-aberta={item.semDataFim}
                        style={{ left: `${item.offsetPct}%`, width: `${item.larguraPct}%` }}
                        title={`${item.demanda.data_inicio} → ${item.demanda.data_fim || 'em andamento'}`}
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
                {semData.map((d) => (
                  <div key={d.id} className="timeline-item">
                    <span className="fase-ponto" data-fase={d.fase} aria-hidden="true" style={{ marginTop: 6 }} />
                    <Link to={`/espaco/demanda/${d.id}`} className="link-acao">{d.nome}</Link>
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
