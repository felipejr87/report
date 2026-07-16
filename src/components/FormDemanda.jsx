import { useState } from 'react'

const FASES = ['discovery', 'refinamento', 'downstream', 'entregue']

const VAZIO = {
  nome: '',
  resumo: '',
  objetivo: '',
  okr: '',
  ganho: '',
  fase: 'discovery',
  proximo_passo: '',
  responsavel: '',
  estimativa: '',
}

export default function FormDemanda({ inicial, onSalvar, onCancelar }) {
  const [dados, setDados] = useState(inicial ? { ...VAZIO, ...inicial } : VAZIO)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  function atualizar(campo, valor) {
    setDados((d) => ({ ...d, [campo]: valor }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')

    if (!dados.nome.trim() || !dados.resumo.trim()) {
      setErro('Nome e resumo são obrigatórios.')
      return
    }

    setEnviando(true)
    try {
      await onSalvar({
        ...dados,
        estimativa: dados.estimativa === '' ? null : Number(dados.estimativa),
      })
    } catch (err) {
      setErro(err.message || 'Erro ao salvar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <h2>{inicial ? 'Editar demanda' : 'Nova demanda'}</h2>

      {erro && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>{erro}</p>}

      <label>
        Nome *
        <input value={dados.nome} onChange={(e) => atualizar('nome', e.target.value)} required />
      </label>

      <label>
        Resumo *
        <textarea value={dados.resumo} onChange={(e) => atualizar('resumo', e.target.value)} rows={2} required />
      </label>

      <label>
        Objetivo
        <textarea value={dados.objetivo} onChange={(e) => atualizar('objetivo', e.target.value)} rows={2} />
      </label>

      <label>
        OKR
        <input value={dados.okr} onChange={(e) => atualizar('okr', e.target.value)} />
      </label>

      <label>
        Ganho
        <input value={dados.ganho} onChange={(e) => atualizar('ganho', e.target.value)} />
      </label>

      <label>
        Fase
        <select value={dados.fase} onChange={(e) => atualizar('fase', e.target.value)}>
          {FASES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>

      <label>
        Próximo passo
        <input value={dados.proximo_passo} onChange={(e) => atualizar('proximo_passo', e.target.value)} />
      </label>

      <label>
        Responsável
        <input value={dados.responsavel} onChange={(e) => atualizar('responsavel', e.target.value)} />
      </label>

      <label>
        Estimativa
        <input type="number" value={dados.estimativa} onChange={(e) => atualizar('estimativa', e.target.value)} />
      </label>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
