import BadgeParado from './BadgeParado'
import ChipFase from './ChipFase'

export default function CardDemanda({ demanda, onConcluirPasso, onClick }) {
  return (
    <div
      className="item-demanda"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      aria-label={`Abrir ${demanda.nome}`}
    >
      <div className="item-demanda-titulo">{demanda.nome}</div>

      <div className="item-demanda-meta">
        <ChipFase fase={demanda.fase} />
        <span className="separador-ponto">·</span>
        <span>{demanda.responsavel || 'sem responsável'}</span>
        <BadgeParado atualizadoEm={demanda.atualizado_em} />
      </div>

      {demanda.proximoPasso && (
        <div className="item-demanda-passo">
          <span className="seta">→</span>
          <span>{demanda.proximoPasso.detalhe.texto}</span>
          <button
            type="button"
            className="link-acao"
            onClick={(e) => { e.stopPropagation(); onConcluirPasso(demanda.proximoPasso, demanda.id) }}
          >
            Concluir
          </button>
        </div>
      )}
    </div>
  )
}
