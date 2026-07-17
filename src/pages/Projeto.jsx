import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom'
import { ArrowLeft, Flame, Plus } from 'lucide-react'
import { supabaseEspaco } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useUsuario } from '../hooks/useUsuario'
import { buscarProximosPassosPendentes, concluirAcao } from '../lib/timeline'
import { ordenarDemandasPorPrioridade } from '../lib/projeto'
import CardDemanda from '../components/CardDemanda'
import FormDemanda from '../components/FormDemanda'
import FormProjeto from '../components/FormProjeto'
import Modal from '../components/Modal'
import EstadoVazio from '../components/EstadoVazio'

export default function Projeto() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { sessao } = useAuth()
  const toast = useToast()
  const { usuario } = useUsuario()

  const [projeto, setProjeto] = useState(null)
  const [demandas, setDemandas] = useState([])
  const [proximosPassos, setProximosPassos] = useState({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mostrarNova, setMostrarNova] = useState(false)
  const [mostrarEditarProjeto, setMostrarEditarProjeto] = useState(false)

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const carregar = useCallback(async () => {
    if (!cliente) return
    setCarregando(true)
    setErro('')

    const [{ data: p, error: eP }, { data: d, error: eD }] = await Promise.all([
      cliente.from('projetos').select('*').eq('id', id).single(),
      cliente.from('demandas').select('*').eq('projeto_id', id).order('atualizado_em', { ascending: false }),
    ])

    if (eP || eD) {
      setErro((eP || eD).message)
      setCarregando(false)
      return
    }

    setProjeto(p)
    setDemandas(d || [])

    if (d?.length) {
      const mapa = await buscarProximosPassosPendentes(cliente, d.map((x) => x.id))
      setProximosPassos(mapa)
    } else {
      setProximosPassos({})
    }
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sessao?.token])

  useEffect(() => { carregar() }, [carregar])

  if (!sessao) return <Navigate to="/" replace />

  async function criarDemanda(dados) {
    const { data, error } = await cliente
      .from('demandas')
      .insert({ ...dados, espaco_id: sessao.espaco.id, projeto_id: id })
      .select()
      .single()
    if (error) throw error

    await cliente.from('movimentos').insert({
      demanda_id: data.id,
      tipo: 'criacao',
      detalhe: { texto: 'Demanda criada', usuario: usuario || null },
    })

    toast?.sucesso('Demanda criada.')
    setMostrarNova(false)
    await carregar()
  }

  async function salvarProjeto(dados) {
    const { error } = await cliente.from('projetos').update(dados).eq('id', id)
    if (error) throw error
    toast?.sucesso('Projeto atualizado.')
    setMostrarEditarProjeto(false)
    await carregar()
  }

  async function concluirPasso(movimento, demandaId) {
    try {
      await concluirAcao(cliente, movimento.id, demandaId, usuario)
      toast?.sucesso('Passo concluído.')
      await carregar()
    } catch (err) {
      toast?.erro(err.message)
    }
  }

  if (carregando) return <p className="text-body" style={{ padding: 'var(--space-lg)' }}>Carregando...</p>
  if (erro) return <p role="alert" className="campo-erro" style={{ padding: 'var(--space-lg)' }}>{erro}</p>
  if (!projeto) return null

  const demandasOrdenadas = ordenarDemandasPorPrioridade(demandas)

  return (
    <div className="detalhe-pagina" style={{ maxWidth: 760 }}>
      <header className="detalhe-header">
        <Link to="/espaco" className="link-voltar">
          <ArrowLeft size={16} />
          Projetos
        </Link>
        <Link to={`/espaco/timeline/${id}`} className="link-acao">Ver timeline</Link>
      </header>

      <div className="detalhe-titulo-area">
        <h1 className="text-hero" style={{ fontSize: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
          {projeto.quente && <Flame size={22} color="var(--atencao)" aria-label="Quente" />}
          {projeto.nome}
        </h1>
        <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
          {projeto.data_entrega && (
            <span className="text-micro">entrega {new Date(projeto.data_entrega).toLocaleDateString('pt-BR')}</span>
          )}
          <button type="button" className="link-acao" onClick={() => setMostrarEditarProjeto(true)}>Editar projeto</button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn-primario" onClick={() => setMostrarNova(true)}>
          <Plus size={16} style={{ marginRight: 4, verticalAlign: -3 }} />
          Nova demanda
        </button>
      </div>

      {erro && <p role="alert" className="campo-erro">{erro}</p>}

      {demandasOrdenadas.length === 0 ? (
        <EstadoVazio onCriar={() => setMostrarNova(true)} />
      ) : (
        <div className="lista-demandas">
          {demandasOrdenadas.map((d) => (
            <CardDemanda
              key={d.id}
              demanda={{ ...d, proximoPasso: proximosPassos[d.id] }}
              onConcluirPasso={concluirPasso}
              onClick={() => navigate(`/espaco/demanda/${d.id}`)}
            />
          ))}
        </div>
      )}

      {mostrarNova && (
        <Modal titulo="Nova demanda" onFechar={() => setMostrarNova(false)}>
          <FormDemanda outrasDemandas={demandas} onSalvar={criarDemanda} onCancelar={() => setMostrarNova(false)} />
        </Modal>
      )}

      {mostrarEditarProjeto && (
        <Modal titulo="Editar projeto" onFechar={() => setMostrarEditarProjeto(false)}>
          <FormProjeto inicial={projeto} onSalvar={salvarProjeto} onCancelar={() => setMostrarEditarProjeto(false)} />
        </Modal>
      )}
    </div>
  )
}
