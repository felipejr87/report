import { useEffect, useState, useCallback } from 'react'
import { Navigate, useNavigate, Link } from 'react-router-dom'
import { supabaseEspaco } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { buscarProximosPassosPendentes, concluirAcao } from '../lib/timeline'
import Header from '../components/Header'
import FiltroProjeto from '../components/FiltroProjeto'
import CardDemanda from '../components/CardDemanda'
import FormDemanda from '../components/FormDemanda'
import Modal from '../components/Modal'
import EstadoVazio from '../components/EstadoVazio'

export default function Espaco() {
  const { sessao, sair } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [demandas, setDemandas] = useState([])
  const [proximosPassos, setProximosPassos] = useState({})
  const [filtroProjeto, setFiltroProjeto] = useState('todos')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mostrarNova, setMostrarNova] = useState(false)

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const carregar = useCallback(async () => {
    if (!cliente) return
    setCarregando(true)
    setErro('')

    const { data, error } = await cliente
      .from('demandas')
      .select('*')
      .order('atualizado_em', { ascending: false })

    if (error) {
      setErro(error.message)
      setCarregando(false)
      return
    }

    setDemandas(data)

    if (data.length) {
      const mapa = await buscarProximosPassosPendentes(cliente, data.map((d) => d.id))
      setProximosPassos(mapa)
    } else {
      setProximosPassos({})
    }
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  useEffect(() => { carregar() }, [carregar])

  if (!sessao) return <Navigate to="/" replace />

  const demandasFiltradas = demandas.filter(
    (d) => filtroProjeto === 'todos' || d.projeto === filtroProjeto
  )

  async function criar(dados) {
    const { data, error } = await cliente
      .from('demandas')
      .insert({ ...dados, espaco_id: sessao.espaco.id })
      .select()
      .single()
    if (error) throw error

    await cliente.from('movimentos').insert({
      demanda_id: data.id,
      tipo: 'criacao',
      detalhe: { texto: 'Demanda criada' },
    })

    toast?.sucesso('Demanda criada.')
    setMostrarNova(false)
    await carregar()
  }

  async function concluirPasso(movimento, demandaId) {
    try {
      await concluirAcao(cliente, movimento.id, demandaId)
      toast?.sucesso('Passo concluído.')
      await carregar()
    } catch (err) {
      toast?.erro(err.message)
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <Header espaco={sessao.espaco} onNova={() => setMostrarNova(true)} onSair={sair} />

      <div className="layout-espaco">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
          <FiltroProjeto demandas={demandas} filtro={filtroProjeto} onFiltroChange={setFiltroProjeto} />
          {filtroProjeto !== 'todos' && (
            <Link to={`/espaco/timeline?projeto=${encodeURIComponent(filtroProjeto)}`} className="link-acao">
              Ver timeline
            </Link>
          )}
        </div>

        {erro && <p role="alert" className="campo-erro">{erro}</p>}

        {carregando ? (
          <p className="text-body" style={{ color: 'var(--text-dim)' }}>Carregando...</p>
        ) : demandasFiltradas.length === 0 ? (
          <EstadoVazio onCriar={() => setMostrarNova(true)} />
        ) : (
          <div className="lista-demandas">
            {demandasFiltradas.map((d) => (
              <CardDemanda
                key={d.id}
                demanda={{ ...d, proximoPasso: proximosPassos[d.id] }}
                onConcluirPasso={concluirPasso}
                onClick={() => navigate(`/espaco/demanda/${d.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {mostrarNova && (
        <Modal titulo="Nova demanda" onFechar={() => setMostrarNova(false)}>
          <FormDemanda outrasDemandas={demandas} onSalvar={criar} onCancelar={() => setMostrarNova(false)} />
        </Modal>
      )}
    </div>
  )
}
