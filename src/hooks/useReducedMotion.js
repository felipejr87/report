import { useEffect, useState } from 'react'

export function useReducedMotion() {
  const [reduzido, setReduzido] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const ouvir = (e) => setReduzido(e.matches)
    mq.addEventListener('change', ouvir)
    return () => mq.removeEventListener('change', ouvir)
  }, [])

  return reduzido
}
