import { createContext, useContext, useState } from 'react'

const UsuarioCtx = createContext(null)
const CHAVE = 'report_usuario_v1'

export function UsuarioProvider({ children }) {
  const [usuario, setUsuarioState] = useState(() => localStorage.getItem(CHAVE) || '')

  function setUsuario(nome) {
    const limpo = nome.trim()
    localStorage.setItem(CHAVE, limpo)
    setUsuarioState(limpo)
  }

  return (
    <UsuarioCtx.Provider value={{ usuario, setUsuario }}>
      {children}
    </UsuarioCtx.Provider>
  )
}

export const useUsuario = () => useContext(UsuarioCtx)
