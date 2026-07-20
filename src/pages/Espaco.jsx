import { useEffect, useState, useCallback } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Flame, AlertTriangle, Plus, Search, X, Mic, MessageCircle, ClipboardList, Wallet } from 'lucide-react'
import { supabaseEspaco } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { ordenarProjetosPorEntrega, precisaDeTracao } from '../lib/projeto'
import Header from '../components/Header'
import FormProjeto from '../components/FormProjeto'
import Modal from '../components/Modal'

const MARCAS_DIACRITICAS = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g'
)

function normalizar(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, '')
    .toLowerCase()
}

export default function Espaco() {
  const { sessao, sair } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [projetos, setProjetos] = useState([])
  const [atividades, setAtividades] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mostrarNovo, setMostrarNovo] = useState(false)
  const [busca, setBusca] = useState('')

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const carregar = useCallback(async () => {
    if (!cliente) return
    setCarregando(true)
    setErro('')

    const [{ data: p, error: eP }, { data: a, error: eA }] = await Promise.all([
      cliente.from('projetos').select('*'),
      cliente.from('atividades').select('id, nome, resumo, projeto_id, fase, atualizado_em'),
    ])

    if (eP || eA) {
      setErro((eP || eA).message)
    } else {
      setProjetos(p || [])
      setAtividades(a || [])
    }
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  useEffect(() => { carregar() }, [carregar])

  if (!sessao) return <Navigate to="/" replace />

  async function criarProjeto(dados) {
    const { data, error } = await cliente
      .from('projetos')
      .insert({ ...dados, espaco_id: sessao.espaco.id })
      .select()
      .single()
    if (error) throw error

    toast?.sucesso('Projeto criado.')
    setMostrarNovo(false)
    await carregar()
    navigate(`/espaco/projeto/${data.id}`)
  }

  const termo = normalizar(busca)
  const buscando = termo.length > 0

  const mapaProjetos = Object.fromEntries(projetos.map((p) => [p.id, p.nome]))

  const projetosFiltrados = buscando
    ? projetos.filter((p) => normalizar(p.nome).includes(termo))
    : projetos
  const atividadesEncontradas = buscando
    ? atividades.filter((a) => normalizar(a.nome).includes(termo) || normalizar(a.resumo).includes(termo))
    : []

  const projetosOrdenados = ordenarProjetosPorEntrega(projetosFiltrados)
  const isJarvis = sessao.espaco.jarvis_enabled === true

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <Header espaco={sessao.espaco} onSair={sair} />

      {isJarvis && (
        <div className="jarvis-entrada">
          <button type="button" className="jarvis-voz-btn" onClick={() => navigate('/jarvis/assistente')}>
            <Mic size={22} />
            <span>Falar com Jarvis</span>
          </button>
          <div className="jarvis-atalhos">
            <button type="button" className="atalho" onClick={() => navigate('/jarvis/assistente')}>
              <MessageCircle size={14} /> Chat
            </button>
            <button type="button" className="atalho" onClick={() => navigate('/jarvis/brief')}>
              <ClipboardList size={14} /> Brief
            </button>
            <button type="button" className="atalho" onClick={() => navigate('/jarvis/financeiro')}>
              <Wallet size={14} /> Financeiro
            </button>
          </div>
        </div>
      )}

      <div className="layout-espaco">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="text-titulo">Projetos</h1>
          <button type="button" className="btn-primario" onClick={() => setMostrarNovo(true)}>
            <Plus size={16} style={{ marginRight: 4, verticalAlign: -3 }} />
            Novo projeto
          </button>
        </div>

        <label className="campo-busca">
          <Search size={16} color="var(--text-dim)" />
          <input
            type="search"
            placeholder="Buscar projeto ou atividade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {busca && (
            <button type="button" className="modal-fechar" onClick={() => setBusca('')} aria-label="Limpar busca">
              <X size={14} />
            </button>
          )}
        </label>

        {erro && <p role="alert" className="campo-erro">{erro}</p>}

        {carregando ? (
          <p className="text-body" style={{ color: 'var(--text-dim)' }}>Carregando...</p>
        ) : (
          <>
            {buscando && atividadesEncontradas.length > 0 && (
              <section>
                <h2 className="section-label">Atividades</h2>
                <div className="lista">
                  {atividadesEncontradas.map((a) => (
                    <div key={a.id} className="item-atividade" onClick={() => navigate(`/espaco/atividade/${a.id}`)} role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/espaco/atividade/${a.id}`) } }}
                      aria-label={`Abrir atividade ${a.nome}`}
                    >
                      <div className="item-atividade-titulo">{a.nome}</div>
                      <div className="item-atividade-meta">
                        <span>{mapaProjetos[a.projeto_id] || 'sem projeto'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {buscando && <h2 className="section-label" style={{ marginTop: atividadesEncontradas.length ? 'var(--space-md)' : 0 }}>Projetos</h2>}

            {projetosOrdenados.length === 0 ? (
              <p className="text-micro">
                {buscando ? 'Nenhum projeto encontrado.' : 'Nenhum projeto ainda. Crie o primeiro pra começar.'}
              </p>
            ) : (
              <div className="lista">
                {projetosOrdenados.map((p) => {
                  const atividadesDoProjeto = atividades.filter((a) => a.projeto_id === p.id)
                  const tracao = precisaDeTracao(p, atividadesDoProjeto)
                  const total = atividadesDoProjeto.length
                  const entregues = atividadesDoProjeto.filter((a) => a.fase === 'entregue').length

                  return (
                    <div
                      key={p.id}
                      className="item-atividade"
                      onClick={() => navigate(`/espaco/projeto/${p.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/espaco/projeto/${p.id}`) } }}
                      aria-label={`Abrir projeto ${p.nome}`}
                    >
                      <div className="item-atividade-titulo" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.quente && <Flame size={14} color="var(--atencao)" aria-label="Quente" />}
                        {p.nome}
                      </div>
                      <div className="item-atividade-meta">
                        <span>{total === 0 ? 'sem atividades' : `${entregues}/${total} concluídas`}</span>
                        {p.data_entrega && (
                          <>
                            <span className="separador-ponto">·</span>
                            <span>entrega {new Date(p.data_entrega).toLocaleDateString('pt-BR')}</span>
                          </>
                        )}
                        {tracao && (
                          <>
                            <span className="separador-ponto">·</span>
                            <span className="texto-atencao" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <AlertTriangle size={12} />
                              precisa de atenção
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {mostrarNovo && (
        <Modal titulo="Novo projeto" onFechar={() => setMostrarNovo(false)}>
          <FormProjeto onSalvar={criarProjeto} onCancelar={() => setMostrarNovo(false)} />
        </Modal>
      )}
    </div>
  )
}
