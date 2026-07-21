import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function JarvisRoute({ children }) {
  const { sessao } = useAuth()
  if (!sessao) return <Navigate to="/" replace />
  if (!sessao.espaco?.jarvis_enabled) return <Navigate to="/projetos" replace />
  return children
}
