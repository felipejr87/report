import { useState } from 'react'
import { Trash2, X, ChevronDown, ChevronUp } from 'lucide-react'
import { FASES, ROTULO_FASE } from './ChipFase'
import { idsSucessoras } from '../lib/timeline'

const VAZIO = {
  nome: '',
  projeto: '',
  resumo: '',
  fase: 'discovery',
  objetivo: '',
  okr: '',
  ganho: '',
  responsavel: '',
  estimativa: '',
  link_jira: '',
  data_inicio: '',
  data_fim: '',
  predecessora_id: '',
}

export default function FormDemanda({ inicial, outrasDemandas = [], onSalvar, onExcluir, onCancelar }) {
  const [dados, setDados] = useState(inicial ? { ...VAZIO, ...inicial } : VAZIO)
  const [detalhesAbertos, setDetalhesAbertos] = useState(false)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

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
        link_jira: dados.link_jira === '' ? null : dados.link_jira,
        data_inicio: dados.data_inicio === '' ? null : dados.data_inicio,
        data_fim: dados.data_fim === '' ? null : dados.data_fim,
        predecessora_id: dados.predecessora_id === '' ? null : dados.predecessora_id,
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

  // Exclui a própria demanda e suas sucessoras (evita ciclo A→B→A)
  const idsInvalidos = inicial?.id
    ? new Set([inicial.id, ...idsSucessoras(outrasDemandas, inicial.id)])
    : new Set()
  const opcoesPredecessora = outrasDemandas.filter((d) => !idsInvalidos.has(d.id))

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
      <div className="modal-cabecalho">
        <h2 className="text-titulo">{inicial ? 'Editar demanda' : 'Nova demanda'}</h2>
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
        <span className="text-label">Projeto / Tema</span>
        <input value={dados.projeto} onChange={(e) => atualizar('projeto', e.target.value)} placeholder="Ex: Entendimento de Fatura" />
      </label>

      <label className="campo">
        <span className="text-label">O que é *</span>
        <textarea rows={3} value={dados.resumo} onChange={(e) => atualizar('resumo', e.target.value)} required />
      </label>

      <div className="campo">
        <span className="text-label">Fase</span>
        <div className="fase-selector">
          {FASES.map((f) => (
            <button
              key={f}
              type="button"
              className="fase-option"
              data-ativo={dados.fase === f}
              onClick={() => atualizar('fase', f)}
            >
              <span className="fase-ponto" data-fase={f} aria-hidden="true" />
              {ROTULO_FASE[f]}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="link-acao toggle-detalhes"
        onClick={() => setDetalhesAbertos((v) => !v)}
        aria-expanded={detalhesAbertos}
      >
        {detalhesAbertos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Detalhes opcionais
      </button>

      {detalhesAbertos && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <label className="campo">
            <span className="text-label">Objetivo</span>
            <textarea rows={2} value={dados.objetivo} onChange={(e) => atualizar('objetivo', e.target.value)} />
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
              <span className="text-label">Estimativa (pts)</span>
              <input type="number" value={dados.estimativa} onChange={(e) => atualizar('estimativa', e.target.value)} />
            </label>
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

          <label className="campo">
            <span className="text-label">Depende de</span>
            <select value={dados.predecessora_id} onChange={(e) => atualizar('predecessora_id', e.target.value)}>
              <option value="">Nenhuma</option>
              {opcoesPredecessora.map((d) => (
                <option key={d.id} value={d.id}>{d.nome}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="modal-rodape">
        {inicial?.id ? (
          <button type="button" className="btn-perigo" onClick={handleExcluir} disabled={excluindo}>
            <Trash2 size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
            {excluindo ? 'Excluindo...' : 'Excluir'}
          </button>
        ) : <span />}

        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>
          <button type="submit" className="btn-primario" disabled={enviando || !dados.nome.trim() || !dados.resumo.trim()}>
            {enviando ? 'Salvando...' : inicial ? 'Salvar' : 'Criar demanda'}
          </button>
        </div>
      </div>
    </form>
  )
}
