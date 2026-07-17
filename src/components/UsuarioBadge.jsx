import { useState, useRef, useEffect } from 'react'
import { User } from 'lucide-react'
import { useUsuario } from '../hooks/useUsuario'

export default function UsuarioBadge() {
  const { usuario, setUsuario } = useUsuario()
  const [editando, setEditando] = useState(!usuario)
  const [valor, setValor] = useState(usuario)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editando) inputRef.current?.focus()
  }, [editando])

  function salvar() {
    if (valor.trim()) {
      setUsuario(valor)
      setEditando(false)
    }
  }

  if (editando) {
    return (
      <form
        onSubmit={(e) => { e.preventDefault(); salvar() }}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <input
          ref={inputRef}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Seu nome"
          style={{ width: 120, padding: '2px 4px', fontSize: 13 }}
        />
        <button type="submit" className="link-acao" disabled={!valor.trim()}>Salvar</button>
      </form>
    )
  }

  return (
    <button
      type="button"
      className="link-acao"
      onClick={() => { setValor(usuario); setEditando(true) }}
      title="Trocar nome"
    >
      <User size={13} />
      {usuario}
    </button>
  )
}
