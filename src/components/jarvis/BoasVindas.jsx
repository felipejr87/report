import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sun, CloudSun, Cloud, CloudRain, CloudLightning, CloudFog, Umbrella, Mic, MessageCircle, ClipboardList, Wallet } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { urlFuncao } from '../../lib/supabase'

function IconeTempo({ descricao, ...props }) {
  if (!descricao) return <Sun {...props} />
  if (descricao.includes('limpo')) return <Sun {...props} />
  if (descricao.includes('tempestade')) return <CloudLightning {...props} />
  if (descricao.includes('chuva') || descricao.includes('garoa') || descricao.includes('pancadas')) return <CloudRain {...props} />
  if (descricao.includes('neblina')) return <CloudFog {...props} />
  if (descricao.includes('nublado') && !descricao.includes('parcialmente')) return <Cloud {...props} />
  return <CloudSun {...props} />
}

export default function BoasVindas() {
  const { sessao } = useAuth()
  const navigate = useNavigate()
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => { carregar() }, [])

  async function carregar() {
    try {
      const res = await fetch(urlFuncao('jarvis-briefing'), {
        headers: { Authorization: `Bearer ${sessao.token}` },
      })
      const data = await res.json()
      if (data.ok) setDados(data)
    } catch (e) {
      console.warn('[boas-vindas]', e)
    }
    setCarregando(false)
  }

  if (carregando) {
    return (
      <div className="bv-skeleton">
        <div className="skel-line w-40" />
        <div className="skel-line w-60" />
      </div>
    )
  }

  if (!dados) return null

  const { saudacao, diaSemana, tempo, eventosHoje, urgentes, paradas, habitosPendentes } = dados

  function gerarSugestao() {
    if (urgentes?.length > 0) {
      return `Prioridade: "${urgentes[0].nome}" — vence em breve.`
    }
    if (paradas?.length > 0) {
      const dias = Math.floor((Date.now() - new Date(paradas[0].atualizado_em).getTime()) / 86400000)
      return `"${paradas[0].nome}" está parada há ${dias} dias.`
    }
    if (habitosPendentes?.length > 0) {
      return `${habitosPendentes[0].nome} ainda não registrado esta semana.`
    }
    return 'Agenda limpa. Bom momento para avançar nos projetos.'
  }

  return (
    <div className="boas-vindas">
      <div className="bv-topo">
        <div>
          <p className="bv-saudacao">{saudacao}, Felipe.</p>
          <p className="bv-dia">{diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1)}.</p>
        </div>

        {tempo && (
          <div className="bv-tempo">
            <IconeTempo descricao={tempo.descricao} size={22} className="tempo-icone" />
            <div className="tempo-info">
              <span className="tempo-temp">{tempo.temp}°C</span>
              <span className="tempo-desc">{tempo.descricao}</span>
              {tempo.probChuva > 40 && (
                <span className="tempo-chuva"><Umbrella size={10} /> {tempo.probChuva}%</span>
              )}
            </div>
          </div>
        )}
      </div>

      {eventosHoje?.length > 0 && (
        <div className="bv-eventos">
          {eventosHoje.slice(0, 2).map((e, i) => (
            <div key={i} className="bv-evento">
              <span className="bv-evento-hora">
                {new Date(e.inicio).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="bv-evento-titulo">{e.titulo}</span>
            </div>
          ))}
          {eventosHoje.length > 2 && <p className="bv-mais">+ {eventosHoje.length - 2} evento(s)</p>}
        </div>
      )}

      <div className="bv-sugestao">
        <span className="bv-sugestao-label">→</span>
        <span>{gerarSugestao()}</span>
      </div>

      <div className="bv-acoes">
        <button type="button" className="bv-btn-principal" onClick={() => navigate('/jarvis/assistente')}>
          <Mic size={16} />
          <span>Falar com Jarvis</span>
        </button>
        <button type="button" className="bv-btn-sec" onClick={() => navigate('/jarvis/assistente')} aria-label="Chat">
          <MessageCircle size={16} />
        </button>
        <button type="button" className="bv-btn-sec" onClick={() => navigate('/jarvis/brief')} aria-label="Brief">
          <ClipboardList size={16} />
        </button>
        <button type="button" className="bv-btn-sec" onClick={() => navigate('/jarvis/financeiro')} aria-label="Financeiro">
          <Wallet size={16} />
        </button>
      </div>
    </div>
  )
}
