import { useState, useRef, useEffect, useCallback } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Mic, Square, ArrowUp, History, Plus, X, Volume2, Volume1, VolumeX, Zap, Check, Umbrella, Bell, BellOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useIdioma } from '../hooks/useIdioma'
import { useTexto } from '../lib/i18n'
import { supabaseEspaco, urlFuncao } from '../lib/supabase'
import { useVoz, useFala } from '../hooks/useVoz'
import Header from '../components/Header'
import TabBar from '../components/jarvis/TabBar'
import IndicadorFala from '../components/jarvis/IndicadorFala'

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

// Frases curtas, tom J.A.R.V.I.S. — diretas, sem clichê de pôster
// motivacional. Uma por período, sorteada a cada nova conversa.
const FRASES_MOTIVACIONAIS = {
  pt: {
    manha: [
      'O dia começa agora — o resto é execução.',
      'Prioridade clara vale mais que agenda cheia.',
      'Um problema resolvido hoje não some, mas para de crescer.',
      'Menos abas abertas, mais coisa entregue.',
      'Disciplina de hoje é o resultado de outubro.',
    ],
    tarde: [
      'Metade do caminho andado. Segue no ritmo.',
      'Ajusta a rota, não precisa recomeçar.',
      'O que já rendeu, rendeu. Próximo passo.',
      'Sem pressa, sem parar.',
      'Tarde de continuar, não de justificar.',
    ],
    noite: [
      'O dia não precisa ser perfeito pra ter valido.',
      'Fechar bem hoje abre bem amanhã.',
      'Descansar é parte do plano, não desvio dele.',
      'O que não foi feito espera. Você, não.',
      'Silêncio agora, retomada amanhã.',
    ],
  },
  en: {
    manha: [
      'The day starts now — the rest is execution.',
      'A clear priority beats a full calendar.',
      "A problem solved today stops growing, even if it doesn't vanish.",
      'Fewer open tabs, more delivered work.',
      "Today's discipline is October's result.",
    ],
    tarde: [
      'Halfway there. Keep the pace.',
      'Adjust course, no need to restart.',
      "What's done is done. Next step.",
      'No rush, no stopping.',
      'An afternoon for continuing, not justifying.',
    ],
    noite: [
      "The day doesn't need to be perfect to have counted.",
      'Closing well today opens well tomorrow.',
      'Resting is part of the plan, not a detour from it.',
      "What wasn't done will wait. You won't.",
      'Quiet now, resume tomorrow.',
    ],
  },
}

function frase(idioma, periodo) {
  const opcoes = FRASES_MOTIVACIONAIS[idioma]?.[periodo] || FRASES_MOTIVACIONAIS.pt[periodo]
  return opcoes[Math.floor(Math.random() * opcoes.length)]
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

function horaEvento(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

// Fragmentos de texto do digest, por idioma — usados só dentro de
// montarSaudacao, então ficam colados nela em vez de ir pro i18n.js
// (que é só pras strings estáticas de botão/label).
const TEXTO_SAUDACAO = {
  pt: {
    agenda: (lista) => `Agenda: ${lista}.`,
    agendaLivre: 'Agenda livre hoje.',
    prioridade: (nome) => `Prioridade: "${nome}" vence em breve.`,
    parada: (nome) => `"${nome}" está parada há dias — vale um empurrão.`,
    proximoCompromisso: (titulo, hora) => `Próximo compromisso: ${titulo} às ${hora}.`,
    habitosPendentes: (lista) => `Ainda sem marcar: ${lista}.`,
    amanha: (nome) => `Amanhã: "${nome}" tem prioridade.`,
    paradaAtencao: (nome) => `"${nome}" pede atenção antes que vire urgência.`,
    oQuePrecisa: 'O que precisa?',
    encerramento: 'Como fecha o dia — tudo em dia ou ficou algo solto pra amanhã?',
    chuva: (pct) => ` — ${pct}% de chance de chuva`,
  },
  en: {
    agenda: (lista) => `Schedule: ${lista}.`,
    agendaLivre: 'Schedule is clear today.',
    prioridade: (nome) => `Priority: "${nome}" is due soon.`,
    parada: (nome) => `"${nome}" has been stalled for days — worth a push.`,
    proximoCompromisso: (titulo, hora) => `Next up: ${titulo} at ${hora}.`,
    habitosPendentes: (lista) => `Still unchecked: ${lista}.`,
    amanha: (nome) => `Tomorrow: "${nome}" takes priority.`,
    paradaAtencao: (nome) => `"${nome}" needs attention before it becomes urgent.`,
    oQuePrecisa: 'What do you need?',
    encerramento: 'How did the day close — all settled or something left loose for tomorrow?',
    chuva: (pct) => ` — ${pct}% chance of rain`,
  },
}

// Constrói a saudação inicial usando o briefing (clima/agenda/atividades)
// já carregado — conteúdo muda de peso conforme o período do dia:
// manhã = digest completo, tarde = leve, noite = sugestões + fechamento.
function montarSaudacao(dados, idioma) {
  const lang = idioma === 'en' ? 'en' : 'pt'
  const s = TEXTO_SAUDACAO[lang]
  const agoraFallback = new Date().getHours()

  if (!dados) {
    const periodoFallback = agoraFallback < 12 ? 'manha' : agoraFallback < 18 ? 'tarde' : 'noite'
    return `${SAUDACAO_PALAVRA[lang][periodoFallback]}, Felipe. ${s.oQuePrecisa}`
  }

  const periodo = periodoDe(dados.saudacao)
  const dia = new Date().toLocaleDateString(lang === 'en' ? 'en-US' : 'pt-BR', { weekday: 'long' })
  const diaCap = dia.charAt(0).toUpperCase() + dia.slice(1)
  const linhas = [`${SAUDACAO_PALAVRA[lang][periodo]}, Felipe. ${diaCap}, ${dados.hora}.`]

  if (periodo === 'manha') {
    if (dados.tempo) {
      const chuva = dados.tempo.probChuva > 40 ? s.chuva(dados.tempo.probChuva) : ''
      linhas.push(`${dados.tempo.temp}°C, ${dados.tempo.descricao}${chuva}.`)
    }
    linhas.push(
      dados.eventosHoje.length > 0
        ? s.agenda(dados.eventosHoje.slice(0, 3).map((e) => `${horaEvento(e.inicio)} ${e.titulo}`).join('; '))
        : s.agendaLivre
    )
    if (dados.urgentes.length > 0) linhas.push(s.prioridade(dados.urgentes[0].nome))
    else if (dados.paradas.length > 0) linhas.push(s.parada(dados.paradas[0].nome))
    linhas.push(frase(lang, 'manha'))
    linhas.push(s.oQuePrecisa)
  } else if (periodo === 'tarde') {
    const proximo = dados.eventosHoje.find((e) => new Date(e.inicio) > new Date())
    if (proximo) linhas.push(s.proximoCompromisso(proximo.titulo, horaEvento(proximo.inicio)))
    linhas.push(frase(lang, 'tarde'))
    linhas.push(s.oQuePrecisa)
  } else {
    if (dados.habitosPendentes.length > 0) linhas.push(s.habitosPendentes(dados.habitosPendentes.slice(0, 2).map((h) => h.nome).join(', ')))
    if (dados.urgentes.length > 0) linhas.push(s.amanha(dados.urgentes[0].nome))
    if (dados.paradas.length > 0) linhas.push(s.paradaAtencao(dados.paradas[0].nome))
    linhas.push(frase(lang, 'noite'))
    linhas.push(s.encerramento)
  }

  return linhas.join('\n')
}

export default function JarvisHome() {
  const { sessao, sair } = useAuth()
  const toast = useToast()
  const { idioma } = useIdioma()
  const t = useTexto()
  const localeData = idioma === 'en' ? 'en-US' : 'pt-BR'
  const [conversas, setConversas] = useState([])
  const [conversaId, setConversaId] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const [vozAutomatica, setVozAutomatica] = useState(() => localStorage.getItem(CHAVE_VOZ_AUTO) === 'true')
  const [acaoPendente, setAcaoPendente] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [briefing, setBriefing] = useState(null)
  const [notifAtivo, setNotifAtivo] = useState(false)
  const [notifCarregando, setNotifCarregando] = useState(false)
  const rodapeRef = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const msgInicialEnviada = useRef(false)

  const { falar, pararFala, falando, suportado: falaSuportada, desbloquear } = useFala(idioma)

  function toggleVozAutomatica() {
    const novo = !vozAutomatica
    setVozAutomatica(novo)
    localStorage.setItem(CHAVE_VOZ_AUTO, String(novo))
    if (novo) desbloquear()
    else pararFala()
  }

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

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
    setMensagens([{ role: 'assistant', content: montarSaudacao(dados, idioma) }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token, carregarBriefing, idioma])

  useEffect(() => { carregarConversas(); novaConversa() }, [carregarConversas, novaConversa])
  useEffect(() => { rodapeRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens, acaoPendente])

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

    const novas = historico.slice(-qtdNovas)
    await cliente.from('conversa_mensagens').insert(
      novas.map((m) => ({ conversa_id: convId, role: m.role, content: m.content }))
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
      if (res.ok && data.requer_confirmacao) setAcaoPendente(data.proposta)
      if (vozAutomatica) falar(respostaAssistente)
      await persistirConversa(novoHistorico, texto)
    } catch {
      setMensagens((prev) => [...prev, { role: 'assistant', content: t('erro_conexao') }])
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
      const msg = { role: 'assistant', content: `✓ ${texto}` }
      const novoHistorico = [...mensagens, msg]
      setMensagens(novoHistorico)
      setAcaoPendente(null)
      if (vozAutomatica) falar(texto)
      await persistirConversa(novoHistorico, texto, 1)
      carregarBriefing()
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
    await persistirConversa(novoHistorico, textoCancelado, 1)
  }

  const { iniciarEscuta, pararEscuta, escutando, suportado } = useVoz({
    onTranscricao: (texto) => enviar(texto),
    onErro: (e) => toast?.erro(typeof e === 'string' ? e : t('erro_captura_voz')),
    idioma,
  })

  const isJarvis = sessao.espaco.jarvis_enabled === true

  return (
    <div className="jarvis-chat-layout">
      <Header espaco={sessao.espaco} onSair={sair} />
      <IndicadorFala ativo={falando} />

      {briefing && (
        <div className="jarvis-briefing">
          {briefing.tempo && (
            <div className="bv-tempo-inline">
              <span className="tempo-num">{briefing.tempo.temp}°C</span>
              <span className="tempo-txt">{briefing.tempo.descricao}</span>
              {briefing.tempo.probChuva > 40 && (
                <span className="tempo-chuva"><Umbrella size={11} /> {briefing.tempo.probChuva}%</span>
              )}
            </div>
          )}
          {briefing.eventosHoje?.length > 0 && (
            <div className="bv-eventos-inline">
              {briefing.eventosHoje.slice(0, 2).map((e, i) => (
                <span key={i} className="bv-ev">
                  <span className="bv-ev-hora">{new Date(e.inicio).toLocaleTimeString(localeData, { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</span>
                  {e.titulo}
                </span>
              ))}
            </div>
          )}
          {(briefing.urgentes?.length > 0 || briefing.paradas?.length > 0) && (
            <div className="bv-sugestao-inline">
              → {briefing.urgentes?.length > 0 ? `"${briefing.urgentes[0].nome}" — ${t('prazo_proximo')}` : `"${briefing.paradas[0].nome}" ${t('parada_dias')}`}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="btn-secundario" onClick={() => setMostrarHistorico((v) => !v)}>
          <History size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
          {t('historico')}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          {falaSuportada && (
            <button
              type="button"
              className="link-acao"
              data-ativo={vozAutomatica}
              onClick={toggleVozAutomatica}
              title={vozAutomatica ? t('desativar_voz') : t('ativar_voz')}
              aria-label={vozAutomatica ? t('desativar_voz') : t('ativar_voz')}
            >
              {falando ? <Volume2 size={14} /> : vozAutomatica ? <Volume1 size={14} /> : <VolumeX size={14} />}
            </button>
          )}
          {pushSuportado && (
            <button
              type="button"
              className="link-acao"
              data-ativo={notifAtivo}
              onClick={alternarNotificacoes}
              disabled={notifCarregando}
              title={notifAtivo ? t('desativar_notif') : t('ativar_notif')}
              aria-label={notifAtivo ? t('desativar_notif') : t('ativar_notif')}
            >
              {notifAtivo ? <Bell size={14} /> : <BellOff size={14} />}
            </button>
          )}
          <button type="button" className="link-acao" onClick={novaConversa}>
            <Plus size={14} />
            {t('nova_conversa')}
          </button>
        </div>
      </div>

      {mostrarHistorico && (
        <div className="historico-sidebar">
          <div className="historico-header">
            <span className="text-titulo" style={{ fontSize: 14 }}>{t('conversas_anteriores')}</span>
            <button type="button" className="modal-fechar" onClick={() => setMostrarHistorico(false)} aria-label={t('fechar')}>
              <X size={16} />
            </button>
          </div>
          {conversas.length === 0 && <p className="text-micro" style={{ padding: 'var(--space-md)' }}>{t('nenhuma_conversa')}</p>}
          {conversas.map((c) => (
            <button
              key={c.id}
              type="button"
              className="historico-item"
              data-ativo={c.id === conversaId}
              onClick={() => carregarConversa(c.id)}
            >
              <span className="hist-titulo">{c.titulo || t('conversa_padrao')}</span>
              <span className="hist-data">{new Date(c.atualizado_em).toLocaleDateString(localeData, { day: '2-digit', month: '2-digit' })}</span>
            </button>
          ))}
        </div>
      )}

      <div className="chat-historico">
        {mensagens.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            {m.role === 'assistant' && <span className="chat-avatar">J</span>}
            <div className="chat-msg-corpo">
              <div className="chat-bubble" dangerouslySetInnerHTML={{ __html: renderMsg(m.content) }} />
              {m.role === 'assistant' && falaSuportada && (
                <button type="button" className="btn-ouvir-msg" onClick={() => falar(m.content)} title={t('ouvir_mensagem')} aria-label={t('ouvir_mensagem')}>
                  <Volume2 size={12} />
                </button>
              )}
            </div>
          </div>
        ))}

        {carregando && (
          <div className="chat-msg assistant">
            <span className="chat-avatar">J</span>
            <div className="chat-bubble">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
            </div>
          </div>
        )}

        {acaoPendente && (
          <div className="confirmacao-card">
            <p className="conf-titulo"><Zap size={13} /> {t('confirmar_acao_titulo')}</p>
            <p className="conf-desc">{acaoPendente.descricao}</p>
            <div className="conf-acoes">
              <button type="button" className="conf-sim" onClick={confirmarAcao} disabled={confirmando}>
                <Check size={14} /> {confirmando ? t('executando') : t('confirmar')}
              </button>
              <button type="button" className="conf-nao" onClick={cancelarAcao} disabled={confirmando}>
                <X size={14} /> {t('cancelar')}
              </button>
            </div>
          </div>
        )}

        <div ref={rodapeRef} />
      </div>

      <div className="chat-input-area">
        {suportado && (
          <button
            type="button"
            className="chat-mic"
            data-ativo={escutando}
            onClick={() => { if (!escutando && vozAutomatica) desbloquear(); (escutando ? pararEscuta : iniciarEscuta)() }}
            title={escutando ? t('mic_parar') : t('mic_falar')}
            aria-label={escutando ? t('parar_captura') : t('falar_assistente')}
          >
            {escutando ? <Square size={16} /> : <Mic size={16} />}
          </button>
        )}
        <input
          className="chat-input"
          type="text"
          placeholder={escutando ? t('ouvindo') : t('fale_com_jarvis')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enviar()}
          disabled={carregando || escutando}
        />
        <button type="button" className="chat-enviar" onClick={() => enviar()} disabled={!input.trim() || carregando} aria-label={t('enviar_aria')}>
          <ArrowUp size={18} />
        </button>
      </div>

      {isJarvis && <TabBar />}
    </div>
  )
}
