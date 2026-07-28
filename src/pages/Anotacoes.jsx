import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { Trash2, List } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useIdioma } from '../hooks/useIdioma'
import { useTexto } from '../lib/i18n'
import { supabaseEspaco, urlFuncao } from '../lib/supabase'
import HudAbaControles from '../components/hud/HudAbaControles'
import HudTabBar from '../components/hud/HudTabBar'

export default function Anotacoes() {
  const { sessao, sair } = useAuth()
  const toast = useToast()
  const { idioma } = useIdioma()
  const t = useTexto()
  const localeData = idioma === 'en' ? 'en-US' : 'pt-BR'

  // Memoizado — recriar o cliente a cada render mudaria a identidade de
  // `carregar` e disparava o efeito de montagem em loop (mesma causa raiz
  // já documentada em JarvisHome.jsx).
  const cliente = useMemo(() => (sessao ? supabaseEspaco(sessao.token) : null), [sessao?.token])

  const [anotacoes, setAnotacoes] = useState([])
  const [ativaId, setAtivaId] = useState(null)
  const [titulo, setTitulo] = useState('')
  const [conteudo, setConteudo] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvoEm, setSalvoEm] = useState(false)
  const [processando, setProcessando] = useState(null) // 'ata' | 'todos' | 'resumo' | null
  const [resultado, setResultado] = useState(null)
  const [mostrarEditorMobile, setMostrarEditorMobile] = useState(false)
  const autoSaveRef = useRef(null)
  const primeiraCargaRef = useRef(true)

  const carregar = useCallback(async () => {
    if (!cliente) return
    const { data } = await cliente
      .from('anotacoes')
      .select('id, titulo, conteudo, tipo, criado_em, atualizado_em')
      .order('atualizado_em', { ascending: false })
    setAnotacoes(data || [])
    if (primeiraCargaRef.current) {
      primeiraCargaRef.current = false
      if (data?.length) {
        setAtivaId(data[0].id)
        setTitulo(data[0].titulo || '')
        setConteudo(data[0].conteudo || '')
      }
    }
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  useEffect(() => { carregar() }, [carregar])

  const salvar = useCallback(async (mostrarFeedback) => {
    if (!ativaId || !cliente) return
    const tituloFinal = titulo || conteudo.split('\n')[0]?.slice(0, 60) || t('nota_sem_titulo')
    const agora = new Date().toISOString()
    const { error } = await cliente.from('anotacoes').update({ titulo: tituloFinal, conteudo, atualizado_em: agora }).eq('id', ativaId)
    if (error) { toast?.erro(error.message); return }
    setAnotacoes((prev) =>
      prev.map((a) => (a.id === ativaId ? { ...a, titulo: tituloFinal, conteudo, atualizado_em: agora } : a))
        .sort((a, b) => new Date(b.atualizado_em) - new Date(a.atualizado_em))
    )
    if (mostrarFeedback) {
      setSalvoEm(true)
      setTimeout(() => setSalvoEm(false), 2000)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativaId, titulo, conteudo, cliente])

  // Auto-save 2s após parar de digitar.
  useEffect(() => {
    if (!ativaId) return
    clearTimeout(autoSaveRef.current)
    autoSaveRef.current = setTimeout(() => salvar(true), 2000)
    return () => clearTimeout(autoSaveRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conteudo, titulo])

  if (!sessao) return <Navigate to="/" replace />

  const ativa = anotacoes.find((a) => a.id === ativaId) || null

  function selecionar(nota) {
    setAtivaId(nota.id)
    setTitulo(nota.titulo || '')
    setConteudo(nota.conteudo || '')
    setResultado(null)
    setMostrarEditorMobile(true)
  }

  async function novaNota() {
    if (!cliente) return
    const { data, error } = await cliente.from('anotacoes')
      .insert({ espaco_id: sessao.espaco.id, titulo: '', conteudo: '', tipo: 'livre' })
      .select().single()
    if (error) { toast?.erro(error.message); return }
    setAnotacoes((prev) => [data, ...prev])
    setAtivaId(data.id)
    setTitulo('')
    setConteudo('')
    setResultado(null)
    setMostrarEditorMobile(true)
  }

  async function deletar(id) {
    if (!cliente) return
    const { error } = await cliente.from('anotacoes').delete().eq('id', id)
    if (error) { toast?.erro(error.message); return }
    setAnotacoes((prev) => prev.filter((a) => a.id !== id))
    if (ativaId === id) {
      setAtivaId(null); setTitulo(''); setConteudo(''); setResultado(null)
      setMostrarEditorMobile(false)
    }
  }

  async function processar(modo) {
    if (!conteudo.trim() || !cliente || processando) return
    setProcessando(modo)
    setResultado(null)
    try {
      const res = await fetch(urlFuncao('anotacoes-processar'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.token}` },
        body: JSON.stringify({ conteudo, modo, idioma }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast?.erro(data.erro || t('erro_processar'))
        setProcessando(null)
        return
      }
      setResultado({ modo, texto: data.texto })

      const rotulo = t(`nota_rotulo_${modo}`)
      const { data: nova, error } = await cliente.from('anotacoes')
        .insert({ espaco_id: sessao.espaco.id, titulo: `${rotulo} — ${titulo || t('nota_sem_titulo')}`, conteudo: data.texto, tipo: modo })
        .select().single()
      if (!error && nova) setAnotacoes((prev) => [nova, ...prev])
    } catch {
      toast?.erro(t('erro_conexao'))
    }
    setProcessando(null)
  }

  async function copiarResultado() {
    if (!resultado) return
    try {
      await navigator.clipboard.writeText(resultado.texto)
      toast?.sucesso(t('nota_copiado'))
    } catch {
      toast?.erro(t('erro_processar'))
    }
  }

  return (
    <div className="hud-aba-page anotacoes-page">
      <div className="hud-grid-bg" />
      <div className="hud-scanlines" />
      <div className="hud-scanline-beam" />

      <div className="hud-aba-header">
        <span className="hud-aba-title">◤ {t('tab_notas').toUpperCase()}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button type="button" className="hud-btn-nova" onClick={novaNota}>+ {t('nota_nova').toUpperCase()}</button>
          <HudAbaControles onSair={sair} />
        </div>
      </div>

      {carregando ? (
        <p className="hud-dim">{t('carregando')}</p>
      ) : (
        <div className="anot-layout" data-mostrar-editor={mostrarEditorMobile}>
          <div className="anot-lista">
            {anotacoes.length === 0 && <div className="anot-vazio">{t('nota_vazia')}</div>}
            {anotacoes.map((a) => (
              <div key={a.id} className={`anot-item ${ativaId === a.id ? 'anot-item--ativo' : ''}`} onClick={() => selecionar(a)}>
                <div className="anot-item-titulo">
                  {a.tipo !== 'livre' && <span className="anot-tipo-badge">{a.tipo === 'ata' ? 'ATA' : a.tipo === 'todos' ? 'TODO' : 'RES'}</span>}
                  {a.titulo || a.conteudo?.split('\n')[0]?.slice(0, 35) || t('nota_sem_titulo')}
                </div>
                <div className="anot-item-data">
                  {new Date(a.atualizado_em).toLocaleDateString(localeData, { day: '2-digit', month: 'short' })}
                </div>
              </div>
            ))}
          </div>

          <div className="anot-editor-area">
            {ativa ? (
              <>
                <div className="anot-editor-topo">
                  <button type="button" className="anot-btn-voltar" onClick={() => setMostrarEditorMobile(false)} aria-label={t('nota_voltar')}>
                    <List size={15} />
                  </button>
                  <input
                    className="anot-titulo-input"
                    placeholder={t('nota_titulo_placeholder')}
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                  />
                </div>

                <textarea
                  className="anot-textarea"
                  placeholder={t('nota_conteudo_placeholder')}
                  value={conteudo}
                  onChange={(e) => setConteudo(e.target.value)}
                />

                {salvoEm && <div className="anot-salvo">{t('nota_salvo')}</div>}

                <div className="anot-acoes">
                  <button type="button" className="anot-btn-jarvis" onClick={() => processar('ata')} disabled={!conteudo.trim() || !!processando}>
                    {processando === 'ata' ? '...' : t('nota_gerar_ata')}
                  </button>
                  <button type="button" className="anot-btn-jarvis" onClick={() => processar('todos')} disabled={!conteudo.trim() || !!processando}>
                    {processando === 'todos' ? '...' : t('nota_extrair_todos')}
                  </button>
                  <button type="button" className="anot-btn-jarvis anot-btn-sec" onClick={() => processar('resumo')} disabled={!conteudo.trim() || !!processando}>
                    {processando === 'resumo' ? '...' : t('nota_resumir')}
                  </button>
                  <button type="button" className="anot-btn-delete" onClick={() => deletar(ativa.id)} title={t('excluir')} aria-label={t('excluir')}>
                    <Trash2 size={14} />
                  </button>
                </div>

                {resultado && (
                  <div className="anot-resultado">
                    <div className="anot-resultado-header">
                      <span className="anot-resultado-label">{t(`nota_rotulo_${resultado.modo}`)}</span>
                      <button type="button" className="anot-copiar" onClick={copiarResultado}>{t('nota_copiar')}</button>
                    </div>
                    <div className="anot-resultado-texto">{resultado.texto}</div>
                  </div>
                )}
              </>
            ) : (
              <div className="anot-placeholder"><div>{t('nota_selecione')}</div></div>
            )}
          </div>
        </div>
      )}

      <HudTabBar />
    </div>
  )
}
