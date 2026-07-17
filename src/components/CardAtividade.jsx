import BadgeParado from './BadgeParado'
import ChipFase from './ChipFase'

export default function CardAtividade({ atividade, onConcluirPasso, onClick }) {
  return (
    <div
      className="item-atividade"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      aria-label={`Abrir ${atividade.nome}`}
    >
      <div className="item-atividade-titulo">{atividade.nome}</div>

      <div className="item-atividade-meta">
        <ChipFase fase={atividade.fase} />
        <span className="separador-ponto">·</span>
        <span>{atividade.responsavel || 'sem responsável'}</span>
        <BadgeParado atualizadoEm={atividade.atualizado_em} />
      </div>

      {atividade.proximoPasso && (
        <div className="item-atividade-passo">
          <span className="seta">→</span>
          <span>{atividade.proximoPasso.detalhe.texto}</span>
          <button
            type="button"
            className="link-acao"
            onClick={(e) => { e.stopPropagation(); onConcluirPasso(atividade.proximoPasso, atividade.id) }}
          >
            Concluir
          </button>
        </div>
      )}
    </div>
  )
}
