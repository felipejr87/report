import { Routes, Route } from 'react-router-dom'
import Entrada from './pages/Entrada'
import Espaco from './pages/Espaco'
import Projeto from './pages/Projeto'
import Atividade from './pages/Atividade'
import Timeline from './pages/Timeline'
import JarvisRoute from './components/JarvisRoute'
import Pilares from './pages/jarvis/Pilares'
import Financeiro from './pages/jarvis/Financeiro'
import Calendario from './pages/jarvis/Calendario'
import Habitos from './pages/jarvis/Habitos'
import Brief from './pages/jarvis/Brief'
import Assistente from './pages/jarvis/Assistente'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Entrada />} />
      <Route path="/espaco" element={<Espaco />} />
      <Route path="/espaco/projeto/:id" element={<Projeto />} />
      <Route path="/espaco/atividade/:id" element={<Atividade />} />
      <Route path="/espaco/timeline/:id" element={<Timeline />} />

      <Route path="/jarvis/assistente" element={<JarvisRoute><Assistente /></JarvisRoute>} />
      <Route path="/jarvis/pilares" element={<JarvisRoute><Pilares /></JarvisRoute>} />
      <Route path="/jarvis/financeiro" element={<JarvisRoute><Financeiro /></JarvisRoute>} />
      <Route path="/jarvis/calendario" element={<JarvisRoute><Calendario /></JarvisRoute>} />
      <Route path="/jarvis/habitos" element={<JarvisRoute><Habitos /></JarvisRoute>} />
      <Route path="/jarvis/brief" element={<JarvisRoute><Brief /></JarvisRoute>} />
    </Routes>
  )
}
