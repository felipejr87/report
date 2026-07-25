import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { supabaseEspaco } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useIdioma } from '../hooks/useIdioma'
import { useTexto } from '../lib/i18n'
import HudPanel from '../components/hud/HudPanel'
import HudAbaControles from '../components/hud/HudAbaControles'
import HudTabBar from '../components/hud/HudTabBar'

const DIAS = { pt: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }
const VAZIO_EVENTO = { titulo: '', data: '', hora: '' }

function diasDaSemanaAtual() {
  const hoje = new Date()
  const diaSemana = (hoje.getDay() + 6) % 7
  const inicioSemana = new Date(hoje)
  inicioSemana.setDate(hoje.getDate() - diaSemana)
  inicioSemana.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicioSemana)
    d.setDate(inicioSemana.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

export default function Vida() {
  const { sessao, sair } = useAuth()
  const toast = useToast()
  const { idioma } = useIdioma()
  const t = useTexto()
  const localeData = idioma === 'en' ? 'en-US' : 'pt-BR'

  const [pilares, setPilares] = useState([])
  const [objetivos, setObjetivos] = useState([])
  const [projetos, setProjetos] = useState([])
  const [habitos, setHabitos] = useState([])
  const [checks, setChecks] = useState([])
  const [eventos, setEventos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [novoEvento, setNovoEvento] = useState(VAZIO_EVENTO)
  const [enviandoEvento, setEnviandoEvento] = useState(false)

  const cliente = sessao ? supabaseEspaco(sessao.token) : null
  const semana = diasDaSemanaAtual()

  const carregar = useCallback(async () => {
    if (!cliente) return
    setCarregando(true)
    setErro('')

    const inicioHoje = new Date()
    inicioHoje.setHours(0, 0, 0, 0)

    const [
      { data: pl, error: eP },
      { data: ob, error: eO },
      { data: pr, error: ePr },
      { data: hs, error: eH },
      { data: ev, error: eEv },
    ] = await Promise.all([
      cliente.from('pilares').select('*').order('id'),
      cliente.from('objetivos').select('*').order('criado_em'),
      cliente.from('projetos').select('id, nome, fase, pilar_id, data_lancamento'),
      cliente.from('habitos').select('*').eq('ativo', true).order('criado_em'),
      cliente.from('eventos_cal').select('*').gte('inicio', inicioHoje.toISOString()).order('inicio', { ascending: true }),
    ])

    const primeiroErro = eP || eO || ePr || eH || eEv
    if (primeiroErro) { setErro(primeiroErro.message); setCarregando(false); return }

    setPilares(pl || [])
    setObjetivos(ob || [])
    setProjetos(pr || [])
    setHabitos(hs || [])
    setEventos(ev || [])

    const { data: cks } = await cliente
      .from('habito_checks')
      .select('*')
      .in('habito_id', (hs || []).map((h) => h.id))
      .gte('data', semana[0])
      .lte('data', semana[6])
    setChecks(cks || [])

    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  useEffect(() => { carregar() }, [carregar])

  if (!sessao) return <Navigate to="/" replace />

  const clientesPagantes = projetos.filter((p) => p.fase === 'operacao').length

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

  async function criarEvento() {
    if (!novoEvento.titulo.trim() || !novoEvento.data) return
    setEnviandoEvento(true)
    try {
      const inicio = new Date(`${novoEvento.data}T${novoEvento.hora || '00:00'}:00`)
      const { error } = await cliente.from('eventos_cal').insert({
        espaco_id: sessao.espaco.id,
        titulo: novoEvento.titulo.trim(),
        inicio: inicio.toISOString(),
        dia_todo: !novoEvento.hora,
      })
      if (error) throw error
      setNovoEvento(VAZIO_EVENTO)
      await carregar()
    } catch (err) {
      toast?.erro(err.message)
    } finally {
      setEnviandoEvento(false)
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

  return (
    <div className="hud-aba-page">
      <div className="hud-grid-bg" />
      <div className="hud-scanlines" />
      <div className="hud-scanline-beam" />

      <div className="hud-aba-header">
        <span className="hud-aba-title">◤ {t('sua_vida').toUpperCase()}</span>
        <HudAbaControles onSair={sair} />
      </div>

      {erro && <p role="alert" className="campo-erro">{erro}</p>}

      {carregando ? (
        <p className="hud-dim">{t('carregando')}</p>
      ) : (
        <div className="hud-aba-grid">
          <HudPanel label="HÁBITOS · SEMANA" className="hud-aba-panel">
            {habitos.length === 0 ? (
              <span className="hud-dim">{t('nenhum_habito')}</span>
            ) : (
              <>
                <div className="hud-semana-cabecalho">
                  <span />
                  {DIAS[idioma].map((d) => <span key={d}>{d}</span>)}
                </div>
                {habitos.map((h) => (
                  <div key={h.id} className="hud-habito-linha">
                    <span className="hud-habito-nome">
                      {h.nome}
                      <span className="hud-habito-freq">{semana.filter((data) => marcado(h.id, data)).length}/{h.frequencia_semanal}</span>
                    </span>
                    {semana.map((data) => (
                      <button
                        key={data}
                        type="button"
                        className="hud-habito-check"
                        data-marcado={marcado(h.id, data)}
                        onClick={() => alternarCheck(h.id, data)}
                        aria-label={`${h.nome} em ${data}`}
                      >
                        {marcado(h.id, data) ? '✓' : ''}
                      </button>
                    ))}
                  </div>
                ))}
              </>
            )}
          </HudPanel>

          <HudPanel label="AGENDA" className="hud-aba-panel">
            <div className="hud-agenda-lista">
              {eventos.length === 0 ? (
                <span className="hud-dim">{t('nenhum_evento')}</span>
              ) : (
                eventos.map((e) => (
                  <div key={e.id} className="hud-agenda-item">
                    <span className="hud-agenda-item-info">
                      <span className="hud-agenda-data">
                        {new Date(e.inicio).toLocaleDateString(localeData, { day: '2-digit', month: '2-digit' })}
                        {!e.dia_todo && ` ${new Date(e.inicio).toLocaleTimeString(localeData, { hour: '2-digit', minute: '2-digit' })}`}
                      </span>
                      <span>{e.titulo}</span>
                    </span>
                    <button type="button" className="hud-agenda-del" onClick={() => excluirEvento(e.id)} aria-label={`${t('excluir')} ${e.titulo}`}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="hud-agenda-form">
              <input className="hud-input" value={novoEvento.titulo} onChange={(e) => setNovoEvento((p) => ({ ...p, titulo: e.target.value }))} placeholder={t('titulo_campo')} />
              <input className="hud-input" type="date" value={novoEvento.data} onChange={(e) => setNovoEvento((p) => ({ ...p, data: e.target.value }))} />
              <button type="button" className="hud-btn-nova" onClick={criarEvento} disabled={!novoEvento.titulo.trim() || !novoEvento.data || enviandoEvento}>
                {enviandoEvento ? t('adicionando').toUpperCase() : `+ ${t('adicionar_evento').toUpperCase()}`}
              </button>
            </div>
          </HudPanel>

          <HudPanel label="PILARES & OBJETIVOS" className="hud-aba-panel hud-aba-panel--full">
            <div className="hud-vida-kpi">
              <span className="hud-vida-kpi-label">{t('clientes_pagantes').toUpperCase()}</span>
              <span className="hud-vida-kpi-valor" data-zero={clientesPagantes === 0}>{clientesPagantes}</span>
              <span className="hud-habito-freq">{t('ecossistemas_pilar')}</span>
            </div>

            {pilares.map((pilar) => {
              const obsDoPilar = objetivos.filter((o) => o.pilar_id === pilar.id)
              const projDoPilar = projetos.filter((p) => p.pilar_id === pilar.id)
              const semCompromisso = pilar.id === 3 && !projDoPilar.some((p) => p.data_lancamento)

              return (
                <div key={pilar.id} className="hud-pilar-bloco">
                  <div className="hud-pilar-cabecalho">
                    <span aria-hidden="true">{pilar.icone}</span>
                    <span>{pilar.nome}</span>
                    {semCompromisso && <span className="hud-badge-atencao">{t('sem_compromisso')}</span>}
                  </div>
                  {obsDoPilar.length === 0 ? (
                    <span className="hud-dim">{t('nenhum_objetivo')}</span>
                  ) : (
                    obsDoPilar.map((ob) => (
                      <div key={ob.id} className="hud-objetivo-linha" data-status={ob.status}>
                        <span>{ob.descricao}</span>
                        {ob.prazo && <span className="hud-objetivo-prazo">→ {new Date(ob.prazo).toLocaleDateString(localeData, { month: 'short', year: '2-digit' })}</span>}
                      </div>
                    ))
                  )}
                </div>
              )
            })}
          </HudPanel>
        </div>
      )}

      <HudTabBar />
    </div>
  )
}
