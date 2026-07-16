import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'

const ToastCtx = createContext(null)

const DURACAO_MS = 3000

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const remover = useCallback((id) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, saindo: true } : x)))
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 300)
  }, [])

  const disparar = useCallback((tipo, mensagem) => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, tipo, mensagem, saindo: false }])
    setTimeout(() => remover(id), DURACAO_MS)
  }, [remover])

  const toast = {
    sucesso: (msg) => disparar('sucesso', msg),
    erro: (msg) => disparar('erro', msg),
  }

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <Toast key={t.id} {...t} onFechar={() => remover(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

function Toast({ tipo, mensagem, saindo, onFechar }) {
  const [pausado, setPausado] = useState(false)
  const Icone = tipo === 'sucesso' ? CheckCircle2 : AlertCircle

  return (
    <div
      className="toast"
      data-tipo={tipo}
      data-saindo={saindo}
      data-pausado={pausado}
      role="alert"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
    >
      <Icone size={16} color={tipo === 'sucesso' ? 'var(--entregue)' : 'var(--danger)'} />
      <span className="text-body" style={{ flex: 1 }}>{mensagem}</span>
      <button className="modal-fechar" onClick={onFechar} aria-label="Fechar aviso">
        <X size={14} />
      </button>
      <div className="toast-barra" />
    </div>
  )
}

export const useToast = () => useContext(ToastCtx)
