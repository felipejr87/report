import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom'
import { ArrowLeft, Copy, Check } from 'lucide-react'
import { supabaseEspaco } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { concluirAcao, adicionarAcao, gerarReportTexto } from '../lib/timeline'
import ChipFase from '../components/ChipFase'
import Modal from '../components/Modal'
import FormDemanda from '../components/FormDemanda'

export default function Demanda() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { sessao } = useAuth()
  const toast = useToast()

  const [demanda, setDemanda] = useState(null)
  const [movimentos, setMovimentos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [novoPasso, setNovoPasso] = useState('')
  const [enviandoPasso, setEnviandoPasso] = useState(false)
  const [mostrarEditar, setMostrarEditar] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const carregar = useCallback(async () => {
    if (!cliente) return
    setCarregando(true)
    setErro('')

    const [{ data: d, error: eD }, { data: m, error: eM }] = await Promise.all([
      cliente.from('demandas').select('*').eq('id', id).single(),
      cliente.from('movimentos').select('*').eq('demanda_id', id).order('criado_em', { ascending: false }),
    ])

    if (eD || eM) {
      setErro((eD || eM).message)
    } else {
      setDemanda(d)
      setMovimentos(m || [])
    }
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sessao?.token])

  useEffect(() => { carregar() }, [carregar])

  if (!sessao) return <Navigate to="/" replace />

  const proximoPasso = movimentos.find((m) => m.tipo === 'acao_planejada' && m.status === 'pendente')
  const feitos = movimentos
    .filter((m) => m.status === 'concluido' && m.detalhe?.texto)
    .sort((a, b) => new Date(b.concluido_em || b.criado_em) - new Date(a.concluido_em || a.criado_em))

  async function handleConcluirPasso() {
    try {
      await concluirAcao(cliente, proximoPasso.id, id)
      toast?.sucesso('Passo concluído.')
      await carregar()
    } catch (err) {
      toast?.erro(err.message)
    }
  }

  async function handleAdicionarPasso() {
    if (!novoPasso.trim()) return
    setEnviandoPasso(true)
    try {
      await adicionarAcao(cliente, id, novoPasso.trim())
      setNovoPasso('')
      await carregar()
    } catch (err) {
      toast?.erro(err.message)
    } finally {
      setEnviandoPasso(false)
    }
  }

  async function handleConcluirDemanda() {
    const { error } = await cliente
      .from('demandas')
      .update({ fase: 'entregue', atualizado_em: new Date().toISOString() })
      .eq('id', id)
    if (error) { toast?.erro(error.message); return }

    await cliente.from('movimentos').insert({
      demanda_id: id,
      tipo: 'fase',
      detalhe: { de: demanda.fase, para: 'entregue' },
    })

    toast?.sucesso('Demanda concluída.')
    await carregar()
  }

  async function handleSalvarEdicao(dados) {
    const { error } = await cliente
      .from('demandas')
      .update({ ...dados, atualizado_em: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    await cliente.from('movimentos').insert({
      demanda_id: id,
      tipo: 'edicao',
      detalhe: dados,
    })
    toast?.sucesso('Demanda atualizada.')
    setMostrarEditar(false)
    await carregar()
  }

  async function handleExcluir() {
    const { error } = await cliente.from('demandas').delete().eq('id', id)
    if (error) throw error
    toast?.sucesso('Demanda excluída.')
    navigate('/espaco')
  }

  async function handleCopiarReport() {
    const texto = gerarReportTexto(demanda, movimentos)
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    toast?.sucesso('Report copiado.')
    setTimeout(() => setCopiado(false), 2000)
  }

  if (carregando) return <p className="text-body" style={{ padding: 'var(--space-lg)' }}>Carregando...</p>
  if (erro) return <p role="alert" className="campo-erro" style={{ padding: 'var(--space-lg)' }}>{erro}</p>
  if (!demanda) return null

  return (
    <div className="detalhe-pagina">
      <header className="detalhe-header">
        <Link to="/espaco" className="link-voltar">
          <ArrowLeft size={16} />
          Voltar
        </Link>
        <button type="button" className="btn-secundario" onClick={handleCopiarReport}>
          {copiado ? <Check size={14} /> : <Copy size={14} />}
          {copiado ? 'Copiado' : 'Copiar report'}
        </button>
      </header>

      <div className="detalhe-titulo-area">
        <ChipFase fase={demanda.fase} />
        {demanda.projeto && <span className="text-micro">{demanda.projeto}</span>}
        <h1 className="text-hero">{demanda.nome}</h1>
        <button type="button" className="link-acao" onClick={() => setMostrarEditar(true)}>Editar</button>
      </div>

      <section className="detalhe-secao">
        <h2 className="section-label">O que é</h2>
        <p className="text-body">{demanda.resumo}</p>
        {demanda.objetivo && <p className="text-body" style={{ color: 'var(--text-mid)' }}>{demanda.objetivo}</p>}
        <div className="detalhe-meta-grade">
          {demanda.okr && <span><span className="meta-label">OKR</span> {demanda.okr}</span>}
          {demanda.ganho && <span><span className="meta-label">Ganho</span> {demanda.ganho}</span>}
          {demanda.responsavel && <span><span className="meta-label">Responsável</span> {demanda.responsavel}</span>}
          {demanda.estimativa != null && <span><span className="meta-label">Estimativa</span> {demanda.estimativa} pts</span>}
          {demanda.link_jira && <span><a href={demanda.link_jira} target="_blank" rel="noreferrer" className="link-acao">Ver no Jira</a></span>}
        </div>
      </section>

      <section className="detalhe-secao">
        <h2 className="section-label">Próximo passo</h2>
        {proximoPasso ? (
          <div className="proximo-passo-linha">
            <span>{proximoPasso.detalhe.texto}</span>
            <button type="button" className="link-acao" onClick={handleConcluirPasso}>
              Marcar como concluído
            </button>
          </div>
        ) : (
          <p className="text-micro">Nenhum próximo passo definido.</p>
        )}
      </section>

      {feitos.length > 0 && (
        <section className="detalhe-secao">
          <h2 className="section-label">O que já foi feito</h2>
          <div className="timeline">
            {feitos.map((m) => (
              <div key={m.id} className="timeline-item">
                <span className="text-micro" style={{ whiteSpace: 'nowrap' }}>
                  {new Date(m.concluido_em || m.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </span>
                <span className="text-body">{m.detalhe?.texto}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="detalhe-secao detalhe-acoes">
        {!proximoPasso && (
          <div className="adicionar-passo">
            <input
              type="text"
              placeholder="Próximo passo..."
              value={novoPasso}
              onChange={(e) => setNovoPasso(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdicionarPasso()}
            />
            <button type="button" className="btn-secundario" onClick={handleAdicionarPasso} disabled={!novoPasso.trim() || enviandoPasso}>
              Adicionar
            </button>
          </div>
        )}

        {!proximoPasso && demanda.fase !== 'entregue' && (
          <button type="button" className="link-acao" onClick={handleConcluirDemanda}>
            Concluir demanda
          </button>
        )}
      </section>

      {mostrarEditar && (
        <Modal titulo="Editar demanda" onFechar={() => setMostrarEditar(false)}>
          <FormDemanda
            inicial={demanda}
            onSalvar={handleSalvarEdicao}
            onExcluir={handleExcluir}
            onCancelar={() => setMostrarEditar(false)}
          />
        </Modal>
      )}
    </div>
  )
}
