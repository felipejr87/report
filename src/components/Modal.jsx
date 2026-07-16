import { useEffect, useRef } from 'react'

const SELETOR_FOCAVEL = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export default function Modal({ titulo, children, onFechar }) {
  const painelRef = useRef(null)

  useEffect(() => {
    const scrollOriginal = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const painel = painelRef.current
    const focaveis = () => Array.from(painel.querySelectorAll(SELETOR_FOCAVEL))
    focaveis()[0]?.focus()

    function aoTeclar(e) {
      if (e.key === 'Escape') {
        onFechar()
        return
      }
      if (e.key !== 'Tab') return

      const els = focaveis()
      if (els.length === 0) return
      const primeiro = els[0]
      const ultimo = els[els.length - 1]

      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }

    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.body.style.overflow = scrollOriginal
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [onFechar])

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div
        className="modal-painel"
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-alca" />
        {children}
      </div>
    </div>
  )
}
