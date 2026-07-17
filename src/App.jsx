import { Routes, Route } from 'react-router-dom'
import Entrada from './pages/Entrada'
import Espaco from './pages/Espaco'
import Demanda from './pages/Demanda'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Entrada />} />
      <Route path="/espaco" element={<Espaco />} />
      <Route path="/espaco/demanda/:id" element={<Demanda />} />
    </Routes>
  )
}
