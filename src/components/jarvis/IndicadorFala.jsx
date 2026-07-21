export default function IndicadorFala({ ativo }) {
  if (!ativo) return null
  return (
    <div className="indicador-fala" aria-hidden="true">
      <span className="indicador-fala-anel" />
      <span className="indicador-fala-anel" />
      <span className="indicador-fala-nucleo">J</span>
    </div>
  )
}
