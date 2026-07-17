import { useEffect, useState, useCallback } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Flame, AlertTriangle, Plus } from 'lucide-react'
import { supabaseEspaco } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { ordenarProjetosPorEntrega, precisaDeTracao } from '../lib/projeto'
import Header from '../components/Header'
import FormProjeto from '../components/FormProjeto'
import Modal from '../components/Modal'

export default function Espaco() {
  const { sessao, sair } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [projetos, setProjetos] = useState([])
  const [demandas, setDemandas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mostrarNovo, setMostrarNovo] = useState(false)

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const carregar = useCallback(async () => {
    if (!cliente) return
    setCarregando(true)
    setErro('')

    const [{ data: p, error: eP }, { data: d, error: eD }] = await Promise.all([
      cliente.from('projetos').select('*'),
      cliente.from('demandas').select('id, projeto_id, fase, atualizado_em'),
    ])

    if (eP || eD) {
      setErro((eP || eD).message)
    } else {
      setProjetos(p || [])
      setDemandas(d || [])
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

  const projetosOrdenados = ordenarProjetosPorEntrega(projetos)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <Header espaco={sessao.espaco} onSair={sair} />

      <div className="layout-espaco">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="text-titulo">Projetos</h1>
          <button type="button" className="btn-primario" onClick={() => setMostrarNovo(true)}>
            <Plus size={16} style={{ marginRight: 4, verticalAlign: -3 }} />
            Novo projeto
          </button>
        </div>

        {erro && <p role="alert" className="campo-erro">{erro}</p>}

        {carregando ? (
          <p className="text-body" style={{ color: 'var(--text-dim)' }}>Carregando...</p>
        ) : projetosOrdenados.length === 0 ? (
          <p className="text-micro">Nenhum projeto ainda. Crie o primeiro pra começar.</p>
        ) : (
          <div className="lista-demandas">
            {projetosOrdenados.map((p) => {
              const demandasDoProjeto = demandas.filter((d) => d.projeto_id === p.id)
              const tracao = precisaDeTracao(p, demandasDoProjeto)
              const total = demandasDoProjeto.length
              const entregues = demandasDoProjeto.filter((d) => d.fase === 'entregue').length

              return (
                <div
                  key={p.id}
                  className="item-demanda"
                  onClick={() => navigate(`/espaco/projeto/${p.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/espaco/projeto/${p.id}`) } }}
                  aria-label={`Abrir projeto ${p.nome}`}
                >
                  <div className="item-demanda-titulo" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {p.quente && <Flame size={14} color="var(--atencao)" aria-label="Quente" />}
                    {p.nome}
                  </div>
                  <div className="item-demanda-meta">
                    <span>{total === 0 ? 'sem demandas' : `${entregues}/${total} concluídas`}</span>
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
      </div>

      {mostrarNovo && (
        <Modal titulo="Novo projeto" onFechar={() => setMostrarNovo(false)}>
          <FormProjeto onSalvar={criarProjeto} onCancelar={() => setMostrarNovo(false)} />
        </Modal>
      )}
    </div>
  )
}
