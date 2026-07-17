import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Navigate, Link } from 'react-router-dom'
import { ArrowLeft, Copy, Check, Pencil } from 'lucide-react'
import { supabaseEspaco } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useUsuario } from '../hooks/useUsuario'
import { concluirAcao, adicionarAcao, editarAcao, gerarReportTexto } from '../lib/timeline'
import ChipFase, { ROTULO_FASE } from '../components/ChipFase'
import Modal from '../components/Modal'
import FormDemanda from '../components/FormDemanda'

const ROTULO_TIPO_MOVIMENTO = {
  criacao: 'Demanda criada',
  edicao: 'Demanda editada',
}

function descricaoMovimento(m) {
  if (m.tipo === 'fase' && m.detalhe?.de && m.detalhe?.para) {
    return `Movida de ${ROTULO_FASE[m.detalhe.de] || m.detalhe.de} para ${ROTULO_FASE[m.detalhe.para] || m.detalhe.para}`
  }
  if (m.tipo === 'acao_planejada') return `Próximo passo definido: "${m.detalhe?.texto}"`
  if (m.tipo === 'acao_concluida') return `Passo concluído: "${m.detalhe?.texto}"`
  if (m.tipo === 'edicao' && m.detalhe?.de !== undefined) return `${m.detalhe.texto}: "${m.detalhe.de}" → "${m.detalhe.para}"`
  return ROTULO_TIPO_MOVIMENTO[m.tipo] || m.tipo
}

function usuarioDoMovimento(m) {
  return m.detalhe?.usuario || m.detalhe?.criado_por || m.detalhe?.concluido_por || m.detalhe?.editado_por
}

export default function Demanda() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { sessao } = useAuth()
  const toast = useToast()
  const { usuario } = useUsuario()

  const [demanda, setDemanda] = useState(null)
  const [projeto, setProjeto] = useState(null)
  const [movimentos, setMovimentos] = useState([])
  const [outrasDemandas, setOutrasDemandas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [novoPasso, setNovoPasso] = useState('')
  const [enviandoPasso, setEnviandoPasso] = useState(false)
  const [editandoPasso, setEditandoPasso] = useState(false)
  const [textoEdicaoPasso, setTextoEdicaoPasso] = useState('')
  const [mostrarEditar, setMostrarEditar] = useState(false)
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const carregar = useCallback(async () => {
    if (!cliente) return
    setCarregando(true)
    setErro('')

    const [{ data: d, error: eD }, { data: m, error: eM }, { data: outras, error: eO }] = await Promise.all([
      cliente.from('demandas').select('*').eq('id', id).single(),
      cliente.from('movimentos').select('*').eq('demanda_id', id).order('criado_em', { ascending: false }),
      cliente.from('demandas').select('id, nome, predecessora_id'),
    ])

    if (eD || eM || eO) {
      setErro((eD || eM || eO).message)
      setCarregando(false)
      return
    }

    setDemanda(d)
    setMovimentos(m || [])
    setOutrasDemandas((outras || []).filter((o) => o.id !== id))

    if (d.projeto_id) {
      const { data: p } = await cliente.from('projetos').select('id, nome').eq('id', d.projeto_id).single()
      setProjeto(p)
    } else {
      setProjeto(null)
    }
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sessao?.token])

  useEffect(() => { carregar() }, [carregar])

  if (!sessao) return <Navigate to="/" replace />

  const predecessora = outrasDemandas.find((o) => o.id === demanda?.predecessora_id)
  const sucessoras = outrasDemandas.filter((o) => o.predecessora_id === id)

  const proximoPasso = movimentos.find((m) => m.tipo === 'acao_planejada' && m.status === 'pendente')
  const feitos = movimentos
    .filter((m) => m.status === 'concluido' && m.detalhe?.texto)
    .sort((a, b) => new Date(b.concluido_em || b.criado_em) - new Date(a.concluido_em || a.criado_em))
  const historicoCompleto = movimentos
    .slice()
    .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))

  async function handleConcluirPasso() {
    try {
      await concluirAcao(cliente, proximoPasso.id, id, usuario)
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
      await adicionarAcao(cliente, id, novoPasso.trim(), usuario)
      setNovoPasso('')
      await carregar()
    } catch (err) {
      toast?.erro(err.message)
    } finally {
      setEnviandoPasso(false)
    }
  }

  function abrirEdicaoPasso() {
    setTextoEdicaoPasso(proximoPasso.detalhe.texto)
    setEditandoPasso(true)
  }

  async function handleSalvarEdicaoPasso() {
    if (!textoEdicaoPasso.trim()) return
    try {
      await editarAcao(cliente, proximoPasso, id, textoEdicaoPasso.trim(), usuario)
      toast?.sucesso('Próximo passo editado.')
      setEditandoPasso(false)
      await carregar()
    } catch (err) {
      toast?.erro(err.message)
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
      detalhe: { de: demanda.fase, para: 'entregue', usuario: usuario || null },
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
      detalhe: { texto: 'Demanda editada', usuario: usuario || null },
    })
    toast?.sucesso('Demanda atualizada.')
    setMostrarEditar(false)
    await carregar()
  }

  async function handleExcluir() {
    const { error } = await cliente.from('demandas').delete().eq('id', id)
    if (error) throw error
    toast?.sucesso('Demanda excluída.')
    navigate(demanda.projeto_id ? `/espaco/projeto/${demanda.projeto_id}` : '/espaco')
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
        <Link to={demanda.projeto_id ? `/espaco/projeto/${demanda.projeto_id}` : '/espaco'} className="link-voltar">
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
        {projeto && <Link to={`/espaco/projeto/${projeto.id}`} className="text-micro">{projeto.nome}</Link>}
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
          {predecessora && (
            <span>
              <span className="meta-label">Depende de</span>
              <Link to={`/espaco/demanda/${predecessora.id}`} className="link-acao">{predecessora.nome}</Link>
            </span>
          )}
          {sucessoras.length > 0 && (
            <span>
              <span className="meta-label">Bloqueia</span>
              {sucessoras.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ', '}
                  <Link to={`/espaco/demanda/${s.id}`} className="link-acao">{s.nome}</Link>
                </span>
              ))}
            </span>
          )}
        </div>
      </section>

      <section className="detalhe-secao">
        <h2 className="section-label">Próximo passo</h2>
        {proximoPasso ? (
          editandoPasso ? (
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-end' }}>
              <label className="campo" style={{ flex: 1 }}>
                <input
                  value={textoEdicaoPasso}
                  onChange={(e) => setTextoEdicaoPasso(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSalvarEdicaoPasso()}
                  autoFocus
                />
              </label>
              <button type="button" className="btn-secundario" onClick={() => setEditandoPasso(false)}>Cancelar</button>
              <button type="button" className="btn-primario" onClick={handleSalvarEdicaoPasso} disabled={!textoEdicaoPasso.trim()}>Salvar</button>
            </div>
          ) : (
            <div className="proximo-passo-linha">
              <span>{proximoPasso.detalhe.texto}</span>
              <span style={{ display: 'flex', gap: 'var(--space-md)' }}>
                <button type="button" className="link-acao" onClick={abrirEdicaoPasso}>
                  <Pencil size={12} />
                  Editar
                </button>
                <button type="button" className="link-acao" onClick={handleConcluirPasso}>
                  Marcar como concluído
                </button>
              </span>
            </div>
          )
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
                <span className="text-body">
                  {m.detalhe?.texto}
                  {usuarioDoMovimento(m) && <span className="text-micro"> · {usuarioDoMovimento(m)}</span>}
                </span>
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

      <section className="detalhe-secao">
        <button
          type="button"
          className="link-acao toggle-detalhes"
          onClick={() => setMostrarHistorico((v) => !v)}
          aria-expanded={mostrarHistorico}
        >
          Histórico completo {historicoCompleto.length ? `(${historicoCompleto.length})` : ''}
        </button>
        {mostrarHistorico && (
          <div className="timeline" style={{ marginTop: 'var(--space-sm)' }}>
            {historicoCompleto.map((m) => (
              <div key={m.id} className="timeline-item">
                <span className="text-micro" style={{ whiteSpace: 'nowrap' }}>
                  {new Date(m.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </span>
                <span className="text-body">
                  {descricaoMovimento(m)}
                  {usuarioDoMovimento(m) && <span className="text-micro"> · {usuarioDoMovimento(m)}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {mostrarEditar && (
        <Modal titulo="Editar demanda" onFechar={() => setMostrarEditar(false)}>
          <FormDemanda
            inicial={demanda}
            outrasDemandas={outrasDemandas}
            onSalvar={handleSalvarEdicao}
            onExcluir={handleExcluir}
            onCancelar={() => setMostrarEditar(false)}
          />
        </Modal>
      )}
    </div>
  )
}
