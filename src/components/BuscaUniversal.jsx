import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Mic, Square } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabaseEspaco } from '../lib/supabase'
import { useVoz } from '../hooks/useVoz'
import { ROTULO_FASE_PROJETO } from './ChipFase'

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

export default function BuscaUniversal() {
  const { sessao } = useAuth()
  const navigate = useNavigate()
  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const [query, setQuery] = useState('')
  const [aberta, setAberta] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [resultados, setResultados] = useState(null)
  const timerRef = useRef(null)

  const buscar = useCallback(async (q) => {
    if (!cliente || !q || q.trim().length < 2) { setResultados(null); return }
    setCarregando(true)
    const { data, error } = await cliente.rpc('buscar_espaco', {
      p_espaco_id: sessao.espaco.id,
      p_query: q.trim(),
    })
    setResultados(error ? null : data)
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao?.token])

  function onChangeQuery(q) {
    setQuery(q)
    setAberta(true)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => buscar(q), 350)
  }

  const { iniciarEscuta, pararEscuta, escutando, suportado } = useVoz({
    onTranscricao: (texto) => {
      setQuery(texto)
      setAberta(true)
      buscar(texto)
    },
    onErro: () => {},
  })

  function fechar() {
    setAberta(false)
    setQuery('')
    setResultados(null)
  }

  function irPara(item) {
    fechar()
    if (item.tipo === 'projeto') navigate(`/projetos/projeto/${item.id}`)
    if (item.tipo === 'atividade') navigate(`/projetos/atividade/${item.id}`)
    if (item.tipo === 'objetivo') navigate('/vida')
    if (item.tipo === 'divida') navigate('/financeiro')
    if (item.tipo === 'lancamento') navigate('/financeiro')
    if (item.tipo === 'movimento') navigate(`/projetos/atividade/${item.atividade_id}`)
  }

  if (!sessao) return null

  const total = resultados
    ? ['projetos', 'atividades', 'objetivos', 'dividas', 'lancamentos', 'movimentos']
      .reduce((s, k) => s + (resultados[k]?.length || 0), 0)
    : 0

  return (
    <div className="busca-universal">
      <label className="campo-busca">
        <Search size={16} color="var(--text-dim)" />
        <input
          type="search"
          placeholder={escutando ? 'Ouvindo...' : 'Buscar em tudo...'}
          value={query}
          onChange={(e) => onChangeQuery(e.target.value)}
          onFocus={() => query && setAberta(true)}
          onKeyDown={(e) => e.key === 'Escape' && fechar()}
        />
        {query && (
          <button type="button" className="modal-fechar" onClick={fechar} aria-label="Limpar busca">
            <X size={14} />
          </button>
        )}
        {suportado && (
          <button
            type="button"
            className="modal-fechar"
            data-escutando={escutando}
            onClick={escutando ? pararEscuta : iniciarEscuta}
            aria-label={escutando ? 'Parar busca por voz' : 'Buscar por voz'}
            title={escutando ? 'Parar' : 'Buscar por voz'}
            style={escutando ? { color: 'var(--atencao)' } : undefined}
          >
            {escutando ? <Square size={14} /> : <Mic size={14} />}
          </button>
        )}
      </label>

      {aberta && query.trim().length >= 2 && (
        <>
          <div className="busca-overlay" onClick={fechar} />
          <div className="busca-resultados">
            {carregando && <p className="text-micro" style={{ padding: 'var(--space-md)' }}>Buscando...</p>}

            {!carregando && resultados && total === 0 && (
              <p className="text-micro" style={{ padding: 'var(--space-md)' }}>Nenhum resultado para "{query}"</p>
            )}

            {!carregando && resultados && total > 0 && (
              <>
                {resultados.projetos?.length > 0 && (
                  <GrupoResultado titulo="Projetos">
                    {resultados.projetos.map((item) => (
                      <ItemResultado key={item.id} onClick={() => irPara(item)}>
                        <span className="res-nome">{item.nome}</span>
                        <span className="res-meta">{ROTULO_FASE_PROJETO[item.fase] || item.fase}</span>
                      </ItemResultado>
                    ))}
                  </GrupoResultado>
                )}

                {resultados.atividades?.length > 0 && (
                  <GrupoResultado titulo="Atividades">
                    {resultados.atividades.map((item) => (
                      <ItemResultado key={item.id} onClick={() => irPara(item)}>
                        <span className="res-nome">{item.nome}</span>
                        {item.resumo && <span className="res-detalhe">{item.resumo}</span>}
                      </ItemResultado>
                    ))}
                  </GrupoResultado>
                )}

                {resultados.dividas?.length > 0 && (
                  <GrupoResultado titulo="Dívidas">
                    {resultados.dividas.map((item) => (
                      <ItemResultado key={item.id} onClick={() => irPara(item)}>
                        <span className="res-nome">{item.nome}</span>
                        <span className="res-meta">
                          {fmt(item.saldo_atual)}{item.parcela ? ` · parcela ${fmt(item.parcela)}` : ''}
                        </span>
                      </ItemResultado>
                    ))}
                  </GrupoResultado>
                )}

                {resultados.objetivos?.length > 0 && (
                  <GrupoResultado titulo="Objetivos">
                    {resultados.objetivos.map((item) => (
                      <ItemResultado key={item.id} onClick={() => irPara(item)}>
                        <span className="res-nome">{item.descricao}</span>
                        {item.prazo && (
                          <span className="res-meta">até {new Date(item.prazo).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}</span>
                        )}
                      </ItemResultado>
                    ))}
                  </GrupoResultado>
                )}

                {resultados.lancamentos?.length > 0 && (
                  <GrupoResultado titulo="Lançamentos">
                    {resultados.lancamentos.map((item) => (
                      <ItemResultado key={item.id} onClick={() => irPara(item)}>
                        <span className="res-nome">{item.descricao}</span>
                        <span className="res-meta">
                          {item.valor > 0 ? '+' : ''}{fmt(item.valor)} · {new Date(item.data + 'T12:00').toLocaleDateString('pt-BR')}
                        </span>
                      </ItemResultado>
                    ))}
                  </GrupoResultado>
                )}

                {resultados.movimentos?.length > 0 && (
                  <GrupoResultado titulo="Histórico de passos">
                    {resultados.movimentos.map((item) => (
                      <ItemResultado key={item.id} onClick={() => irPara(item)}>
                        <span className="res-nome">{item.texto}</span>
                        <span className="res-meta">{item.status === 'concluido' ? 'concluído' : 'pendente'}</span>
                      </ItemResultado>
                    ))}
                  </GrupoResultado>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function GrupoResultado({ titulo, children }) {
  return (
    <div className="res-grupo">
      <div className="section-label" style={{ padding: '10px 14px 4px' }}>{titulo}</div>
      {children}
    </div>
  )
}

function ItemResultado({ children, onClick }) {
  return (
    <div
      className="res-item"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
    >
      {children}
    </div>
  )
}
