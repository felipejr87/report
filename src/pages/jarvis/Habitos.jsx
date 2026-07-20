import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { supabaseEspaco } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import Header from '../../components/Header'

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function diasDaSemanaAtual() {
  const hoje = new Date()
  const diaSemana = (hoje.getDay() + 6) % 7 // 0 = segunda
  const inicioSemana = new Date(hoje)
  inicioSemana.setDate(hoje.getDate() - diaSemana)
  inicioSemana.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicioSemana)
    d.setDate(inicioSemana.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

export default function Habitos() {
  const { sessao, sair } = useAuth()
  const toast = useToast()

  const [habitos, setHabitos] = useState([])
  const [checks, setChecks] = useState([]) // [{habito_id, data}]
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [novaFrequencia, setNovaFrequencia] = useState(3)

  const cliente = sessao ? supabaseEspaco(sessao.token) : null
  const semana = diasDaSemanaAtual()

  const carregar = useCallback(async () => {
    if (!cliente) return
    setCarregando(true)
    setErro('')

    const { data: hs, error: eH } = await cliente.from('habitos').select('*').eq('ativo', true).order('criado_em')
    if (eH) { setErro(eH.message); setCarregando(false); return }

    const { data: cks, error: eC } = await cliente
      .from('habito_checks')
      .select('*')
      .in('habito_id', (hs || []).map((h) => h.id))
      .gte('data', semana[0])
      .lte('data', semana[6])

    if (eC) { setErro(eC.message); setCarregando(false); return }

    setHabitos(hs || [])
    setChecks(cks || [])
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  useEffect(() => { carregar() }, [carregar])

  if (!sessao) return <Navigate to="/" replace />

  function marcado(habitoId, data) {
    return checks.some((c) => c.habito_id === habitoId && c.data === data)
  }

  async function alternarCheck(habitoId, data) {
    try {
      if (marcado(habitoId, data)) {
        const { error } = await cliente.from('habito_checks').delete().eq('habito_id', habitoId).eq('data', data)
        if (error) throw error
        setChecks((prev) => prev.filter((c) => !(c.habito_id === habitoId && c.data === data)))
      } else {
        const { error } = await cliente.from('habito_checks').insert({ habito_id: habitoId, data })
        if (error) throw error
        setChecks((prev) => [...prev, { habito_id: habitoId, data }])
      }
    } catch (err) {
      toast?.erro(err.message)
    }
  }

  async function criarHabito() {
    if (!novoNome.trim()) return
    try {
      const { error } = await cliente.from('habitos').insert({
        espaco_id: sessao.espaco.id,
        nome: novoNome.trim(),
        frequencia_semanal: Number(novaFrequencia) || 3,
      })
      if (error) throw error
      setNovoNome('')
      setNovaFrequencia(3)
      await carregar()
    } catch (err) {
      toast?.erro(err.message)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <Header espaco={sessao.espaco} onSair={sair} />

      <h1 className="text-titulo">Hábitos — semana atual</h1>

      {erro && <p role="alert" className="campo-erro">{erro}</p>}

      {carregando ? (
        <p className="text-body" style={{ color: 'var(--text-dim)' }}>Carregando...</p>
      ) : (
        <>
          <div className="semana-grade">
            <span />
            {DIAS.map((d) => <span key={d} className="semana-cabecalho">{d}</span>)}
          </div>

          {habitos.length === 0 ? (
            <p className="text-micro">Nenhum hábito ainda.</p>
          ) : (
            habitos.map((h) => {
              const totalSemana = semana.filter((data) => marcado(h.id, data)).length
              return (
                <div key={h.id} className="semana-grade">
                  <span className="text-body" style={{ fontSize: 14 }}>
                    {h.nome} <span className="text-micro">{totalSemana}/{h.frequencia_semanal}</span>
                  </span>
                  {semana.map((data) => (
                    <button
                      key={data}
                      type="button"
                      className="habito-check"
                      data-marcado={marcado(h.id, data)}
                      onClick={() => alternarCheck(h.id, data)}
                      aria-label={`${h.nome} em ${data}`}
                    >
                      {marcado(h.id, data) ? '✓' : ''}
                    </button>
                  ))}
                </div>
              )
            })
          )}

          <section className="detalhe-secao detalhe-acoes">
            <h2 className="section-label">Novo hábito</h2>
            <div className="campo-grade-2">
              <label className="campo">
                <span className="text-label">Nome</span>
                <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
              </label>
              <label className="campo">
                <span className="text-label">Vezes por semana</span>
                <input type="number" min="1" max="7" value={novaFrequencia} onChange={(e) => setNovaFrequencia(e.target.value)} />
              </label>
            </div>
            <div className="modal-rodape" style={{ marginTop: 0, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primario" onClick={criarHabito} disabled={!novoNome.trim()}>Adicionar</button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
