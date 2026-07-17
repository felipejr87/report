import { createContext, useContext, useEffect, useState } from 'react'

const ThemeCtx = createContext(null)
const CHAVE = 'report_tema_v1'

function temaInicial() {
  const salvo = localStorage.getItem(CHAVE)
  if (salvo === 'light' || salvo === 'dark') return salvo
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [tema, setTema] = useState(temaInicial)

  useEffect(() => {
    document.documentElement.setAttribute('data-tema', tema)
    localStorage.setItem(CHAVE, tema)
  }, [tema])

  function alternar() {
    setTema((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  return (
    <ThemeCtx.Provider value={{ tema, alternar }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export const useTheme = () => useContext(ThemeCtx)
