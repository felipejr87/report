import { useState, useEffect, useCallback } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// NOTA: o protótipo original assumia uma tabela `categorias` e
// `categoria_id === 18` pra identificar lançamentos de cartão — essa
// tabela não existe (é `categorias_fin`) e lançamentos são separados
// por conta corrente/cartão via `lancamentos.conta` ('corrente' |
// 'cartao'), igual já faz Financeiro.jsx e o assistente-jarvis.
//
// Saldo/fatura NÃO vêm mais da soma dos lançamentos — essa soma não
// reflete o saldo real da conta (diagnóstico do Axis: dava -R$1.678,98
// contra o real -R$879,27 do extrato Itaú). Fonte agora é
// jarvis_perfil.preferencias, atualizado manualmente com o dado real.
export default function PainelFinanceiro({ cliente, espacoId, idioma = 'pt', versao = 0 }) {
  const [dados, setDados] = useState(null)
  const [saldoVisivel, setSaldoVisivel] = useState(false)

  const carregar = useCallback(async () => {
    if (!cliente) return
    const mes = new Date().toISOString().slice(0, 7)
    const [{ data: lncs }, { data: dividas }, { data: perfil }] = await Promise.all([
      cliente.from('lancamentos').select('valor, descricao, data, conta').gte('data', `${mes}-01`).order('data', { ascending: false }),
      cliente.from('dividas').select('nome, saldo_atual, parcela').eq('ativa', true),
      cliente.from('jarvis_perfil').select('preferencias').eq('espaco_id', espacoId).maybeSingle(),
    ])

    const lista = lncs || []
    const prefs = perfil?.preferencias || {}
    const extrato = lista.slice(0, 5)
    const barras = calcularBarrasSemanas(lista)

    setDados({
      saldo: typeof prefs.saldo_conta_corrente === 'number' ? prefs.saldo_conta_corrente : null,
      fatura: typeof prefs.fatura_aberta === 'number' ? prefs.fatura_aberta : null,
      faturaVenc: prefs.fatura_vencimento || null,
      extrato,
      dividas: dividas || [],
      barras,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, espacoId])

  // `versao` sobe a cada lançamento/dívida confirmados via chat — sem
  // isso este painel só busca dado uma vez no mount e fica desatualizado
  // depois de uma ação do Jarvis na mesma sessão.
  useEffect(() => { carregar() }, [carregar, versao])

  function calcularBarrasSemanas(lncs) {
    const semanas = Array(7).fill(0)
    lncs.filter((l) => l.valor < 0).forEach((l) => {
      const dias = Math.floor((Date.now() - new Date(l.data).getTime()) / 86400000)
      const semana = Math.min(6, Math.max(0, Math.floor(dias / 7)))
      semanas[6 - semana] += Math.abs(l.valor)
    })
    const max = Math.max(...semanas, 1)
    return semanas.map((v, i) => ({ pct: (v / max) * 100, atual: i === 6 }))
  }

  function fmt(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
  }

  const TXT = idioma === 'en'
    ? { carregando: 'LOADING...', extrato: 'STATEMENT', alerta: 'NEGATIVE BALANCE · INTEREST ACCRUING', contaCorrente: 'CHECKING ACCOUNT', faturaAberta: 'OPEN INVOICE', vence: 'due', negativo: 'Account negative — interest accruing', naoDisponivel: 'not set' }
    : { carregando: 'CARREGANDO...', extrato: 'EXTRATO', alerta: 'CONTA NEGATIVA · JUROS ATIVOS', contaCorrente: 'CONTA CORRENTE', faturaAberta: 'FATURA ABERTA', vence: 'vence', negativo: 'Conta no negativo — juros ativos', naoDisponivel: 'não informado' }

  if (!dados) return <div className="hud-panel-label">{TXT.carregando}</div>

  const mesNome = new Date().toLocaleDateString(idioma === 'en' ? 'en-US' : 'pt-BR', { month: 'long' }).toUpperCase()
  const temSaldo = dados.saldo != null
  const temFatura = dados.fatura != null

  return (
    <>
      <div className="hud-panel-label">◤ FINANCEIRO · {mesNome}</div>

      <div className="fin-kpis">
        <div>
          <div className="fin-kpi-label">
            {TXT.contaCorrente}
            <button type="button" className="fin-eye-btn" onClick={() => setSaldoVisivel((v) => !v)} aria-label={saldoVisivel ? 'Ocultar valores' : 'Revelar valores'}>
              {saldoVisivel ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </div>
          <div className={`fin-kpi-valor ${(dados.saldo ?? 0) >= 0 ? 'fin-kpi--cyan' : 'fin-kpi--amber'}`}>
            {!temSaldo ? TXT.naoDisponivel : saldoVisivel ? fmt(dados.saldo) : '••••••'}
          </div>
          {temSaldo && dados.saldo < 0 && saldoVisivel && <div className="fin-kpi-sub">{TXT.negativo}</div>}
        </div>
        <div>
          <div className="fin-kpi-label">
            {TXT.faturaAberta}
            <button type="button" className="fin-eye-btn" onClick={() => setSaldoVisivel((v) => !v)} aria-label={saldoVisivel ? 'Ocultar valores' : 'Revelar valores'}>
              {saldoVisivel ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          </div>
          <div className="fin-kpi-valor fin-kpi--amber">{!temFatura ? TXT.naoDisponivel : saldoVisivel ? fmt(dados.fatura) : '••••••'}</div>
          {dados.faturaVenc && (
            <div className="fin-kpi-sub">{TXT.vence} {new Date(dados.faturaVenc + 'T12:00').toLocaleDateString(idioma === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: 'short' })}</div>
          )}
        </div>
      </div>

      <div className="fin-chart">
        {dados.barras.map((b, i) => (
          <div key={i} className={`fin-bar ${b.atual ? 'fin-bar--atual' : ''}`} style={{ height: `${Math.max(8, b.pct)}%` }} />
        ))}
      </div>

      <div className="fin-extrato">
        <div className="fin-extrato-label">{TXT.extrato}</div>
        {dados.extrato.length === 0 && <span className="hud-dim">—</span>}
        {dados.extrato.map((l, i) => (
          <div key={i} className="fin-extrato-item">
            <span className="fin-extrato-info">
              <span className="fin-extrato-data">
                {new Date(l.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
              {l.descricao.slice(0, 28)}
            </span>
            <span className={`fin-extrato-valor ${l.valor > 0 ? 'fin-val--pos' : ''}`}>
              {l.valor > 0 ? '+' : '−'}{fmt(Math.abs(l.valor))}
            </span>
          </div>
        ))}
      </div>

      {temSaldo && dados.saldo < 0 && saldoVisivel && (
        <div className="fin-alerta">
          <span className="fin-alerta-dot" />
          {TXT.alerta}
        </div>
      )}
    </>
  )
}
