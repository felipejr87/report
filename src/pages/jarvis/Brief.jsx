import { useEffect, useState, useCallback } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Lightbulb } from 'lucide-react'
import { supabaseEspaco } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import Header from '../../components/Header'
import CapturaRapida from '../../components/CapturaRapida'
import { isEnabled } from '../../lib/features'

function fmt(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0) }

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

export default function Brief() {
  const { sessao, sair } = useAuth()
  const navigate = useNavigate()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const gerarBrief = useCallback(async () => {
    if (!cliente) return
    setErro('')

    const hojeStr = new Date().toISOString().split('T')[0]
    const tresDiasAtras = new Date(Date.now() - 3 * 86400000).toISOString()
    const inicioMes = new Date().toISOString().slice(0, 7) + '-01'
    const semana = diasDaSemanaAtual()

    const [
      { data: atividadesParadas, error: e1 },
      { data: eventosHoje, error: e2 },
      { data: habitos, error: e3 },
      { data: checks, error: e4 },
      { data: lancamentosMes, error: e5 },
      { data: categorias, error: e6 },
      { data: projetos, error: e7 },
    ] = await Promise.all([
      cliente.from('atividades').select('nome, atualizado_em, projeto_id').neq('fase', 'entregue').lt('atualizado_em', tresDiasAtras),
      cliente.from('eventos_cal').select('titulo, inicio').gte('inicio', hojeStr + 'T00:00:00').lte('inicio', hojeStr + 'T23:59:59').order('inicio'),
      cliente.from('habitos').select('*').eq('ativo', true),
      cliente.from('habito_checks').select('*').gte('data', semana[0]).lte('data', semana[6]),
      cliente.from('lancamentos').select('valor, categoria_id').gte('data', inicioMes),
      cliente.from('categorias_fin').select('*'),
      cliente.from('projetos').select('nome, fase, pilar_id, data_lancamento'),
    ])

    const primeiroErro = e1 || e2 || e3 || e4 || e5 || e6 || e7
    if (primeiroErro) { setErro(primeiroErro.message); return }

    const alertas = []

    atividadesParadas?.forEach((a) => {
      const dias = Math.floor((Date.now() - new Date(a.atualizado_em)) / 86400000)
      alertas.push({ msg: `${a.nome} parado há ${dias} dias`, severidade: dias > 7 ? 'confronto' : 'atencao' })
    })

    const gastoPorCat = {}
    lancamentosMes?.filter((l) => l.valor < 0).forEach((l) => {
      if (l.categoria_id) gastoPorCat[l.categoria_id] = (gastoPorCat[l.categoria_id] || 0) + Math.abs(l.valor)
    })
    categorias?.filter((c) => c.teto_mensal).forEach((c) => {
      const pct = (gastoPorCat[c.id] || 0) / c.teto_mensal
      if (pct >= 1) alertas.push({ msg: `${c.nome} estourou o teto (${Math.round(pct * 100)}%)`, severidade: 'confronto' })
      else if (pct >= 0.8) alertas.push({ msg: `${c.nome}: ${Math.round(pct * 100)}% do teto`, severidade: 'atencao' })
    })

    const temClientePagante = projetos?.some((p) => p.fase === 'operacao')
    if (!temClientePagante) {
      alertas.push({ msg: 'Nenhum produto com cliente pagante. O que você faz hoje pra chegar mais perto disso?', severidade: 'confronto' })
    }

    projetos?.filter((p) => p.pilar_id === 3 && !p.data_lancamento).forEach((p) => {
      alertas.push({ msg: `${p.nome}: sem data de lançamento definida`, severidade: 'confronto' })
    })

    setDados({
      eventosHoje: eventosHoje || [],
      habitos: habitos || [],
      checks: checks || [],
      alertas,
      semana,
      lancamentosCount: lancamentosMes?.length || 0,
      atividadesParadas7d: (atividadesParadas || []).filter((a) => Math.floor((Date.now() - new Date(a.atualizado_em)) / 86400000) > 7).length,
    })
  }, [sessao?.token])

  useEffect(() => { gerarBrief() }, [gerarBrief])

  if (!sessao) return <Navigate to="/" replace />
  if (erro) return <p role="alert" className="campo-erro" style={{ padding: 'var(--space-lg)' }}>{erro}</p>
  if (!dados) return <p className="text-body" style={{ padding: 'var(--space-lg)' }}>Gerando brief...</p>

  const confrontos = dados.alertas.filter((a) => a.severidade === 'confronto')
  const atencoes = dados.alertas.filter((a) => a.severidade === 'atencao')
  const confrontoAtivo = confrontos[0]

  const mesAtual = new Date().toISOString().slice(0, 7)
  const checksEssaSemana = dados.checks.length
  const sugestoes = []
  if (dados.lancamentosCount < 5) {
    sugestoes.push({
      mensagem: 'Você registrou poucos gastos este mês. Quer listar os fixos pra confirmar?',
      labelAcao: 'Ir pro assistente',
      acao: () => navigate(`/jarvis/assistente?msg=${encodeURIComponent(`lista os gastos fixos de ${mesAtual}`)}`),
    })
  }
  if (dados.atividadesParadas7d > 3) {
    sugestoes.push({
      mensagem: `${dados.atividadesParadas7d} atividades sem movimento há mais de 7 dias. Revisar?`,
      labelAcao: 'Ver projetos',
      acao: () => navigate('/espaco'),
    })
  }
  if (checksEssaSemana < 2) {
    sugestoes.push({
      mensagem: 'Poucos checks de hábito esta semana. Treino em dia?',
      labelAcao: 'Ver hábitos',
      acao: () => navigate('/jarvis/habitos'),
    })
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <Header espaco={sessao.espaco} onSair={sair} />

      <CapturaRapida cliente={cliente} onConfirmado={gerarBrief} />

      <div>
        <h1 className="text-hero" style={{ fontSize: 28 }}>Bom dia, Felipe</h1>
        <p className="text-micro">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })}
        </p>
      </div>

      {dados.eventosHoje.length > 0 && (
        <section className="detalhe-secao">
          <h2 className="section-label">Hoje</h2>
          {dados.eventosHoje.map((e, i) => (
            <div key={i} className="text-body" style={{ display: 'flex', gap: 8 }}>
              <span className="text-micro">{new Date(e.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span>{e.titulo}</span>
            </div>
          ))}
        </section>
      )}

      {atencoes.length > 0 && (
        <section className="detalhe-secao">
          <h2 className="section-label">Atenção</h2>
          {atencoes.map((a, i) => <p key={i} className="brief-alerta">⚑ {a.msg}</p>)}
        </section>
      )}

      {isEnabled('JARVIS_MODO_CONFRONTO') && confrontoAtivo && (
        <section className="detalhe-secao">
          <h2 className="section-label">Modo confronto</h2>
          <p className="brief-confronto">"{confrontoAtivo.msg}"</p>
        </section>
      )}

      {sugestoes.length > 0 && (
        <section className="detalhe-secao">
          <h2 className="section-label">Jarvis sugere</h2>
          {sugestoes.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-sm)', padding: '6px 0' }}>
              <Lightbulb size={14} style={{ marginTop: 2, flexShrink: 0, color: 'var(--brand)' }} />
              <div>
                <p className="text-body" style={{ marginBottom: 4 }}>{s.mensagem}</p>
                <button type="button" className="link-acao" onClick={s.acao}>{s.labelAcao}</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="detalhe-secao">
        <h2 className="section-label">Hábitos esta semana</h2>
        {dados.habitos.length === 0 ? (
          <p className="text-micro">Nenhum hábito cadastrado.</p>
        ) : (
          dados.habitos.map((h) => {
            const feitos = dados.checks.filter((c) => c.habito_id === h.id).length
            return (
              <div key={h.id} className="detalhe-meta-grade" style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <span>{h.nome}</span>
                <span style={{ color: feitos >= h.frequencia_semanal ? 'var(--entregue)' : 'var(--text-dim)', fontWeight: feitos >= h.frequencia_semanal ? 600 : 400 }}>
                  {feitos}/{h.frequencia_semanal}
                </span>
              </div>
            )
          })
        )}
      </section>
    </div>
  )
}
