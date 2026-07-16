import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { FASES, ROTULO_FASE } from './ChipFase'

const PONTOS = ['1', '2', '3', '5', '8', '13', '21', '?']

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
  link_jira: '',
  data_inicio: '',
  data_fim: '',
}

export default function FormDemanda({ inicial, onSalvar, onExcluir, onCancelar }) {
  const [dados, setDados] = useState(inicial ? { ...VAZIO, ...inicial } : VAZIO)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  function atualizar(campo, valor) {
    setDados((d) => ({ ...d, [campo]: valor }))
  }

  function escolherPontos(valor) {
    atualizar('estimativa', valor === '?' ? '' : valor)
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
        link_jira: dados.link_jira === '' ? null : dados.link_jira,
        data_inicio: dados.data_inicio === '' ? null : dados.data_inicio,
        data_fim: dados.data_fim === '' ? null : dados.data_fim,
      })
    } catch (err) {
      setErro(err.message || 'Erro ao salvar.')
    } finally {
      setEnviando(false)
    }
  }

  async function handleExcluir() {
    if (!window.confirm(`Excluir "${dados.nome}"? Essa ação não pode ser desfeita.`)) return
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
        <h2 className="text-card-title">{inicial ? 'Editar demanda' : 'Nova demanda'}</h2>
        <button type="button" className="modal-fechar" onClick={onCancelar} aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      {erro && <p role="alert" className="campo-erro">{erro}</p>}

      <label className="campo">
        <span className="text-label">Nome *</span>
        <input value={dados.nome} onChange={(e) => atualizar('nome', e.target.value)} data-erro={!!erro && !dados.nome.trim()} required />
      </label>

      <label className="campo">
        <span className="text-label">Resumo *</span>
        <textarea value={dados.resumo} onChange={(e) => atualizar('resumo', e.target.value)} rows={2} data-erro={!!erro && !dados.resumo.trim()} required />
      </label>

      <label className="campo">
        <span className="text-label">Objetivo</span>
        <textarea value={dados.objetivo} onChange={(e) => atualizar('objetivo', e.target.value)} rows={2} />
      </label>

      <div className="campo-grade-2">
        <label className="campo">
          <span className="text-label">OKR</span>
          <input value={dados.okr} onChange={(e) => atualizar('okr', e.target.value)} />
        </label>
        <label className="campo">
          <span className="text-label">Ganho</span>
          <input value={dados.ganho} onChange={(e) => atualizar('ganho', e.target.value)} />
        </label>
      </div>

      <div className="campo-grade-2">
        <label className="campo">
          <span className="text-label">Responsável</span>
          <input value={dados.responsavel} onChange={(e) => atualizar('responsavel', e.target.value)} />
        </label>
        <label className="campo">
          <span className="text-label">Fase</span>
          <select value={dados.fase} onChange={(e) => atualizar('fase', e.target.value)}>
            {FASES.map((f) => <option key={f} value={f}>{ROTULO_FASE[f]}</option>)}
          </select>
        </label>
      </div>

      <label className="campo">
        <span className="text-label">Próximo passo</span>
        <input value={dados.proximo_passo} onChange={(e) => atualizar('proximo_passo', e.target.value)} />
      </label>

      <div className="campo">
        <span className="text-label">Estimativa (pontos)</span>
        <div className="pontos-seletor">
          {PONTOS.map((p) => {
            const estimativaStr = dados.estimativa === '' || dados.estimativa == null ? '?' : String(dados.estimativa)
            return (
              <button
                key={p}
                type="button"
                data-ativo={estimativaStr === p}
                onClick={() => escolherPontos(p)}
              >
                {p}
              </button>
            )
          })}
        </div>
      </div>

      <div className="campo-grade-2">
        <label className="campo">
          <span className="text-label">Data de início</span>
          <input type="date" value={dados.data_inicio} onChange={(e) => atualizar('data_inicio', e.target.value)} />
        </label>
        <label className="campo">
          <span className="text-label">Data fim</span>
          <input type="date" value={dados.data_fim} onChange={(e) => atualizar('data_fim', e.target.value)} />
        </label>
      </div>

      <label className="campo">
        <span className="text-label">Link do Jira</span>
        <input type="url" value={dados.link_jira} onChange={(e) => atualizar('link_jira', e.target.value)} placeholder="https://...atlassian.net/browse/..." />
      </label>

      <div className="modal-rodape">
        {inicial?.id ? (
          <button type="button" className="btn-perigo" onClick={handleExcluir} disabled={excluindo}>
            <Trash2 size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
            {excluindo ? 'Excluindo...' : 'Excluir'}
          </button>
        ) : <span />}

        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>
          <button type="submit" className="btn-primario" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </form>
  )
}
