export const ROTULO_FASE = {
  discovery: 'Discovery',
  refinamento: 'Refinamento',
  downstream: 'Downstream',
  entregue: 'Entregue',
}

export const FASES = ['discovery', 'refinamento', 'downstream', 'entregue']

// Fase do épico (projeto) — separada da fase da atividade acima.
export const ROTULO_FASE_PROJETO = {
  discovery: 'Discovery',
  construcao: 'Construção',
  lancamento: 'Lançamento',
  operacao: 'Operação',
  pausado: 'Pausado',
  encerrado: 'Encerrado',
}

export const FASES_PROJETO = ['discovery', 'construcao', 'lancamento', 'operacao', 'pausado', 'encerrado']

export default function ChipFase({ fase }) {
  return (
    <span className="fase-indicador">
      <span className="fase-ponto" data-fase={fase} aria-hidden="true" />
      {ROTULO_FASE[fase]}
    </span>
  )
}
