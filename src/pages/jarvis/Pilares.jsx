import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { supabaseEspaco } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Header from '../../components/Header'

export default function Pilares() {
  const { sessao, sair } = useAuth()
  const [pilares, setPilares] = useState([])
  const [objetivos, setObjetivos] = useState([])
  const [projetos, setProjetos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const carregar = useCallback(async () => {
    if (!cliente) return
    setCarregando(true)
    setErro('')

    const [{ data: pl, error: eP }, { data: ob, error: eO }, { data: pr, error: ePr }] = await Promise.all([
      cliente.from('pilares').select('*').order('id'),
      cliente.from('objetivos').select('*').order('criado_em'),
      cliente.from('projetos').select('id, nome, fase, pilar_id, data_lancamento'),
    ])

    if (eP || eO || ePr) {
      setErro((eP || eO || ePr).message)
    } else {
      setPilares(pl || [])
      setObjetivos(ob || [])
      setProjetos(pr || [])
    }
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  useEffect(() => { carregar() }, [carregar])

  if (!sessao) return <Navigate to="/" replace />

  // KPI desconfortável de propósito: conta projetos do pilar Ecossistemas em operação.
  const clientesPagantes = projetos.filter((p) => p.fase === 'operacao').length

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <Header espaco={sessao.espaco} onSair={sair} />

      <h1 className="text-titulo">Pilares & Objetivos</h1>

      {erro && <p role="alert" className="campo-erro">{erro}</p>}

      {carregando ? (
        <p className="text-body" style={{ color: 'var(--text-dim)' }}>Carregando...</p>
      ) : (
        <>
          <div className="jarvis-kpi">
            <span className="text-label">Clientes reais pagantes</span>
            <span className="jarvis-kpi-valor" data-zero={clientesPagantes === 0}>{clientesPagantes}</span>
            <span className="text-micro">Ecossistemas · Pilar 3</span>
          </div>

          {pilares.map((pilar) => {
            const obsDoPilar = objetivos.filter((o) => o.pilar_id === pilar.id)
            const projDoPilar = projetos.filter((p) => p.pilar_id === pilar.id)
            const semCompromisso = pilar.id === 3 && !projDoPilar.some((p) => p.data_lancamento)

            return (
              <section key={pilar.id} className="detalhe-secao">
                <div className="pilar-cabecalho">
                  <span aria-hidden="true">{pilar.icone}</span>
                  <span>{pilar.nome}</span>
                  {semCompromisso && <span className="badge-sem-compromisso">SEM COMPROMISSO</span>}
                </div>

                {obsDoPilar.length === 0 ? (
                  <p className="text-micro">Nenhum objetivo declarado.</p>
                ) : (
                  <div>
                    {obsDoPilar.map((ob) => (
                      <div key={ob.id} className="objetivo-linha" data-status={ob.status}>
                        <span>{ob.descricao}</span>
                        {ob.prazo && (
                          <span className="text-micro">
                            → {new Date(ob.prazo).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
