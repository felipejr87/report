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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-md)' }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)', padding: 'var(--space-xl) var(--space-lg)' }}>
        <h1 className="text-display-hero" style={{ fontSize: 32, marginBottom: 'var(--space-xs)' }}>
          Report<span style={{ color: 'var(--brand)' }}>!</span>
        </h1>
        <p className="text-micro" style={{ marginBottom: 'var(--space-lg)' }}>
          {modo === 'entrar' ? 'sua planilha, viva' : 'Onde está cada demanda e qual o próximo passo.'}
        </p>

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
            <button type="submit" className="btn-primario" disabled={carregando}>
              {carregando ? 'Entrando...' : 'Entrar no espaço'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', color: 'var(--text-dim)', fontSize: 12 }}>
              <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              ou
              <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>

            <button
              type="button"
              className="btn-secundario"
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
            <button type="submit" className="btn-primario" disabled={carregando}>
              {carregando ? 'Criando...' : 'Criar espaço'}
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => { setModo('entrar'); setErro('') }}
            >
              Já tenho um espaço
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
