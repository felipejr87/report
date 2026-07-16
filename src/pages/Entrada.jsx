import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { urlFuncao } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

async function chamarFuncao(nome, body) {
  const res = await fetch(urlFuncao(nome), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok || !json.ok) {
    throw new Error(json.erro || 'Erro inesperado.')
  }
  return json
}

export default function Entrada() {
  const [modo, setModo] = useState('entrar') // 'entrar' | 'criar'
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [espacoCriado, setEspacoCriado] = useState(null)

  const { entrar } = useAuth()
  const navigate = useNavigate()

  async function handleEntrar(e) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const { token, espaco } = await chamarFuncao('entrar-espaco', { codigo, senha })
      entrar(token, espaco)
      navigate('/espaco')
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }

  async function handleCriar(e) {
    e.preventDefault()
    setErro('')

    if (senha.length < 8) {
      setErro('Senha deve ter pelo menos 8 caracteres.')
      return
    }

    setCarregando(true)
    try {
      const { espaco } = await chamarFuncao('criar-espaco', { codigo, nome, senha })
      setEspacoCriado(espaco)

      // Login automático após criação
      const { token, espaco: espacoLogin } = await chamarFuncao('entrar-espaco', { codigo, senha })
      entrar(token, espacoLogin)
      navigate('/espaco')
    } catch (err) {
      setErro(err.message)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto', padding: 'var(--space-6) var(--space-4)' }}>
      <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)' }}>Report</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 'var(--space-6)' }}>
        Onde está cada demanda e qual o próximo passo.
      </p>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <button
          type="button"
          className={modo === 'entrar' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => { setModo('entrar'); setErro('') }}
        >
          Entrar
        </button>
        <button
          type="button"
          className={modo === 'criar' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => { setModo('criar'); setErro('') }}
        >
          Criar espaço
        </button>
      </div>

      {espacoCriado && (
        <p style={{ marginBottom: 'var(--space-4)' }}>
          Espaço criado: <span className="chip-codigo">{espacoCriado.codigo}</span>
        </p>
      )}

      {erro && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>{erro}</p>}

      {modo === 'entrar' ? (
        <form onSubmit={handleEntrar} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <label>
            Código do espaço
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="CLARO-AI" required />
          </label>
          <label>
            Senha
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </label>
          <button type="submit" className="btn-primary" disabled={carregando}>
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleCriar} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <label>
            Código do espaço
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="CLARO-AI" required />
          </label>
          <label>
            Nome do espaço
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Squad Claro AI" required />
          </label>
          <label>
            Senha (mín. 8 caracteres)
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} />
          </label>
          <button type="submit" className="btn-primary" disabled={carregando}>
            {carregando ? 'Criando...' : 'Criar espaço'}
          </button>
        </form>
      )}
    </div>
  )
}
