import { Routes, Route } from 'react-router-dom'
import Entrada from './pages/Entrada'
import Espaco from './pages/Espaco'
import Demanda from './pages/Demanda'
import Timeline from './pages/Timeline'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Entrada />} />
      <Route path="/espaco" element={<Espaco />} />
      <Route path="/espaco/demanda/:id" element={<Demanda />} />
      <Route path="/espaco/timeline" element={<Timeline />} />
    </Routes>
  )
}
