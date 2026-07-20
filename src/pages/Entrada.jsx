import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { urlFuncao } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import ThemeToggle from '../components/ThemeToggle'

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
      await chamarFuncao('criar-espaco', { codigo, nome, senha })
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--space-md)' }}>
        <ThemeToggle />
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-md)' }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-lg)' }}>
            <img src="/icons/icon-512.png" alt="Jarvis" width={120} height={120} style={{ borderRadius: '50%' }} />
          </div>

          {erro && <p role="alert" className="campo-erro" style={{ marginBottom: 'var(--space-md)' }}>{erro}</p>}

          {modo === 'entrar' ? (
            <form onSubmit={handleEntrar} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <label className="campo">
                <span className="text-label">Código do espaço</span>
                <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="EQUIPE-X" autoComplete="off" required />
              </label>
              <label className="campo">
                <span className="text-label">Senha</span>
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
              </label>
              <button type="submit" className="btn-primario" disabled={carregando} style={{ marginTop: 'var(--space-sm)' }}>
                {carregando ? 'Entrando...' : 'Entrar no espaço'}
              </button>

              <button
                type="button"
                className="link-acao"
                style={{ alignSelf: 'center' }}
                onClick={() => { setModo('criar'); setErro('') }}
              >
                Criar novo espaço
              </button>
            </form>
          ) : (
            <form onSubmit={handleCriar} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <label className="campo">
                <span className="text-label">Código do espaço</span>
                <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="EQUIPE-X" autoComplete="off" required />
              </label>
              <label className="campo">
                <span className="text-label">Nome do espaço</span>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Squad de Produto" required />
              </label>
              <label className="campo">
                <span className="text-label">Senha (mín. 8 caracteres)</span>
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} />
              </label>
              <button type="submit" className="btn-primario" disabled={carregando} style={{ marginTop: 'var(--space-sm)' }}>
                {carregando ? 'Criando...' : 'Criar espaço'}
              </button>
              <button
                type="button"
                className="link-acao"
                style={{ alignSelf: 'center' }}
                onClick={() => { setModo('entrar'); setErro('') }}
              >
                Já tenho um espaço
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
