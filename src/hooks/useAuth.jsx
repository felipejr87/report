import { createContext, useContext, useState } from 'react'

const AuthCtx = createContext(null)

const CHAVE_SESSAO = 'report_sessao_v1'

function carregarSessao() {
  try {
    const raw = localStorage.getItem(CHAVE_SESSAO)
    if (!raw) return null
    const s = JSON.parse(raw)
    // Checar expiração simples (8h)
    if (Date.now() > s.exp * 1000) {
      localStorage.removeItem(CHAVE_SESSAO)
      return null
    }
    return s
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(carregarSessao)

  function entrar(token, espaco) {
    // Decodificar exp do JWT para saber quando expira
    const [, payload] = token.split('.')
    const { exp } = JSON.parse(atob(payload))
    const s = { token, espaco, exp }
    localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s))
    setSessao(s)
  }

  function sair() {
    localStorage.removeItem(CHAVE_SESSAO)
    setSessao(null)
  }

  return (
    <AuthCtx.Provider value={{ sessao, entrar, sair }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
