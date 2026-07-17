export const ROTULO_FASE = {
  discovery: 'Discovery',
  refinamento: 'Refinamento',
  downstream: 'Downstream',
  entregue: 'Entregue',
}

export const FASES = ['discovery', 'refinamento', 'downstream', 'entregue']

export default function ChipFase({ fase }) {
  return (
    <span className="fase-indicador">
      <span className="fase-ponto" data-fase={fase} aria-hidden="true" />
      {ROTULO_FASE[fase]}
    </span>
  )
}
