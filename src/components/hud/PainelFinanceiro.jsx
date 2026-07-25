import { useState, useEffect, useCallback } from 'react'

// NOTA: o protótipo original assumia uma tabela `categorias` e
// `categoria_id === 18` pra identificar lançamentos de cartão — essa
// tabela não existe (é `categorias_fin`) e lançamentos são separados
// por conta corrente/cartão via `lancamentos.conta` ('corrente' |
// 'cartao'), igual já faz Financeiro.jsx e o assistente-jarvis.
export default function PainelFinanceiro({ cliente, idioma = 'pt' }) {
  const [dados, setDados] = useState(null)

  const carregar = useCallback(async () => {
    if (!cliente) return
    const mes = new Date().toISOString().slice(0, 7)
    const [{ data: lncs }, { data: dividas }] = await Promise.all([
      cliente.from('lancamentos').select('valor, descricao, data, conta').gte('data', `${mes}-01`).order('data', { ascending: false }),
      cliente.from('dividas').select('nome, saldo_atual, parcela').eq('ativa', true),
    ])

    const lista = lncs || []
    const lancCorrente = lista.filter((l) => l.conta !== 'cartao')
    const lancCartao = lista.filter((l) => l.conta === 'cartao')
    const saldo = lancCorrente.reduce((s, l) => s + l.valor, 0)
    const fatura = lancCartao.filter((l) => l.valor < 0).reduce((s, l) => s + Math.abs(l.valor), 0)
    const extrato = lista.slice(0, 5)
    const barras = calcularBarrasSemanas(lista)

    setDados({ saldo, fatura, extrato, dividas: dividas || [], barras })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente])

  useEffect(() => { carregar() }, [carregar])

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
    ? { carregando: 'LOADING...', extrato: 'STATEMENT', alerta: 'NEGATIVE BALANCE · INTEREST ACCRUING' }
    : { carregando: 'CARREGANDO...', extrato: 'EXTRATO', alerta: 'CONTA NEGATIVA · JUROS ATIVOS' }

  if (!dados) return <div className="hud-panel-label">{TXT.carregando}</div>

  const mesNome = new Date().toLocaleDateString(idioma === 'en' ? 'en-US' : 'pt-BR', { month: 'long' }).toUpperCase()

  return (
    <>
      <div className="hud-panel-label">◤ FINANCEIRO · {mesNome}</div>

      <div className="fin-kpis">
        <div>
          <div className="fin-kpi-label">CONTA CORRENTE</div>
          <div className={`fin-kpi-valor ${dados.saldo >= 0 ? 'fin-kpi--cyan' : 'fin-kpi--amber'}`}>{fmt(dados.saldo)}</div>
        </div>
        <div>
          <div className="fin-kpi-label">FATURA CARTÃO</div>
          <div className="fin-kpi-valor fin-kpi--amber">{fmt(dados.fatura)}</div>
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

      {dados.saldo < 0 && (
        <div className="fin-alerta">
          <span className="fin-alerta-dot" />
          {TXT.alerta}
        </div>
      )}
    </>
  )
}
