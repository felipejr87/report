import { useEffect, useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { supabaseEspaco } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import Header from '../../components/Header'
import { isEnabled } from '../../lib/features'

function hoje() { return new Date().toISOString().split('T')[0] }
function mesAtual() { return new Date().toISOString().slice(0, 7) }
function fmt(v) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0) }
function formatarMes(m) { return new Date(m + '-15').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }

const VAZIO_LANC = { descricao: '', valor: '', categoria_id: '', tipo: 'gasto', data: hoje() }

export default function Financeiro() {
  const { sessao, sair } = useAuth()
  const toast = useToast()

  const [lancamentos, setLancamentos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [dividas, setDividas] = useState([])
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

    const [{ data: lncs, error: eL }, { data: cats, error: eC }, { data: divs, error: eD }] = await Promise.all([
      cliente.from('lancamentos').select('*').gte('data', inicioMes).lt('data', fimMes).order('data', { ascending: false }),
      cliente.from('categorias_fin').select('*').order('id'),
      cliente.from('dividas').select('*').eq('ativa', true),
    ])

    if (eL || eC || eD) {
      setErro((eL || eC || eD).message)
    } else {
      setLancamentos(lncs || [])
      setCategorias(cats || [])
      setDividas(divs || [])
    }
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token, mesSelecionado])

  useEffect(() => { carregar() }, [carregar])

  if (!sessao) return <Navigate to="/" replace />

  async function adicionarLancamento() {
    if (!novoLanc.descricao.trim() || !novoLanc.valor) return
    setEnviando(true)
    try {
      const valor = parseFloat(novoLanc.valor) * (novoLanc.tipo === 'receita' ? 1 : -1)
      const { error } = await cliente.from('lancamentos').insert({
        espaco_id: sessao.espaco.id,
        categoria_id: novoLanc.categoria_id || null,
        descricao: novoLanc.descricao.trim(),
        valor,
        data: novoLanc.data,
      })
      if (error) throw error
      setNovoLanc({ ...VAZIO_LANC, data: novoLanc.data })
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
    setMesSelecionado(d.toISOString().slice(0, 7))
  }

  const gastoPorCat = {}
  lancamentos.filter((l) => l.valor < 0).forEach((l) => {
    if (l.categoria_id) gastoPorCat[l.categoria_id] = (gastoPorCat[l.categoria_id] || 0) + Math.abs(l.valor)
  })

  const totalReceita = lancamentos.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0)
  const totalGasto = lancamentos.filter((l) => l.valor < 0).reduce((s, l) => s + Math.abs(l.valor), 0)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <Header espaco={sessao.espaco} onSair={sair} />

      <div className="mes-selector">
        <button type="button" onClick={() => mudarMes(-1)} aria-label="Mês anterior">‹</button>
        <span>{formatarMes(mesSelecionado)}</span>
        <button type="button" onClick={() => mudarMes(1)} aria-label="Próximo mês">›</button>
      </div>

      {erro && <p role="alert" className="campo-erro">{erro}</p>}

      {carregando ? (
        <p className="text-body" style={{ color: 'var(--text-dim)' }}>Carregando...</p>
      ) : (
        <>
          <div className="detalhe-meta-grade" style={{ flexDirection: 'row', gap: 'var(--space-lg)' }}>
            <span><span className="meta-label">Receita</span> {fmt(totalReceita)}</span>
            <span><span className="meta-label">Gastos</span> {fmt(totalGasto)}</span>
            <span><span className="meta-label">Saldo</span> {fmt(totalReceita - totalGasto)}</span>
          </div>

          <section className="detalhe-secao">
            <h2 className="section-label">Por categoria</h2>
            {categorias.filter((c) => c.teto_mensal).map((cat) => {
              const gasto = gastoPorCat[cat.id] || 0
              const pct = cat.teto_mensal ? Math.min(100, (gasto / cat.teto_mensal) * 100) : 0
              const alerta = pct >= 100 ? 'estourado' : pct >= 80 ? 'atencao' : 'ok'
              return (
                <div key={cat.id} className="linha-categoria">
                  <span aria-hidden="true">{cat.icone}</span>
                  <span>{cat.nome}</span>
                  <div className="barra-fundo">
                    <div className="barra-preenchimento" data-alerta={alerta} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-micro">{fmt(gasto)} / {fmt(cat.teto_mensal)}</span>
                </div>
              )
            })}
          </section>

          {isEnabled('FIN_DIVIDAS') && dividas.length > 0 && (
            <section className="detalhe-secao">
              <h2 className="section-label">Dívidas</h2>
              {dividas.map((d) => (
                <div key={d.id} className="detalhe-meta-grade" style={{ flexDirection: 'row', gap: 'var(--space-md)' }}>
                  <span>{d.nome}</span>
                  <span>{fmt(d.saldo_atual)}</span>
                  {d.parcela != null && <span className="text-micro">parcela {fmt(d.parcela)}</span>}
                  {d.meta_quitacao && <span className="text-micro">quitação {formatarMes(d.meta_quitacao.slice(0, 7))}</span>}
                </div>
              ))}
            </section>
          )}

          <section className="detalhe-secao">
            <h2 className="section-label">Lançamentos</h2>
            {lancamentos.length === 0 ? (
              <p className="text-micro">Nenhum lançamento neste mês.</p>
            ) : (
              <div className="lista">
                {lancamentos.map((l) => (
                  <div key={l.id} className="item-atividade" style={{ cursor: 'default', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      <span className="text-micro" style={{ marginRight: 8 }}>
                        {new Date(l.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                      {l.descricao}
                    </span>
                    <span style={{ color: l.valor > 0 ? 'var(--entregue)' : 'var(--text)' }}>
                      {l.valor > 0 ? '+' : ''}{fmt(l.valor)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="detalhe-secao detalhe-acoes">
            <h2 className="section-label">Lançamento rápido</h2>
            <div className="campo-grade-2">
              <label className="campo">
                <span className="text-label">Descrição</span>
                <input value={novoLanc.descricao} onChange={(e) => setNovoLanc((p) => ({ ...p, descricao: e.target.value }))} />
              </label>
              <label className="campo">
                <span className="text-label">Valor (R$)</span>
                <input type="number" value={novoLanc.valor} onChange={(e) => setNovoLanc((p) => ({ ...p, valor: e.target.value }))} />
              </label>
            </div>
            <div className="campo-grade-2">
              <label className="campo">
                <span className="text-label">Categoria</span>
                <select value={novoLanc.categoria_id} onChange={(e) => setNovoLanc((p) => ({ ...p, categoria_id: e.target.value }))}>
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
                </select>
              </label>
              <label className="campo">
                <span className="text-label">Tipo</span>
                <select value={novoLanc.tipo} onChange={(e) => setNovoLanc((p) => ({ ...p, tipo: e.target.value }))}>
                  <option value="gasto">Gasto</option>
                  <option value="receita">Receita</option>
                </select>
              </label>
            </div>
            <div className="modal-rodape" style={{ marginTop: 0, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primario" onClick={adicionarLancamento} disabled={!novoLanc.descricao.trim() || !novoLanc.valor || enviando}>
                {enviando ? 'Adicionando...' : 'Adicionar'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
