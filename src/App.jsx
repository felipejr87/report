import { Routes, Route } from 'react-router-dom'
import Entrada from './pages/Entrada'
import Projetos from './pages/Projetos'
import Projeto from './pages/Projeto'
import Atividade from './pages/Atividade'
import Timeline from './pages/Timeline'
import Financeiro from './pages/Financeiro'
import JarvisHome from './pages/JarvisHome'
import Vida from './pages/Vida'
import Seguranca from './pages/Seguranca'
import JarvisRoute from './components/JarvisRoute'

export default function App() {
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
      <Route path="/seguranca" element={<JarvisRoute><Seguranca /></JarvisRoute>} />
    </Routes>
  )
}
