export const ROTULO_FASE = {
  discovery: 'Discovery',
  refinamento: 'Refinamento',
  downstream: 'Downstream',
  entregue: 'Entregue',
}

export const FASES = ['discovery', 'refinamento', 'downstream', 'entregue']

export default function ChipFase({ fase }) {
  return (
    <span className="chip-fase" data-fase={fase}>
      {ROTULO_FASE[fase]}
    </span>
  )
}
