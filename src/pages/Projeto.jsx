import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom'
import { ArrowLeft, Flame, Plus } from 'lucide-react'
import { supabaseEspaco } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useUsuario } from '../hooks/useUsuario'
import { buscarProximosPassosPendentes, concluirAcao } from '../lib/timeline'
import { ordenarAtividadesPorPrioridade } from '../lib/projeto'
import { ROTULO_FASE_PROJETO } from '../components/ChipFase'
import CardAtividade from '../components/CardAtividade'
import FormAtividade from '../components/FormAtividade'
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
  const [atividades, setAtividades] = useState([])
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

    const [{ data: p, error: eP }, { data: a, error: eA }] = await Promise.all([
      cliente.from('projetos').select('*').eq('id', id).single(),
      cliente.from('atividades').select('*').eq('projeto_id', id).order('atualizado_em', { ascending: false }),
    ])

    if (eP || eA) {
      setErro((eP || eA).message)
      setCarregando(false)
      return
    }

    setProjeto(p)
    setAtividades(a || [])

    if (a?.length) {
      const mapa = await buscarProximosPassosPendentes(cliente, a.map((x) => x.id))
      setProximosPassos(mapa)
    } else {
      setProximosPassos({})
    }
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sessao?.token])

  useEffect(() => { carregar() }, [carregar])

  if (!sessao) return <Navigate to="/" replace />

  async function criarAtividade(dados) {
    const { data, error } = await cliente
      .from('atividades')
      .insert({ ...dados, espaco_id: sessao.espaco.id, projeto_id: id })
      .select()
      .single()
    if (error) throw error

    await cliente.from('movimentos').insert({
      atividade_id: data.id,
      tipo: 'criacao',
      detalhe: { texto: 'Atividade criada', usuario: usuario || null },
    })

    toast?.sucesso('Atividade criada.')
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

  async function excluirProjeto() {
    const { error } = await cliente.from('projetos').delete().eq('id', id)
    if (error) throw error
    toast?.sucesso('Projeto excluído.')
    navigate('/projetos')
  }

  async function concluirPasso(movimento, atividadeId) {
    try {
      await concluirAcao(cliente, movimento.id, atividadeId, usuario)
      toast?.sucesso('Passo concluído.')
      await carregar()
    } catch (err) {
      toast?.erro(err.message)
    }
  }

  if (carregando) return <p className="text-body" style={{ padding: 'var(--space-lg)' }}>Carregando...</p>
  if (erro) return <p role="alert" className="campo-erro" style={{ padding: 'var(--space-lg)' }}>{erro}</p>
  if (!projeto) return null

  const atividadesOrdenadas = ordenarAtividadesPorPrioridade(atividades)

  return (
    <div className="detalhe-pagina" style={{ maxWidth: 760 }}>
      <header className="detalhe-header">
        <Link to="/projetos" className="link-voltar">
          <ArrowLeft size={16} />
          Projetos
        </Link>
        <Link to={`/projetos/timeline/${id}`} className="link-acao">Ver timeline</Link>
      </header>

      <div className="detalhe-titulo-area">
        <h1 className="text-hero" style={{ fontSize: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
          {projeto.quente && <Flame size={22} color="var(--atencao)" aria-label="Quente" />}
          {projeto.nome}
        </h1>
        <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
          <span className="text-micro">{ROTULO_FASE_PROJETO[projeto.fase] || projeto.fase}</span>
          {projeto.data_entrega && (
            <span className="text-micro">entrega {new Date(projeto.data_entrega).toLocaleDateString('pt-BR')}</span>
          )}
          <button type="button" className="link-acao" onClick={() => setMostrarEditarProjeto(true)}>Editar projeto</button>
        </div>
      </div>

      {(projeto.resumo || projeto.objetivo || projeto.okr || projeto.ganho || projeto.pilar || projeto.data_lancamento) && (
        <section className="detalhe-secao">
          <h2 className="section-label">Sobre o épico</h2>
          {projeto.resumo && <p className="text-body">{projeto.resumo}</p>}
          {projeto.objetivo && <p className="text-body" style={{ color: 'var(--text-mid)' }}>{projeto.objetivo}</p>}
          <div className="detalhe-meta-grade">
            {projeto.okr && <span><span className="meta-label">OKR</span> {projeto.okr}</span>}
            {projeto.ganho && <span><span className="meta-label">Ganho</span> {projeto.ganho}</span>}
            {projeto.pilar && <span><span className="meta-label">Pilar</span> {projeto.pilar}</span>}
            {projeto.data_lancamento && (
              <span><span className="meta-label">Lançamento</span> {new Date(projeto.data_lancamento).toLocaleDateString('pt-BR')}</span>
            )}
          </div>
        </section>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn-primario" onClick={() => setMostrarNova(true)}>
          <Plus size={16} style={{ marginRight: 4, verticalAlign: -3 }} />
          Nova atividade
        </button>
      </div>

      {erro && <p role="alert" className="campo-erro">{erro}</p>}

      {atividadesOrdenadas.length === 0 ? (
        <EstadoVazio onCriar={() => setMostrarNova(true)} />
      ) : (
        <div className="lista">
          {atividadesOrdenadas.map((a) => (
            <CardAtividade
              key={a.id}
              atividade={{ ...a, proximoPasso: proximosPassos[a.id] }}
              onConcluirPasso={concluirPasso}
              onClick={() => navigate(`/projetos/atividade/${a.id}`)}
            />
          ))}
        </div>
      )}

      {mostrarNova && (
        <Modal titulo="Nova atividade" onFechar={() => setMostrarNova(false)}>
          <FormAtividade outrasAtividades={atividades} onSalvar={criarAtividade} onCancelar={() => setMostrarNova(false)} />
        </Modal>
      )}

      {mostrarEditarProjeto && (
        <Modal titulo="Editar projeto" onFechar={() => setMostrarEditarProjeto(false)}>
          <FormProjeto
            inicial={projeto}
            totalAtividades={atividades.length}
            onSalvar={salvarProjeto}
            onExcluir={excluirProjeto}
            onCancelar={() => setMostrarEditarProjeto(false)}
          />
        </Modal>
      )}
    </div>
  )
}
