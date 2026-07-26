import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Navigate, useSearchParams, useNavigate } from 'react-router-dom'
import { Mic, Square, ArrowUp, History, Plus, X, Check, Zap, Volume2, Volume1, VolumeX, Bell, BellOff, Loader2, Wallet, Dumbbell, Flag, ArrowRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useIdioma } from '../hooks/useIdioma'
import { useTexto } from '../lib/i18n'
import { supabaseEspaco, urlFuncao } from '../lib/supabase'
import { horaAtualBRT, formatarHoraBRT } from '../lib/tempo'
import { useVoz } from '../hooks/useVoz'
import { useJarvisVoz } from '../hooks/useJarvisVoz'
import BootSequence from '../components/hud/BootSequence'
import TopBar from '../components/hud/TopBar'
import Orbe from '../components/hud/Orbe'
import HudPanel from '../components/hud/HudPanel'
import PainelFinanceiro from '../components/hud/PainelFinanceiro'
import PainelProjetos from '../components/hud/PainelProjetos'
import VidaHabitos from '../components/hud/VidaHabitos'
import HudTabBar from '../components/hud/HudTabBar'

const CHAVE_VOZ_AUTO = 'jarvis_voz_auto'

// Chave pública VAPID — não é segredo, o navegador precisa dela pra
// criar a subscription (o par privado fica só na Edge Function).
const VAPID_PUBLIC_KEY = 'BNfcd5d_8ocSDgKUpZIy0AdaLWeSSGb_DMZgU97qOSjlrIOJ_MYAR0M0Smjjj-hwfvA5zLmn9-M8IO-1KAqmlhc'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

const pushSuportado = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

function renderMsg(texto) {
  return texto
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}

const SAUDACAO_PALAVRA = {
  pt: { manha: 'Bom dia', tarde: 'Boa tarde', noite: 'Boa noite' },
  en: { manha: 'Good morning', tarde: 'Good afternoon', noite: 'Good evening' },
}

// dados.saudacao vem do jarvis-briefing sempre em pt (é só uma chave de
// classificação de período, não texto exibido — a palavra mostrada usa
// SAUDACAO_PALAVRA[idioma] separadamente).
function periodoDe(saudacao) {
  if (saudacao === 'Bom dia') return 'manha'
  if (saudacao === 'Boa tarde') return 'tarde'
  return 'noite'
}

// Fragmentos de texto da saudação, por idioma — usados só dentro de
// montarSaudacao, então ficam colados nela em vez de ir pro i18n.js
// (que é só pras strings estáticas de botão/label).
const TEXTO_SAUDACAO = {
  pt: { oQuePrecisa: 'O que precisa?', encerramento: 'Como fecha o dia?' },
  en: { oQuePrecisa: 'What do you need?', encerramento: 'How did the day close?' },
}

// Textos dos cards de sugestão proativa — assim como TEXTO_SAUDACAO,
// ficam colados aqui por serem usados só dentro de carregarSugestoes.
const TEXTO_SUGESTAO = {
  pt: {
    semLancamentos: 'Nenhum lançamento essa semana — vale registrar os gastos.',
    habitosPendentes: (n) => `${n} hábito${n > 1 ? 's' : ''} sem marcar essa semana.`,
    atividadeParada: (nome) => `"${nome}" está parada — sem atualização há dias.`,
  },
  en: {
    semLancamentos: 'No entries logged this week — worth tracking your spending.',
    habitosPendentes: (n) => `${n} habit${n > 1 ? 's' : ''} unchecked this week.`,
    atividadeParada: (nome) => `"${nome}" is stalled — no update in days.`,
  },
}

// Saudação inicial — curta de propósito. O digest completo (clima,
// agenda, hábitos pendentes, prioridades) já vive nos painéis
// dedicados (coluna esquerda no desktop, .hud-briefing-mobile no
// celular) — repetir tudo de novo na bolha de chat só empurrava o
// input pra fora da tela no mobile (a mensagem sozinha chegava a
// ocupar quase metade da tela em telefones menores).
function montarSaudacao(dados, idioma) {
  const lang = idioma === 'en' ? 'en' : 'pt'
  const s = TEXTO_SAUDACAO[lang]
  const periodo = dados ? periodoDe(dados.saudacao) : (() => {
    const h = horaAtualBRT()
    return h < 12 ? 'manha' : h < 18 ? 'tarde' : 'noite'
  })()
  const hora = dados?.hora || formatarHoraBRT(new Date().toISOString())
  const fechamento = periodo === 'noite' ? s.encerramento : s.oQuePrecisa

  return `${SAUDACAO_PALAVRA[lang][periodo]}, Felipe. ${hora}. ${fechamento}`
}

export default function JarvisHome() {
  const { sessao, sair } = useAuth()
  const toast = useToast()
  const { idioma } = useIdioma()
  const t = useTexto()
  const [conversas, setConversas] = useState([])
  const [conversaId, setConversaId] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [input, setInput] = useState('')
  const [textoInterim, setTextoInterim] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const [vozAutomatica, setVozAutomatica] = useState(() => localStorage.getItem(CHAVE_VOZ_AUTO) === 'true')
  const [acaoPendente, setAcaoPendente] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [briefing, setBriefing] = useState(null)
  const [sugestoes, setSugestoes] = useState([])
  const [notifAtivo, setNotifAtivo] = useState(false)
  const [notifCarregando, setNotifCarregando] = useState(false)
  const [bootDone, setBootDone] = useState(() => !!sessionStorage.getItem('jarvis_boot_done'))
  const rodapeRef = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const msgInicialEnviada = useRef(false)
  const navegar = useNavigate()

  const { falar, pararFala, falando, carregandoAudio, suportado: falaSuportada, desbloquear } = useJarvisVoz(sessao.token, idioma)

  // Efeito typewriter nas respostas do Jarvis — só na última mensagem
  // do assistente, enquanto twAtivo estiver true.
  const [twTexto, setTwTexto] = useState('')
  const [twAtivo, setTwAtivo] = useState(false)
  const twTimerRef = useRef(null)

  function iniciarTypewriter(texto) {
    clearInterval(twTimerRef.current)
    setTwAtivo(true)
    setTwTexto('')
    let i = 0
    twTimerRef.current = setInterval(() => {
      i += 3
      if (i >= texto.length) {
        setTwTexto(texto)
        setTwAtivo(false)
        clearInterval(twTimerRef.current)
      } else {
        setTwTexto(texto.slice(0, i))
      }
    }, 24)
  }
  useEffect(() => () => clearInterval(twTimerRef.current), [])

  function toggleVozAutomatica() {
    const novo = !vozAutomatica
    setVozAutomatica(novo)
    localStorage.setItem(CHAVE_VOZ_AUTO, String(novo))
    if (novo) desbloquear()
    else pararFala()
  }

  // Memoizado: supabaseEspaco(token) recriava um cliente novo a cada
  // render, o que mudava a identidade de carregarSugestoes (deps
  // [cliente, idioma]) a cada render → novaConversa mudava de
  // identidade também → o efeito de montagem (que depende de
  // novaConversa) reexecutava sem parar, resetando `mensagens` pra
  // uma saudação nova a cada render (o "piscar") e apagando qualquer
  // mensagem que o usuário tivesse acabado de enviar no meio disso.
  const cliente = useMemo(() => (sessao ? supabaseEspaco(sessao.token) : null), [sessao?.token])

  useEffect(() => {
    if (!pushSuportado) return
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setNotifAtivo(!!sub))
      .catch(() => {})
  }, [])

  async function alternarNotificacoes() {
    if (!pushSuportado || !cliente) { toast?.erro(t('notif_nao_suportada')); return }
    setNotifCarregando(true)
    try {
      const reg = await navigator.serviceWorker.ready
      if (notifAtivo) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await cliente.from('jarvis_push_subscriptions').delete().eq('endpoint', sub.endpoint)
          await sub.unsubscribe()
        }
        setNotifAtivo(false)
      } else {
        const permissao = await Notification.requestPermission()
        if (permissao !== 'granted') { toast?.erro(t('permissao_negada')); return }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
        const subJson = sub.toJSON()
        const { error } = await cliente.from('jarvis_push_subscriptions').upsert({
          espaco_id: sessao.espaco.id,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
          user_agent: navigator.userAgent,
        }, { onConflict: 'endpoint' })
        if (error) throw error
        setNotifAtivo(true)
      }
    } catch (e) {
      toast?.erro(e.message || t('erro_notif'))
    } finally {
      setNotifCarregando(false)
    }
  }

  const carregarBriefing = useCallback(async () => {
    if (!sessao) return null
    try {
      const res = await fetch(`${urlFuncao('jarvis-briefing')}?idioma=${idioma}`, { headers: { Authorization: `Bearer ${sessao.token}` } })
      const data = await res.json()
      if (data.ok) { setBriefing(data); return data }
      return null
    } catch (e) {
      console.warn('[jarvis-briefing]', e)
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token, idioma])

  // Sugestões proativas — derivadas do mesmo briefing (paradas,
  // hábitos pendentes) mais uma checagem própria de lançamentos da
  // semana, já que jarvis-briefing não cobre financeiro. Máximo 2
  // visíveis por vez pra não virar ruído.
  const carregarSugestoes = useCallback(async (dadosBriefing) => {
    if (!cliente || !dadosBriefing) { setSugestoes([]); return }
    const lang = idioma === 'en' ? 'en' : 'pt'
    const s = TEXTO_SUGESTAO[lang]
    const lista = []

    const inicioSemana = new Date()
    inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay())
    const { count } = await cliente
      .from('lancamentos')
      .select('id', { count: 'exact', head: true })
      .gte('data', inicioSemana.toISOString().split('T')[0])
    if (!count) lista.push({ id: 'financeiro', Icon: Wallet, mensagem: s.semLancamentos, rota: '/financeiro' })

    if (dadosBriefing.habitosPendentes?.length > 0) {
      lista.push({ id: 'habitos', Icon: Dumbbell, mensagem: s.habitosPendentes(dadosBriefing.habitosPendentes.length), rota: '/vida' })
    }

    if (dadosBriefing.paradas?.length > 0) {
      lista.push({ id: 'paradas', Icon: Flag, mensagem: s.atividadeParada(dadosBriefing.paradas[0].nome), rota: '/projetos' })
    }

    setSugestoes(lista.slice(0, 2))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, idioma])

  const carregarConversas = useCallback(async () => {
    if (!cliente) return
    const { data } = await cliente.from('conversas').select('id, titulo, atualizado_em').order('atualizado_em', { ascending: false }).limit(20)
    setConversas(data || [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  const novaConversa = useCallback(async () => {
    if (!cliente) return
    setConversaId(null)
    setMostrarHistorico(false)
    setAcaoPendente(null)

    const dados = await carregarBriefing()
    const saudacao = montarSaudacao(dados, idioma)
    setMensagens([{ role: 'assistant', content: saudacao }])
    iniciarTypewriter(saudacao)
    carregarSugestoes(dados)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token, carregarBriefing, carregarSugestoes, idioma])

  useEffect(() => { carregarConversas(); novaConversa() }, [carregarConversas, novaConversa])
  useEffect(() => { rodapeRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens, acaoPendente, twTexto])

  // Suporta /jarvis?msg=... (usado pelas sugestões da aba Vida)
  useEffect(() => {
    const msg = searchParams.get('msg')
    if (msg && mensagens.length > 0 && !msgInicialEnviada.current) {
      msgInicialEnviada.current = true
      setSearchParams({}, { replace: true })
      enviar(msg)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensagens, searchParams])

  if (!sessao) return <Navigate to="/" replace />

  async function carregarConversa(id) {
    setConversaId(id)
    setMostrarHistorico(false)
    setAcaoPendente(null)
    const { data } = await cliente.from('conversa_mensagens').select('role, content, criado_em').eq('conversa_id', id).order('criado_em')
    setMensagens((data || []).map((m) => ({ role: m.role, content: m.content })))
    setTwAtivo(false)
  }

  async function persistirConversa(historico, primeiroTextoUsuario, qtdNovas = 2) {
    let convId = conversaId

    if (!convId) {
      const titulo = primeiroTextoUsuario.slice(0, 60) + (primeiroTextoUsuario.length > 60 ? '...' : '')
      const { data: nova, error } = await cliente
        .from('conversas')
        .insert({ espaco_id: sessao.espaco.id, titulo, atualizado_em: new Date().toISOString() })
        .select()
        .single()
      if (error) { toast?.erro(error.message); return }
      convId = nova.id
      setConversaId(convId)
      await carregarConversas()
    } else {
      await cliente.from('conversas').update({ atualizado_em: new Date().toISOString() }).eq('id', convId)
    }

    // now() é avaliado uma vez por statement no Postgres — inserir
    // várias linhas num único insert() dava o mesmo criado_em pra
    // usuário e assistente, deixando a ordem entre os dois instável
    // ao recarregar o histórico. Escalona 1ms por mensagem pra
    // garantir ordem estável (usuário sempre antes do assistente).
    const agora = Date.now()
    const novas = historico.slice(-qtdNovas)
    await cliente.from('conversa_mensagens').insert(
      novas.map((m, i) => ({ conversa_id: convId, role: m.role, content: m.content, criado_em: new Date(agora + i).toISOString() }))
    )
  }

  async function enviar(textoOverride) {
    const texto = (textoOverride ?? input).trim()
    if (!texto || carregando) return

    if (vozAutomatica) desbloquear()

    const historicoAtual = [...mensagens, { role: 'user', content: texto }]
    setMensagens(historicoAtual)
    setInput('')
    setCarregando(true)
    setAcaoPendente(null)

    try {
      const res = await fetch(urlFuncao('assistente-jarvis'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.token}` },
        body: JSON.stringify({ mensagens: historicoAtual.map((m) => ({ role: m.role, content: m.content })), idioma }),
      })
      const data = await res.json()
      const respostaAssistente = res.ok && data.ok ? data.resposta : (data.erro || t('erro_processar'))
      if (!(res.ok && data.ok)) toast?.erro(respostaAssistente)

      const novoHistorico = [...historicoAtual, { role: 'assistant', content: respostaAssistente }]
      setMensagens(novoHistorico)
      iniciarTypewriter(respostaAssistente)
      if (res.ok && data.requer_confirmacao) setAcaoPendente(data.proposta)
      if (vozAutomatica) falar(respostaAssistente)
      await persistirConversa(novoHistorico, texto)
    } catch {
      const erro = t('erro_conexao')
      setMensagens((prev) => [...prev, { role: 'assistant', content: erro }])
      iniciarTypewriter(erro)
    }
    setCarregando(false)
  }

  async function confirmarAcao() {
    if (!acaoPendente) return
    setConfirmando(true)
    try {
      const res = await fetch(urlFuncao('assistente-jarvis'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.token}` },
        body: JSON.stringify({ confirmar_acao: { tool: acaoPendente.tool, input: acaoPendente.input }, idioma }),
      })
      const data = await res.json()
      const texto = res.ok && data.ok ? data.acao_executada : (data.erro || t('erro_processar'))
      const conteudo = `✓ ${texto}`
      const msg = { role: 'assistant', content: conteudo }
      const novoHistorico = [...mensagens, msg]
      setMensagens(novoHistorico)
      iniciarTypewriter(conteudo)
      setAcaoPendente(null)
      if (vozAutomatica) falar(texto)
      await persistirConversa(novoHistorico, texto, 1)
      carregarBriefing().then(carregarSugestoes)
    } catch {
      toast?.erro(t('erro_conexao_confirmar'))
    }
    setConfirmando(false)
  }

  async function cancelarAcao() {
    setAcaoPendente(null)
    const textoCancelado = t('cancelado')
    const novoHistorico = [...mensagens, { role: 'assistant', content: textoCancelado }]
    setMensagens(novoHistorico)
    iniciarTypewriter(textoCancelado)
    await persistirConversa(novoHistorico, textoCancelado, 1)
  }

  const { iniciarEscuta, pararEscuta, escutando, suportado } = useVoz({
    onTranscricao: (texto) => { setTextoInterim(''); enviar(texto) },
    onInterim: (texto) => setTextoInterim(texto),
    onErro: (e) => { setTextoInterim(''); toast?.erro(typeof e === 'string' ? e : t('erro_captura_voz')) },
    idioma,
  })

  function toggleVoz() {
    // Solta a sessão de áudio de reprodução antes de pedir a de
    // gravação — no iOS, alternar entre falar e ouvir sem soltar a
    // anterior é uma causa conhecida de captura de voz instável.
    pararFala()
    if (!escutando && vozAutomatica) desbloquear()
    if (escutando) pararEscuta()
    else iniciarEscuta()
  }

  const isJarvis = sessao.espaco.jarvis_enabled === true
  const orbeStatus = escutando ? 'ouvindo' : carregandoAudio ? 'processando' : falando ? 'falando' : 'aguardando'
  const localeData = idioma === 'en' ? 'en-US' : 'pt-BR'

  // Histórico/voz/notif/nova conversa — renderizados duas vezes: com
  // rótulo dentro de .hud-chat-controles (linha própria, desktop) e só
  // ícone dentro de .hud-bm-controles (mesma linha do clima, mobile —
  // uma linha própria pros controles era o que empurrava o chat/input
  // pra fora da tela em telas menores). Mesmos handlers, mesmo estado.
  function renderControles(compacto) {
    const historico = (
      <button type="button" className="hud-ctrl-btn" onClick={() => setMostrarHistorico((v) => !v)} title={t('historico')} aria-label={t('historico')}>
        <History size={13} /> {!compacto && t('historico')}
      </button>
    )
    const outros = (
      <>
        {falaSuportada && (
          <button
            type="button"
            className="hud-ctrl-btn"
            data-ativo={vozAutomatica}
            onClick={toggleVozAutomatica}
            title={vozAutomatica ? t('desativar_voz') : t('ativar_voz')}
            aria-label={vozAutomatica ? t('desativar_voz') : t('ativar_voz')}
          >
            {carregandoAudio ? <Loader2 size={13} className="icone-girando" /> : falando ? <Volume2 size={13} /> : vozAutomatica ? <Volume1 size={13} /> : <VolumeX size={13} />}
          </button>
        )}
        {pushSuportado && (
          <button
            type="button"
            className="hud-ctrl-btn"
            data-ativo={notifAtivo}
            onClick={alternarNotificacoes}
            disabled={notifCarregando}
            title={notifAtivo ? t('desativar_notif') : t('ativar_notif')}
            aria-label={notifAtivo ? t('desativar_notif') : t('ativar_notif')}
          >
            {notifAtivo ? <Bell size={13} /> : <BellOff size={13} />}
          </button>
        )}
        <button type="button" className="hud-ctrl-btn" onClick={novaConversa} title={t('nova_conversa')} aria-label={t('nova_conversa')}>
          <Plus size={13} /> {!compacto && t('nova_conversa')}
        </button>
      </>
    )
    // Desktop mantém "histórico" isolado à esquerda e o resto agrupado
    // à direita (.hud-chat-controles usa justify-content:space-between,
    // e o agrupamento é o que separa esses dois blocos). No mobile isso
    // não importa — é só um cluster compacto de ícones ao lado do clima.
    if (compacto) return <>{historico}{outros}</>
    return <>{historico}<div className="hud-chat-controles-grupo">{outros}</div></>
  }

  return (
    <>
      {!bootDone && <BootSequence onDone={() => setBootDone(true)} codigo={sessao.espaco.codigo} idioma={idioma} />}

      <div className="hud-root">
        <div className="hud-grid-bg" />
        <div className="hud-scanlines" />
        <div className="hud-scanline-beam" />

        <div className="hud-topbar-wrapper">
          <TopBar briefing={briefing} codigo={sessao.espaco.codigo} idioma={idioma} onSair={sair} />
        </div>

        <div className="hud-main">
          {/* COLUNA ESQUERDA — Briefing + Vida */}
          <div className="hud-col hud-col--left">
            <HudPanel label="BRIEFING · HOJE" className="hud-briefing-panel">
              {briefing?.eventosHoje?.length > 0 ? (
                <div className="hud-briefing-eventos">
                  {briefing.eventosHoje.slice(0, 4).map((e, i) => (
                    <div key={i} className="hud-briefing-evento">
                      <span className="hud-ev-hora">
                        {new Date(e.inicio).toLocaleTimeString(localeData, { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span>{e.titulo}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="hud-dim">{idioma === 'en' ? 'No events today' : 'Sem eventos hoje'}</div>
              )}

              {briefing?.urgentes?.length > 0 && (
                <div className="hud-priority-card">
                  <span className="hud-priority-dot" />
                  {idioma === 'en' ? 'PRIORITY' : 'PRIORIDADE'}: "{briefing.urgentes[0].nome}"
                </div>
              )}

              {sugestoes.length > 0 && (
                <div className="hud-sugestoes">
                  {sugestoes.map((sug) => (
                    <button key={sug.id} type="button" className="hud-sugestao-btn" onClick={() => navegar(sug.rota)}>
                      <sug.Icon size={13} />
                      <span className="hud-sugestao-msg">{sug.mensagem}</span>
                      <ArrowRight size={12} />
                    </button>
                  ))}
                </div>
              )}
            </HudPanel>

            <HudPanel label={idioma === 'en' ? 'LIFE · WEEK HABITS' : 'VIDA · HÁBITOS DA SEMANA'} className="hud-vida-panel">
              <VidaHabitos cliente={cliente} idioma={idioma} />
            </HudPanel>
          </div>

          {/* CENTRO — Orbe + Chat */}
          <div className="hud-col hud-col--center">
            <Orbe status={orbeStatus} size={230} idioma={idioma} />

            {/* Briefing compacto — só visível no mobile (colunas
                esquerda/direita somem abaixo de 1024px, então o
                briefing completo vai junto; isso cobre o vazio). Os
                controles (histórico/voz/notif/nova) entram na mesma
                linha do clima aqui — uma linha própria pra eles era o
                que empurrava o chat/input pra fora da tela. */}
            <div className="hud-briefing-mobile">
              <div className="hud-bm-top">
                <span className="hud-briefing-mobile-clima">
                  {briefing?.tempo && `${briefing.tempo.temp}°C · ${briefing.tempo.descricao}${briefing.tempo.probChuva > 40 ? ` · CHUVA ${briefing.tempo.probChuva}%` : ''}`}
                </span>
                <div className="hud-bm-controles">{renderControles(true)}</div>
              </div>
              {briefing?.eventosHoje?.[0] && (
                <div className="hud-briefing-mobile-evento">
                  <span className="hud-briefing-mobile-hora">
                    {new Date(briefing.eventosHoje[0].inicio).toLocaleTimeString(localeData, { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {briefing.eventosHoje[0].titulo}
                </div>
              )}
              {briefing?.urgentes?.[0] && (
                <div style={{ color: 'var(--hud-amber)', fontSize: 10 }}>
                  <Flag size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
                  {briefing.urgentes[0].nome}
                </div>
              )}
            </div>

            <div className="hud-chat-controles">{renderControles(false)}</div>

            {mostrarHistorico && (
              <div className="hud-historico-sidebar">
                <div className="hud-historico-header">
                  <span>{t('conversas_anteriores')}</span>
                  <button type="button" className="modal-fechar" onClick={() => setMostrarHistorico(false)} aria-label={t('fechar')}>
                    <X size={15} />
                  </button>
                </div>
                {conversas.length === 0 && <p className="hud-historico-vazio">{t('nenhuma_conversa')}</p>}
                {conversas.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="hud-historico-item"
                    data-ativo={c.id === conversaId}
                    onClick={() => carregarConversa(c.id)}
                  >
                    <span className="hud-historico-titulo">{c.titulo || t('conversa_padrao')}</span>
                    <span className="hud-historico-data">{new Date(c.atualizado_em).toLocaleDateString(localeData, { day: '2-digit', month: '2-digit' })}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="hud-chat">
              {mensagens.map((m, i) => {
                const isLast = i === mensagens.length - 1
                const conteudo = isLast && m.role === 'assistant' && twAtivo ? twTexto : m.content
                return (
                  <div key={i} className={`hud-msg hud-msg--${m.role}`}>
                    <div className="hud-msg-corpo">
                      <div className={`hud-bubble hud-bubble--${m.role}`} dangerouslySetInnerHTML={{ __html: renderMsg(conteudo) }} />
                      {m.role === 'assistant' && falaSuportada && (
                        <button type="button" className="hud-btn-ouvir-msg" onClick={() => falar(m.content)} title={t('ouvir_mensagem')} aria-label={t('ouvir_mensagem')}>
                          <Volume2 size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

              {carregando && !twAtivo && (
                <div className="hud-msg hud-msg--assistant">
                  <div className="hud-bubble hud-bubble--assistant hud-bubble--loading">
                    <span className="dot" /><span className="dot" /><span className="dot" />
                  </div>
                </div>
              )}

              {!carregando && carregandoAudio && (
                <div className="hud-msg hud-msg--assistant">
                  <div className="hud-bubble hud-bubble--assistant" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--hud-text-dim)' }}>
                    <Loader2 size={13} className="icone-girando" />
                    <span>{t('preparando_audio')}</span>
                  </div>
                </div>
              )}

              {acaoPendente && (
                <div className="hud-confirm-card">
                  <div className="hud-confirm-label"><Zap size={12} style={{ marginRight: 4, verticalAlign: -2 }} />{t('confirmar_acao_titulo').toUpperCase()}</div>
                  <div className="hud-confirm-desc">{acaoPendente.descricao}</div>
                  <div className="hud-confirm-btns">
                    <button type="button" className="hud-btn-sim" onClick={confirmarAcao} disabled={confirmando}>
                      <Check size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> {confirmando ? t('executando') : t('confirmar')}
                    </button>
                    <button type="button" className="hud-btn-nao" onClick={cancelarAcao} disabled={confirmando}>
                      <X size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> {t('cancelar')}
                    </button>
                  </div>
                </div>
              )}

              <div ref={rodapeRef} />
            </div>

            <div className="hud-input-row">
              {suportado && (
                <button
                  type="button"
                  className={`hud-mic-btn ${escutando ? 'hud-mic-btn--rec' : ''}`}
                  onClick={toggleVoz}
                  title={escutando ? t('mic_parar') : t('mic_falar')}
                  aria-label={escutando ? t('parar_captura') : t('falar_assistente')}
                >
                  {escutando ? <Square size={16} /> : <Mic size={16} />}
                </button>
              )}
              <input
                className="hud-input"
                type="text"
                placeholder={escutando ? t('ouvindo') : t('fale_com_jarvis')}
                value={escutando ? textoInterim : input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && enviar()}
                disabled={carregando}
                readOnly={escutando}
              />
              <button type="button" className="hud-send-btn" onClick={() => enviar()} disabled={!input.trim() || carregando} aria-label={t('enviar_aria')}>
                <ArrowUp size={18} />
              </button>
            </div>
          </div>

          {/* COLUNA DIREITA — Projetos + Financeiro */}
          <div className="hud-col hud-col--right">
            <HudPanel label="PROJETOS" className="hud-projetos-panel">
              <PainelProjetos cliente={cliente} idioma={idioma} />
            </HudPanel>

            <HudPanel className="hud-financeiro-panel">
              <PainelFinanceiro cliente={cliente} espacoId={sessao.espaco.id} idioma={idioma} />
            </HudPanel>
          </div>
        </div>

        {isJarvis && <HudTabBar />}
      </div>
    </>
  )
}
