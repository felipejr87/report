import BadgeParado from './BadgeParado'

const FASES = ['discovery', 'refinamento', 'downstream', 'entregue']

const ROTULO_FASE = {
  discovery: 'Discovery',
  refinamento: 'Refinamento',
  downstream: 'Downstream',
  entregue: 'Entregue',
}

export default function CardDemanda({ demanda, onEditar, onMudarFase }) {
  return (
    <div className="card-demanda" data-fase={demanda.fase}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        <h3 style={{ fontSize: 'var(--text-lg)', cursor: 'pointer' }} onClick={() => onEditar(demanda)}>
          {demanda.nome}
        </h3>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexShrink: 0 }}>
          {demanda.link_jira && (
            <a
              href={demanda.link_jira}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 'var(--text-xs)', color: 'var(--brand)' }}
            >
              Jira ↗
            </a>
          )}
          <BadgeParado atualizadoEm={demanda.atualizado_em} />
        </div>
      </div>

      <p style={{ color: 'var(--text-dim)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
        {demanda.resumo}
      </p>

      {demanda.proximo_passo && (
        <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
          <strong>Próximo passo:</strong> {demanda.proximo_passo}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-4)', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)' }}>
          {demanda.responsavel || 'sem responsável'}
        </span>

        <select
          value={demanda.fase}
          onChange={(e) => onMudarFase(demanda, e.target.value)}
          aria-label={`Fase de ${demanda.nome}`}
        >
          {FASES.map((f) => (
            <option key={f} value={f}>{ROTULO_FASE[f]}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
