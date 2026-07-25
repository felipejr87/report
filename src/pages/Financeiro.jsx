import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { supabaseEspaco } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useIdioma } from '../hooks/useIdioma'
import { useTexto } from '../lib/i18n'
import HudPanel from '../components/hud/HudPanel'
import HudAbaControles from '../components/hud/HudAbaControles'
import HudTabBar from '../components/hud/HudTabBar'

// Conta começou a ser usada em jul/26 — extrato não mostra nada antes disso.
const MES_INICIO = '2026-07'

function hoje() { return new Date().toISOString().split('T')[0] }
function mesAtual() {
  const m = new Date().toISOString().slice(0, 7)
  return m < MES_INICIO ? MES_INICIO : m
}
function fmt(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0) }
function formatarMes(m, localeData) { return new Date(m + '-15').toLocaleDateString(localeData, { month: 'long', year: 'numeric' }) }

const VAZIO_LANC = { descricao: '', valor: '', categoria_id: '', conta: 'corrente', tipo: 'gasto', data: hoje() }

export default function Financeiro() {
  const { sessao, sair } = useAuth()
  const toast = useToast()
  const { idioma } = useIdioma()
  const t = useTexto()
  const localeData = idioma === 'en' ? 'en-US' : 'pt-BR'

  const [lancamentos, setLancamentos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [dividas, setDividas] = useState([])
  const [prefs, setPrefs] = useState({})
  const [mesSelecionado, setMesSelecionado] = useState(mesAtual())
  const [novoLanc, setNovoLanc] = useState(VAZIO_LANC)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [saldoVisivel, setSaldoVisivel] = useState(false)

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const carregar = useCallback(async () => {
    if (!cliente) return
    setCarregando(true)
    setErro('')

    const inicioMes = `${mesSelecionado}-01`
    const fimMesDate = new Date(inicioMes)
    fimMesDate.setMonth(fimMesDate.getMonth() + 1)
    const fimMes = fimMesDate.toISOString().split('T')[0]

    const [{ data: lncs, error: eL }, { data: cats, error: eC }, { data: divs }, { data: perfil }] = await Promise.all([
      cliente.from('lancamentos').select('*').gte('data', inicioMes).lt('data', fimMes).order('data', { ascending: false }),
      cliente.from('categorias_fin').select('*').order('id'),
      cliente.from('dividas').select('nome, saldo_atual, parcela').eq('ativa', true),
      cliente.from('jarvis_perfil').select('preferencias').eq('espaco_id', sessao.espaco.id).maybeSingle(),
    ])

    if (eL || eC) {
      setErro((eL || eC).message)
    } else {
      setLancamentos(lncs || [])
      setCategorias(cats || [])
      setDividas(divs || [])
      setPrefs(perfil?.preferencias || {})
    }
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token, mesSelecionado])

  useEffect(() => { carregar() }, [carregar])

  if (!sessao) return <Navigate to="/" replace />

  function categoriaDe(id) {
    return categorias.find((c) => c.id === id) || null
  }

  async function adicionarLancamento() {
    if (!novoLanc.descricao.trim() || !novoLanc.valor) return
    setEnviando(true)
    try {
      const valor = parseFloat(novoLanc.valor) * (novoLanc.tipo === 'receita' ? 1 : -1)
      const { error } = await cliente.from('lancamentos').insert({
        espaco_id: sessao.espaco.id,
        categoria_id: novoLanc.categoria_id || null,
        conta: novoLanc.conta,
        descricao: novoLanc.descricao.trim(),
        valor,
        data: novoLanc.data,
      })
      if (error) throw error
      setNovoLanc({ ...VAZIO_LANC, data: novoLanc.data, conta: novoLanc.conta })
      await carregar()
    } catch (err) {
      toast?.erro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  function mudarMes(delta) {
    const d = new Date(mesSelecionado + '-15')
    d.setMonth(d.getMonth() + delta)
    const novoMes = d.toISOString().slice(0, 7)
    if (novoMes < MES_INICIO) return
    setMesSelecionado(novoMes)
  }

  const lancCorrente = lancamentos.filter((l) => l.conta !== 'cartao')
  const lancCartao = lancamentos.filter((l) => l.conta === 'cartao')

  // Movimentação do mês selecionado (soma dos lançamentos) — só serve
  // pra acompanhar entrada/saída do período, NUNCA como saldo real da
  // conta (o cálculo por soma não reflete o saldo real — diagnóstico
  // do Axis: dava -R$1.678,98 contra o real -R$879,27 do extrato).
  const movimentoCorrente = lancCorrente.reduce((s, l) => s + l.valor, 0)
  const movimentoCartao = lancCartao.filter((l) => l.valor < 0).reduce((s, l) => s + Math.abs(l.valor), 0)

  const ehMesAtual = mesSelecionado === mesAtual()
  const temSaldoReal = ehMesAtual && typeof prefs.saldo_conta_corrente === 'number'
  const temFaturaReal = ehMesAtual && typeof prefs.fatura_aberta === 'number'

  const gastoPorCat = {}
  lancamentos.filter((l) => l.valor < 0).forEach((l) => {
    if (l.categoria_id != null) gastoPorCat[l.categoria_id] = (gastoPorCat[l.categoria_id] || 0) + Math.abs(l.valor)
  })
  const categoriasComTeto = categorias.filter((c) => c.teto_mensal)

  return (
    <div className="hud-aba-page">
      <div className="hud-grid-bg" />
      <div className="hud-scanlines" />
      <div className="hud-scanline-beam" />

      <div className="hud-aba-header">
        <span className="hud-aba-title">◤ {t('tab_financeiro').toUpperCase()}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="hud-mes-seletor">
            <button type="button" className="hud-mes-btn" onClick={() => mudarMes(-1)} disabled={mesSelecionado <= MES_INICIO} aria-label={t('mes_anterior')}>‹</button>
            <span className="hud-mes-txt">{formatarMes(mesSelecionado, localeData).toUpperCase()}</span>
            <button type="button" className="hud-mes-btn" onClick={() => mudarMes(1)} aria-label={t('proximo_mes')}>›</button>
          </div>
          <HudAbaControles onSair={sair} />
        </div>
      </div>

      {erro && <p role="alert" className="campo-erro">{erro}</p>}

      {carregando ? (
        <p className="hud-dim">{t('carregando')}</p>
      ) : (
        <div className="hud-aba-grid">
          <HudPanel className="hud-aba-panel">
            <div className="hud-panel-label">
              ◤ {ehMesAtual ? (idioma === 'en' ? 'REAL BALANCE' : 'SALDO REAL') : (idioma === 'en' ? 'MONTH MOVEMENT' : 'MOVIMENTAÇÃO DO MÊS')}
              {ehMesAtual && (
                <button type="button" className="fin-eye-btn" onClick={() => setSaldoVisivel((v) => !v)} aria-label={saldoVisivel ? 'Ocultar valores' : 'Revelar valores'}>
                  {saldoVisivel ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              )}
            </div>
            <div className="hud-fin-kpis-grid">
              <div>
                <div className="fin-kpi-label">{t('conta_corrente').toUpperCase()}</div>
                <div className={`fin-kpi-valor ${(temSaldoReal ? prefs.saldo_conta_corrente : movimentoCorrente) >= 0 ? 'fin-kpi--cyan' : 'fin-kpi--amber'}`}>
                  {temSaldoReal ? (saldoVisivel ? fmt(prefs.saldo_conta_corrente) : '••••••') : fmt(movimentoCorrente)}
                </div>
                {temSaldoReal && prefs.saldo_conta_corrente < 0 && saldoVisivel && <div className="fin-kpi-sub">{idioma === 'en' ? 'Negative — interest accruing' : 'Negativo — juros ativos'}</div>}
              </div>
              <div>
                <div className="fin-kpi-label">{temFaturaReal ? (idioma === 'en' ? 'OPEN INVOICE' : 'FATURA ABERTA') : t('fatura_cartao').toUpperCase()}</div>
                <div className="fin-kpi-valor fin-kpi--amber">
                  {temFaturaReal ? (saldoVisivel ? fmt(prefs.fatura_aberta) : '••••••') : fmt(movimentoCartao)}
                </div>
                {temFaturaReal && prefs.fatura_vencimento && (
                  <div className="fin-kpi-sub">{idioma === 'en' ? 'due' : 'vence'} {new Date(prefs.fatura_vencimento + 'T12:00').toLocaleDateString(localeData, { day: '2-digit', month: 'short' })}</div>
                )}
              </div>
            </div>
          </HudPanel>

          <HudPanel label={idioma === 'en' ? 'BY CATEGORY' : 'POR CATEGORIA'} className="hud-aba-panel">
            {categoriasComTeto.length === 0 ? (
              <span className="hud-dim">{idioma === 'en' ? 'No budgets set.' : 'Nenhum teto configurado.'}</span>
            ) : (
              categoriasComTeto.map((c) => {
                const g = gastoPorCat[c.id] || 0
                const pct = Math.min(100, Math.round((g / c.teto_mensal) * 100))
                const estourou = g > c.teto_mensal
                return (
                  <div key={c.id} className="hud-cat-linha">
                    <div className="hud-cat-topo">
                      <span className="hud-cat-nome">{c.icone} {c.nome}</span>
                      <span className={`hud-cat-valor ${estourou ? 'hud-cat-valor--alerta' : ''}`}>{fmt(g)} / {fmt(c.teto_mensal)}</span>
                    </div>
                    <div className="hud-progress-bg">
                      <div className={`hud-progress-fill ${estourou ? 'hud-progress-fill--amber' : ''}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </HudPanel>

          <HudPanel label="EXTRATO" className="hud-aba-panel hud-aba-panel--full">
            <ExtratoHud titulo={t('extrato_corrente')} itens={lancCorrente} categoriaDe={categoriaDe} localeData={localeData} textoVazio={t('nenhum_lancamento')} />
            <div style={{ height: 16 }} />
            <ExtratoHud titulo={t('extrato_cartao')} itens={lancCartao} categoriaDe={categoriaDe} localeData={localeData} textoVazio={t('nenhum_lancamento')} />
          </HudPanel>

          {dividas.length > 0 && (
            <HudPanel label={idioma === 'en' ? 'DEBTS' : 'DÍVIDAS'} className="hud-aba-panel" amber>
              {dividas.map((d, i) => (
                <div key={i} className="hud-divida-item">
                  <span className="hud-divida-nome">{d.nome}</span>
                  <span className="hud-divida-valor">{fmt(d.saldo_atual)} · {fmt(d.parcela)}/mês</span>
                </div>
              ))}
            </HudPanel>
          )}

          <HudPanel label={t('lancamento_rapido').toUpperCase()} className="hud-aba-panel hud-aba-panel--full">
            <div className="hud-lanc-form">
              <div className="hud-lanc-form-linha">
                <input className="hud-input" value={novoLanc.descricao} onChange={(e) => setNovoLanc((p) => ({ ...p, descricao: e.target.value }))} placeholder={t('descricao_campo')} />
                <input className="hud-input" type="number" value={novoLanc.valor} onChange={(e) => setNovoLanc((p) => ({ ...p, valor: e.target.value }))} placeholder={t('valor_campo')} />
              </div>
              <div className="hud-lanc-form-linha">
                <select value={novoLanc.conta} onChange={(e) => setNovoLanc((p) => ({ ...p, conta: e.target.value }))}>
                  <option value="corrente">{t('conta_corrente')}</option>
                  <option value="cartao">{t('cartao_credito')}</option>
                </select>
                <select value={novoLanc.tipo} onChange={(e) => setNovoLanc((p) => ({ ...p, tipo: e.target.value }))}>
                  <option value="gasto">{t('gasto')}</option>
                  <option value="receita">{t('receita')}</option>
                </select>
                <select value={novoLanc.categoria_id} onChange={(e) => setNovoLanc((p) => ({ ...p, categoria_id: e.target.value }))}>
                  <option value="">{t('sem_categoria')}</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
                </select>
              </div>
              <button type="button" className="hud-btn-nova" style={{ alignSelf: 'flex-start' }} onClick={adicionarLancamento} disabled={!novoLanc.descricao.trim() || !novoLanc.valor || enviando}>
                {enviando ? t('adicionando').toUpperCase() : `+ ${t('adicionar').toUpperCase()}`}
              </button>
            </div>
          </HudPanel>
        </div>
      )}

      <HudTabBar />
    </div>
  )
}

function ExtratoHud({ titulo, itens, categoriaDe, localeData, textoVazio }) {
  return (
    <>
      <div className="fin-extrato-label">{titulo.toUpperCase()}</div>
      {itens.length === 0 ? (
        <span className="hud-dim">{textoVazio}</span>
      ) : (
        <div className="hud-extrato-lista">
          {itens.map((l) => {
            const cat = categoriaDe(l.categoria_id)
            return (
              <div key={l.id} className="fin-extrato-item">
                <span className="fin-extrato-info">
                  <span className="fin-extrato-data">{new Date(l.data + 'T12:00').toLocaleDateString(localeData, { day: '2-digit', month: '2-digit' })}</span>
                  {l.descricao}
                  {cat && <span style={{ marginLeft: 6 }} title={cat.nome}>{cat.icone}</span>}
                </span>
                <span className={`fin-extrato-valor ${l.valor > 0 ? 'fin-val--pos' : ''}`}>
                  {l.valor > 0 ? '+' : '−'}{fmt(Math.abs(l.valor))}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
