import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { supabaseEspaco } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import Header from '../components/Header'
import FiltroFase from '../components/FiltroFase'
import CardDemanda from '../components/CardDemanda'
import FormDemanda from '../components/FormDemanda'
import Modal from '../components/Modal'
import EstadoVazio from '../components/EstadoVazio'
import { ROTULO_FASE } from '../components/ChipFase'

export default function Espaco() {
  const { sessao, sair } = useAuth()
  const toast = useToast()
  const [demandas, setDemandas] = useState([])
  const [filtro, setFiltro] = useState('todas')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState(null) // demanda em edição, ou {} para nova, ou null
  const [mostrarForm, setMostrarForm] = useState(false)
  const [historico, setHistorico] = useState(null)

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

  async function abrirEdicao(demanda) {
    setEditando(demanda)
    setMostrarForm(true)
    setHistorico(null)

    const { data, error } = await cliente
      .from('movimentos')
      .select('id, tipo, detalhe, criado_em')
      .eq('demanda_id', demanda.id)
      .order('criado_em', { ascending: false })

    if (!error) setHistorico(data)
  }

  function fecharForm() {
    setMostrarForm(false)
    setEditando(null)
    setHistorico(null)
  }

  async function salvar(dados) {
    if (editando && editando.id) {
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
      toast?.sucesso('Demanda atualizada.')
    } else {
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
      toast?.sucesso('Demanda criada.')
    }

    fecharForm()
    await carregar()
  }

  async function excluir() {
    const { error } = await cliente.from('demandas').delete().eq('id', editando.id)
    if (error) throw error
    toast?.sucesso('Demanda excluída.')
    fecharForm()
    await carregar()
  }

  async function mudarFase(demanda, novaFase) {
    if (novaFase === demanda.fase) return

    const { error } = await cliente
      .from('demandas')
      .update({ fase: novaFase, atualizado_em: new Date().toISOString() })
      .eq('id', demanda.id)
    if (error) { toast?.erro(error.message); return }

    await cliente.from('movimentos').insert({
      demanda_id: demanda.id,
      tipo: 'fase',
      detalhe: { de: demanda.fase, para: novaFase },
    })

    toast?.sucesso(`Movido para ${ROTULO_FASE[novaFase]}.`)
    await carregar()
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <Header espaco={sessao.espaco} onNova={abrirNova} onSair={sair} />

      <div className="layout-espaco">
        <div className="sidebar-filtros">
          <FiltroFase demandas={demandas} filtro={filtro} onFiltroChange={setFiltro} />
        </div>

        <div className="conteudo-principal">
          {erro && <p role="alert" className="campo-erro" style={{ marginBottom: 'var(--space-md)' }}>{erro}</p>}

          {carregando ? (
            <p className="text-body" style={{ color: 'var(--text-dim)' }}>Carregando...</p>
          ) : demandasFiltradas.length === 0 ? (
            <EstadoVazio onCriar={abrirNova} />
          ) : (
            <div className="lista-demandas">
              {demandasFiltradas.map((d) => (
                <CardDemanda key={d.id} demanda={d} onEditar={abrirEdicao} onMudarFase={mudarFase} />
              ))}
            </div>
          )}
        </div>
      </div>

      {mostrarForm && (
        <Modal titulo={editando?.id ? 'Editar demanda' : 'Nova demanda'} onFechar={fecharForm}>
          <FormDemanda
            inicial={editando?.id ? editando : null}
            historico={historico}
            onSalvar={salvar}
            onExcluir={editando?.id ? excluir : undefined}
            onCancelar={fecharForm}
          />
        </Modal>
      )}
    </div>
  )
}
