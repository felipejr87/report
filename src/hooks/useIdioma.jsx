import { createContext, useContext, useState } from 'react'

const IdiomaCtx = createContext(null)
const CHAVE = 'report_idioma_v1'

export function IdiomaProvider({ children }) {
  const [idioma, setIdiomaState] = useState(() => (localStorage.getItem(CHAVE) === 'en' ? 'en' : 'pt'))

  function setIdioma(novo) {
    const valor = novo === 'en' ? 'en' : 'pt'
    localStorage.setItem(CHAVE, valor)
    setIdiomaState(valor)
  }

  function alternar() {
    setIdioma(idioma === 'pt' ? 'en' : 'pt')
  }

  return (
    <IdiomaCtx.Provider value={{ idioma, setIdioma, alternar }}>
      {children}
    </IdiomaCtx.Provider>
  )
}

export const useIdioma = () => useContext(IdiomaCtx)
