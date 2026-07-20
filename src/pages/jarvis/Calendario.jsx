import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { supabaseEspaco } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import Header from '../../components/Header'

const VAZIO = { titulo: '', data: '', hora: '' }

export default function Calendario() {
  const { sessao, sair } = useAuth()
  const toast = useToast()

  const [eventos, setEventos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [novo, setNovo] = useState(VAZIO)
  const [enviando, setEnviando] = useState(false)

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const carregar = useCallback(async () => {
    if (!cliente) return
    setCarregando(true)
    setErro('')

    const inicioHoje = new Date()
    inicioHoje.setHours(0, 0, 0, 0)

    const { data, error } = await cliente
      .from('eventos_cal')
      .select('*')
      .gte('inicio', inicioHoje.toISOString())
      .order('inicio', { ascending: true })

    if (error) setErro(error.message)
    else setEventos(data || [])
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  useEffect(() => { carregar() }, [carregar])

  if (!sessao) return <Navigate to="/" replace />

  async function criarEvento() {
    if (!novo.titulo.trim() || !novo.data) return
    setEnviando(true)
    try {
      const inicio = new Date(`${novo.data}T${novo.hora || '00:00'}:00`)
      const { error } = await cliente.from('eventos_cal').insert({
        espaco_id: sessao.espaco.id,
        titulo: novo.titulo.trim(),
        inicio: inicio.toISOString(),
        dia_todo: !novo.hora,
      })
      if (error) throw error
      setNovo(VAZIO)
      await carregar()
    } catch (err) {
      toast?.erro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  async function excluirEvento(id) {
    try {
      const { error } = await cliente.from('eventos_cal').delete().eq('id', id)
      if (error) throw error
      await carregar()
    } catch (err) {
      toast?.erro(err.message)
    }
  }

  // Agrupar por dia
  const porDia = {}
  eventos.forEach((e) => {
    const chave = new Date(e.inicio).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
    if (!porDia[chave]) porDia[chave] = []
    porDia[chave].push(e)
  })

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <Header espaco={sessao.espaco} onSair={sair} />

      <h1 className="text-titulo">Calendário</h1>
      <p className="text-micro">Próximos eventos, em ordem cronológica.</p>

      {erro && <p role="alert" className="campo-erro">{erro}</p>}

      {carregando ? (
        <p className="text-body" style={{ color: 'var(--text-dim)' }}>Carregando...</p>
      ) : Object.keys(porDia).length === 0 ? (
        <p className="text-micro">Nenhum evento agendado.</p>
      ) : (
        Object.entries(porDia).map(([dia, evs]) => (
          <section key={dia} className="detalhe-secao">
            <h2 className="section-label">{dia}</h2>
            <div className="lista">
              {evs.map((e) => (
                <div key={e.id} className="item-atividade" style={{ cursor: 'default', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {!e.dia_todo && (
                      <span className="text-micro" style={{ marginRight: 8 }}>
                        {new Date(e.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {e.titulo}
                  </span>
                  <button type="button" className="link-acao" onClick={() => excluirEvento(e.id)} aria-label={`Excluir ${e.titulo}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      <section className="detalhe-secao detalhe-acoes">
        <h2 className="section-label">Novo evento</h2>
        <label className="campo">
          <span className="text-label">Título</span>
          <input value={novo.titulo} onChange={(e) => setNovo((p) => ({ ...p, titulo: e.target.value }))} />
        </label>
        <div className="campo-grade-2">
          <label className="campo">
            <span className="text-label">Data</span>
            <input type="date" value={novo.data} onChange={(e) => setNovo((p) => ({ ...p, data: e.target.value }))} />
          </label>
          <label className="campo">
            <span className="text-label">Hora (opcional)</span>
            <input type="time" value={novo.hora} onChange={(e) => setNovo((p) => ({ ...p, hora: e.target.value }))} />
          </label>
        </div>
        <div className="modal-rodape" style={{ marginTop: 0, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-primario" onClick={criarEvento} disabled={!novo.titulo.trim() || !novo.data || enviando}>
            {enviando ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </section>
    </div>
  )
}
