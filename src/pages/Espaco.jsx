import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { supabaseEspaco } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import CardDemanda from '../components/CardDemanda'
import FormDemanda from '../components/FormDemanda'

const FASES = ['todas', 'discovery', 'refinamento', 'downstream', 'entregue']

export default function Espaco() {
  const { sessao, sair } = useAuth()
  const [demandas, setDemandas] = useState([])
  const [filtro, setFiltro] = useState('todas')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState(null) // demanda em edição, ou {} para nova, ou null
  const [mostrarForm, setMostrarForm] = useState(false)

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
    } else {
      setDemandas(data)
    }
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  useEffect(() => { carregar() }, [carregar])

  if (!sessao) return <Navigate to="/" replace />

  const demandasFiltradas = filtro === 'todas'
    ? demandas
    : demandas.filter((d) => d.fase === filtro)

  function abrirNova() {
    setEditando({})
    setMostrarForm(true)
  }

  function abrirEdicao(demanda) {
    setEditando(demanda)
    setMostrarForm(true)
  }

  function fecharForm() {
    setMostrarForm(false)
    setEditando(null)
  }

  async function salvar(dados) {
    if (editando && editando.id) {
      // edição
      const { error } = await cliente
        .from('demandas')
        .update({ ...dados, atualizado_em: new Date().toISOString() })
        .eq('id', editando.id)
      if (error) throw error

      await cliente.from('movimentos').insert({
        demanda_id: editando.id,
        tipo: 'edicao',
        detalhe: dados,
      })
    } else {
      // criação
      const { data, error } = await cliente
        .from('demandas')
        .insert({ ...dados, espaco_id: sessao.espaco.id })
        .select()
        .single()
      if (error) throw error

      await cliente.from('movimentos').insert({
        demanda_id: data.id,
        tipo: 'criacao',
        detalhe: dados,
      })
    }

    fecharForm()
    await carregar()
  }

  async function mudarFase(demanda, novaFase) {
    if (novaFase === demanda.fase) return

    const { error } = await cliente
      .from('demandas')
      .update({ fase: novaFase, atualizado_em: new Date().toISOString() })
      .eq('id', demanda.id)
    if (error) { setErro(error.message); return }

    await cliente.from('movimentos').insert({
      demanda_id: demanda.id,
      tipo: 'fase',
      detalhe: { de: demanda.fase, para: novaFase },
    })

    await carregar()
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-4)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span className="chip-codigo">{sessao.espaco.codigo}</span>
          <span style={{ color: 'var(--text-dim)', fontSize: 'var(--text-sm)' }}>{sessao.espaco.nome}</span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn-primary" onClick={abrirNova}>Nova demanda</button>
          <button className="btn-secondary" onClick={sair}>Sair</button>
        </div>
      </header>

      <nav style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        {FASES.map((f) => (
          <button
            key={f}
            className={filtro === f ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setFiltro(f)}
          >
            {f}
          </button>
        ))}
      </nav>

      {erro && <p style={{ color: 'var(--danger)', marginBottom: 'var(--space-3)' }}>{erro}</p>}

      {mostrarForm && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
          <FormDemanda inicial={editando?.id ? editando : null} onSalvar={salvar} onCancelar={fecharForm} />
        </div>
      )}

      {carregando ? (
        <p style={{ color: 'var(--text-dim)' }}>Carregando...</p>
      ) : demandasFiltradas.length === 0 ? (
        <p style={{ color: 'var(--text-dim)' }}>Nenhuma demanda nesta fase.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {demandasFiltradas.map((d) => (
            <CardDemanda key={d.id} demanda={d} onEditar={abrirEdicao} onMudarFase={mudarFase} />
          ))}
        </div>
      )}
    </div>
  )
}
