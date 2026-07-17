import { useState } from 'react'
import { X, Flame, ChevronDown, ChevronUp } from 'lucide-react'

const VAZIO = { nome: '', data_entrega: '', quente: false, objetivo: '', okr: '', ganho: '' }

export default function FormProjeto({ inicial, onSalvar, onCancelar }) {
  const [dados, setDados] = useState(inicial ? { ...VAZIO, ...inicial } : VAZIO)
  const [detalhesAbertos, setDetalhesAbertos] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

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

      <div className="modal-rodape">
        <span />
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>
          <button type="submit" className="btn-primario" disabled={enviando || !dados.nome.trim()}>
            {enviando ? 'Salvando...' : inicial ? 'Salvar' : 'Criar projeto'}
          </button>
        </div>
      </div>
    </form>
  )
}
