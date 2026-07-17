import { useState } from 'react'
import { X, Flame, ChevronDown, ChevronUp, Trash2, AlertTriangle } from 'lucide-react'

const VAZIO = { nome: '', data_entrega: '', quente: false, objetivo: '', okr: '', ganho: '' }

export default function FormProjeto({ inicial, totalAtividades = 0, onSalvar, onExcluir, onCancelar }) {
  const [dados, setDados] = useState(inicial ? { ...VAZIO, ...inicial } : VAZIO)
  const [detalhesAbertos, setDetalhesAbertos] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [textoConfirmacao, setTextoConfirmacao] = useState('')
  const [excluindo, setExcluindo] = useState(false)

  function atualizar(campo, valor) {
    setDados((d) => ({ ...d, [campo]: valor }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')

    if (!dados.nome.trim()) {
      setErro('Nome é obrigatório.')
      return
    }

    setEnviando(true)
    try {
      await onSalvar({
        ...dados,
        data_entrega: dados.data_entrega === '' ? null : dados.data_entrega,
      })
    } catch (err) {
      setErro(err.message || 'Erro ao salvar.')
    } finally {
      setEnviando(false)
    }
  }

  const nomeConfere = textoConfirmacao.trim().toLowerCase() === dados.nome.trim().toLowerCase()

  async function handleExcluirDefinitivo() {
    if (!nomeConfere) return
    setExcluindo(true)
    try {
      await onExcluir()
    } catch (err) {
      setErro(err.message || 'Erro ao excluir.')
      setExcluindo(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div className="modal-cabecalho">
        <h2 className="text-titulo">{inicial ? 'Editar projeto' : 'Novo projeto'}</h2>
        <button type="button" className="modal-fechar" onClick={onCancelar} aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      {erro && <p role="alert" className="campo-erro">{erro}</p>}

      <label className="campo">
        <span className="text-label">Nome *</span>
        <input value={dados.nome} onChange={(e) => atualizar('nome', e.target.value)} autoFocus required />
      </label>

      <label className="campo">
        <span className="text-label">Data de entrega</span>
        <input type="date" value={dados.data_entrega} onChange={(e) => atualizar('data_entrega', e.target.value)} />
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={dados.quente}
          onChange={(e) => atualizar('quente', e.target.checked)}
          style={{ width: 14, height: 14 }}
        />
        <span className="text-body" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Flame size={14} />
          Quente (observado pela gerência)
        </span>
      </label>

      <button
        type="button"
        className="link-acao toggle-detalhes"
        onClick={() => setDetalhesAbertos((v) => !v)}
        aria-expanded={detalhesAbertos}
      >
        {detalhesAbertos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Detalhes do épico
      </button>

      {detalhesAbertos && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <label className="campo">
            <span className="text-label">Objetivo</span>
            <textarea rows={2} value={dados.objetivo} onChange={(e) => atualizar('objetivo', e.target.value)} />
          </label>
          <label className="campo">
            <span className="text-label">OKR</span>
            <input value={dados.okr} onChange={(e) => atualizar('okr', e.target.value)} />
          </label>
          <label className="campo">
            <span className="text-label">Ganho</span>
            <input value={dados.ganho} onChange={(e) => atualizar('ganho', e.target.value)} />
          </label>
        </div>
      )}

      {confirmandoExclusao ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', borderTop: '1px solid var(--line)', paddingTop: 'var(--space-md)' }}>
          <p className="text-body" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--atencao)' }}>
            <AlertTriangle size={16} />
            {totalAtividades > 0
              ? `Essa ação apaga o projeto E as ${totalAtividades} atividade${totalAtividades > 1 ? 's' : ''} dentro dele. Não pode ser desfeita.`
              : 'Essa ação não pode ser desfeita.'}
          </p>
          <label className="campo">
            <span className="text-label">Digite &quot;{dados.nome}&quot; pra confirmar</span>
            <input value={textoConfirmacao} onChange={(e) => setTextoConfirmacao(e.target.value)} autoFocus />
          </label>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => { setConfirmandoExclusao(false); setTextoConfirmacao('') }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-perigo"
              onClick={handleExcluirDefinitivo}
              disabled={!nomeConfere || excluindo}
            >
              {excluindo ? 'Excluindo...' : 'Excluir definitivamente'}
            </button>
          </div>
        </div>
      ) : (
        <div className="modal-rodape">
          {inicial?.id ? (
            <button type="button" className="btn-perigo" onClick={() => setConfirmandoExclusao(true)}>
              <Trash2 size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
              Excluir
            </button>
          ) : <span />}

          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>
            <button type="submit" className="btn-primario" disabled={enviando || !dados.nome.trim()}>
              {enviando ? 'Salvando...' : inicial ? 'Salvar' : 'Criar projeto'}
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
