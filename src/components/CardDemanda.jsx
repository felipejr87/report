import { useState } from 'react'
import { ArrowRight, Pencil, User, Tag, ExternalLink, CheckCircle2 } from 'lucide-react'
import BadgeParado from './BadgeParado'
import ChipFase, { FASES, ROTULO_FASE } from './ChipFase'

export default function CardDemanda({ demanda, onEditar, onMudarFase, onConcluirPasso }) {
  const [mostrarSeletor, setMostrarSeletor] = useState(false)
  const passoFeito = !!demanda.proximo_passo_feito

  return (
    <div className="card-demanda" data-fase={demanda.fase}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-sm)' }}>
        <ChipFase fase={demanda.fase} />
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          {demanda.link_jira && (
            <a
              href={demanda.link_jira}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir história no Jira"
              style={{ color: 'var(--text-dim)', display: 'flex' }}
            >
              <ExternalLink size={14} />
            </a>
          )}
          <BadgeParado atualizadoEm={demanda.atualizado_em} />
        </div>
      </div>

      {demanda.projeto && (
        <span className="text-micro">{demanda.projeto}</span>
      )}

      <h3
        className="text-card-title"
        style={{ cursor: 'pointer' }}
        onClick={() => onEditar(demanda)}
      >
        {demanda.nome}
      </h3>

      {demanda.proximo_passo && (
        <label
          style={{ borderTop: '1px solid var(--line)', paddingTop: 'var(--space-sm)', display: 'flex', gap: 'var(--space-xs)', alignItems: 'flex-start', cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={passoFeito}
            onChange={(e) => onConcluirPasso(demanda, e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0, width: 14, height: 14 }}
            aria-label={`Marcar próximo passo de ${demanda.nome} como feito`}
          />
          <span
            className="text-body"
            style={{
              fontWeight: 500,
              textDecoration: passoFeito ? 'line-through' : 'none',
              color: passoFeito ? 'var(--text-dim)' : 'var(--text)',
            }}
          >
            {demanda.proximo_passo}
          </span>
        </label>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
          <span className="text-micro" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <User size={14} /> {demanda.responsavel || 'sem responsável'}
          </span>
          {demanda.estimativa != null && (
            <span className="text-micro" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tag size={14} /> {demanda.estimativa} pts
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          {demanda.fase !== 'entregue' && (
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: 6 }}
              onClick={() => onMudarFase(demanda, 'entregue')}
              aria-label={`Concluir ${demanda.nome}`}
              title="Concluir demanda"
            >
              <CheckCircle2 size={14} />
            </button>
          )}
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: 6 }}
            onClick={() => setMostrarSeletor((v) => !v)}
            aria-label={`Mudar fase de ${demanda.nome}`}
            aria-expanded={mostrarSeletor}
          >
            <ArrowRight size={14} />
          </button>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: 6 }}
            onClick={() => onEditar(demanda)}
            aria-label={`Editar ${demanda.nome}`}
          >
            <Pencil size={14} />
          </button>
        </div>
      </div>

      {mostrarSeletor && (
        <div className="filtro-fase" role="radiogroup" aria-label={`Mover ${demanda.nome} para outra fase`}>
          {FASES.map((f) => (
            <button
              key={f}
              type="button"
              className="pill"
              data-fase-ativa={demanda.fase === f ? f : undefined}
              aria-pressed={demanda.fase === f}
              onClick={() => { onMudarFase(demanda, f); setMostrarSeletor(false) }}
            >
              {ROTULO_FASE[f]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
