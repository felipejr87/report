import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Entrada from './pages/Entrada'
import Projetos from './pages/Projetos'
import Projeto from './pages/Projeto'
import Atividade from './pages/Atividade'
import Timeline from './pages/Timeline'
import Financeiro from './pages/Financeiro'
import JarvisHome from './pages/JarvisHome'
import Vida from './pages/Vida'
import Anotacoes from './pages/Anotacoes'
import Seguranca from './pages/Seguranca'
import JarvisRoute from './components/JarvisRoute'
import { getAudioContext } from './hooks/useVoz'

export default function App() {
  // Desbloqueia o AudioContext (singleton usado por useVoz) no primeiro
  // gesto do usuário — alguns browsers criam/suspendem esse contexto de
  // forma que só um gesto real destrava, útil como rede de segurança
  // além do resume() que já roda a cada iniciarEscuta().
  useEffect(() => {
    function desbloquear() {
      getAudioContext()?.resume().catch(() => {})
    }
    document.addEventListener('touchstart', desbloquear, { once: true, passive: true })
    document.addEventListener('click', desbloquear, { once: true })
    document.addEventListener('keydown', desbloquear, { once: true })
    return () => {
      document.removeEventListener('touchstart', desbloquear)
      document.removeEventListener('click', desbloquear)
      document.removeEventListener('keydown', desbloquear)
    }
  }, [])

  return (
    <Routes>
      <Route path="/" element={<Entrada />} />

      <Route path="/projetos" element={<Projetos />} />
      <Route path="/projetos/projeto/:id" element={<Projeto />} />
      <Route path="/projetos/atividade/:id" element={<Atividade />} />
      <Route path="/projetos/timeline/:id" element={<Timeline />} />
      <Route path="/financeiro" element={<JarvisRoute><Financeiro /></JarvisRoute>} />

      <Route path="/jarvis" element={<JarvisRoute><JarvisHome /></JarvisRoute>} />
      <Route path="/vida" element={<JarvisRoute><Vida /></JarvisRoute>} />
      <Route path="/anotacoes" element={<JarvisRoute><Anotacoes /></JarvisRoute>} />
      <Route path="/seguranca" element={<JarvisRoute><Seguranca /></JarvisRoute>} />
    </Routes>
  )
}
