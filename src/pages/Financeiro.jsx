import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { Wallet, CreditCard } from 'lucide-react'
import { supabaseEspaco } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useIdioma } from '../hooks/useIdioma'
import { useTexto } from '../lib/i18n'
import Header from '../components/Header'
import TabBar from '../components/jarvis/TabBar'

// Conta começou a ser usada em jul/26 — extrato não mostra nada antes disso.
const MES_INICIO = '2026-07'

function hoje() { return new Date().toISOString().split('T')[0] }
function mesAtual() {
  const m = new Date().toISOString().slice(0, 7)
  return m < MES_INICIO ? MES_INICIO : m
}
// Formato de moeda fica em pt-BR (R$ 1.234,56) independente do idioma
// da UI — é a notação real do real, não uma questão de tradução.
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
  const [mesSelecionado, setMesSelecionado] = useState(mesAtual())
  const [novoLanc, setNovoLanc] = useState(VAZIO_LANC)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const carregar = useCallback(async () => {
    if (!cliente) return
    setCarregando(true)
    setErro('')

    const inicioMes = `${mesSelecionado}-01`
    const fimMesDate = new Date(inicioMes)
    fimMesDate.setMonth(fimMesDate.getMonth() + 1)
    const fimMes = fimMesDate.toISOString().split('T')[0]

    const [{ data: lncs, error: eL }, { data: cats, error: eC }] = await Promise.all([
      cliente.from('lancamentos').select('*').gte('data', inicioMes).lt('data', fimMes).order('data', { ascending: false }),
      cliente.from('categorias_fin').select('*').order('id'),
    ])

    if (eL || eC) {
      setErro((eL || eC).message)
    } else {
      setLancamentos(lncs || [])
      setCategorias(cats || [])
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

  const saldoCorrente = lancCorrente.reduce((s, l) => s + l.valor, 0)
  const faturaCartao = lancCartao.filter((l) => l.valor < 0).reduce((s, l) => s + Math.abs(l.valor), 0)

  const isJarvis = sessao.espaco.jarvis_enabled === true

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-md)', paddingBottom: isJarvis ? 76 : 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <Header espaco={sessao.espaco} onSair={sair} />

      <div className="mes-selector">
        <button type="button" onClick={() => mudarMes(-1)} disabled={mesSelecionado <= MES_INICIO} aria-label={t('mes_anterior')}>‹</button>
        <span>{formatarMes(mesSelecionado, localeData)}</span>
        <button type="button" onClick={() => mudarMes(1)} aria-label={t('proximo_mes')}>›</button>
      </div>

      {erro && <p role="alert" className="campo-erro">{erro}</p>}

      {carregando ? (
        <p className="text-body" style={{ color: 'var(--text-dim)' }}>{t('carregando')}</p>
      ) : (
        <>
          <div className="campo-grade-2">
            <div className="jarvis-kpi" style={{ borderBottom: 'none', padding: 'var(--space-sm) 0' }}>
              <span className="text-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Wallet size={12} /> {t('conta_corrente')}</span>
              <span className="jarvis-kpi-valor" style={{ fontSize: 24 }} data-zero={saldoCorrente < 0}>{fmt(saldoCorrente)}</span>
            </div>
            <div className="jarvis-kpi" style={{ borderBottom: 'none', padding: 'var(--space-sm) 0' }}>
              <span className="text-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CreditCard size={12} /> {t('fatura_cartao')}</span>
              <span className="jarvis-kpi-valor" style={{ fontSize: 24 }}>{fmt(faturaCartao)}</span>
            </div>
          </div>

          <ExtratoConta
            titulo={t('extrato_corrente')}
            Icone={Wallet}
            itens={lancCorrente}
            categoriaDe={categoriaDe}
            localeData={localeData}
            textoVazio={t('nenhum_lancamento')}
          />

          <ExtratoConta
            titulo={t('extrato_cartao')}
            Icone={CreditCard}
            itens={lancCartao}
            categoriaDe={categoriaDe}
            localeData={localeData}
            textoVazio={t('nenhum_lancamento')}
          />

          <section className="detalhe-secao detalhe-acoes">
            <h2 className="section-label">{t('lancamento_rapido')}</h2>
            <div className="campo-grade-2">
              <label className="campo">
                <span className="text-label">{t('descricao_campo')}</span>
                <input value={novoLanc.descricao} onChange={(e) => setNovoLanc((p) => ({ ...p, descricao: e.target.value }))} />
              </label>
              <label className="campo">
                <span className="text-label">{t('valor_campo')}</span>
                <input type="number" value={novoLanc.valor} onChange={(e) => setNovoLanc((p) => ({ ...p, valor: e.target.value }))} />
              </label>
            </div>
            <div className="campo-grade-2">
              <label className="campo">
                <span className="text-label">{t('conta_select')}</span>
                <select value={novoLanc.conta} onChange={(e) => setNovoLanc((p) => ({ ...p, conta: e.target.value }))}>
                  <option value="corrente">{t('conta_corrente')}</option>
                  <option value="cartao">{t('cartao_credito')}</option>
                </select>
              </label>
              <label className="campo">
                <span className="text-label">{t('tipo_campo')}</span>
                <select value={novoLanc.tipo} onChange={(e) => setNovoLanc((p) => ({ ...p, tipo: e.target.value }))}>
                  <option value="gasto">{t('gasto')}</option>
                  <option value="receita">{t('receita')}</option>
                </select>
              </label>
            </div>
            <label className="campo">
              <span className="text-label">{t('categoria_opcional')}</span>
              <select value={novoLanc.categoria_id} onChange={(e) => setNovoLanc((p) => ({ ...p, categoria_id: e.target.value }))}>
                <option value="">{t('sem_categoria')}</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
              </select>
            </label>
            <div className="modal-rodape" style={{ marginTop: 0, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primario" onClick={adicionarLancamento} disabled={!novoLanc.descricao.trim() || !novoLanc.valor || enviando}>
                {enviando ? t('adicionando') : t('adicionar')}
              </button>
            </div>
          </section>
        </>
      )}

      {isJarvis && <TabBar />}
    </div>
  )
}

function ExtratoConta({ titulo, Icone, itens, categoriaDe, localeData, textoVazio }) {
  return (
    <section className="detalhe-secao">
      <h2 className="section-label">{titulo}</h2>
      {itens.length === 0 ? (
        <p className="text-micro">{textoVazio}</p>
      ) : (
        <div className="lista">
          {itens.map((l) => {
            const cat = categoriaDe(l.categoria_id)
            return (
              <div key={l.id} className="item-atividade" style={{ cursor: 'default', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <Icone size={12} color="var(--text-dim)" style={{ flexShrink: 0 }} />
                  <span className="text-micro" style={{ marginRight: 4, flexShrink: 0 }}>
                    {new Date(l.data + 'T12:00').toLocaleDateString(localeData, { day: '2-digit', month: '2-digit' })}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.descricao}</span>
                  {cat && (
                    <span className="text-micro" style={{ flexShrink: 0 }} title={cat.nome}>
                      {cat.icone}
                    </span>
                  )}
                </span>
                <span style={{ color: l.valor > 0 ? 'var(--entregue)' : 'var(--text)', flexShrink: 0, marginLeft: 'var(--space-sm)' }}>
                  {l.valor > 0 ? '+' : ''}{fmt(l.valor)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
