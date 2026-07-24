import { useState } from 'react'
import { Download, Trash2, Check } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { supabaseEspaco } from '../lib/supabase'
import Header from '../components/Header'
import TabBar from '../components/jarvis/TabBar'

function fmtData(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function corStatus(status) {
  if (status === 200) return 'var(--entregue)'
  if (status === 429) return 'var(--downstream)'
  return 'var(--atencao)'
}

export default function Seguranca() {
  const { sessao, sair } = useAuth()
  const toast = useToast()
  const cliente = sessao ? supabaseEspaco(sessao.token) : null

  const [acessos, setAcessos] = useState(null)
  const [carregandoAcessos, setCarregandoAcessos] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [confirmandoDelete, setConfirmandoDelete] = useState(false)
  const [deletando, setDeletando] = useState(false)

  if (!sessao) return null

  async function carregarAcessos() {
    setCarregandoAcessos(true)
    const { data, error } = await cliente
      .from('jarvis_access_log')
      .select('endpoint, status, criado_em')
      .order('criado_em', { ascending: false })
      .limit(20)
    if (error) toast?.erro(error.message)
    setAcessos(data || [])
    setCarregandoAcessos(false)
  }

  async function exportarDados() {
    setExportando(true)
    try {
      const { data, error } = await cliente.rpc('exportar_dados_espaco', { p_espaco_id: sessao.espaco.id })
      if (error) throw error
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `jarvis-export-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast?.erro(e.message || 'Erro ao exportar.')
    }
    setExportando(false)
  }

  async function deletarTudo() {
    if (!confirmandoDelete) {
      setConfirmandoDelete(true)
      return
    }
    setDeletando(true)
    try {
      const { error } = await cliente.rpc('deletar_dados_espaco', { p_espaco_id: sessao.espaco.id })
      if (error) throw error
      sair()
    } catch (e) {
      toast?.erro(e.message || 'Erro ao deletar.')
      setConfirmandoDelete(false)
      setDeletando(false)
    }
  }

  const isJarvis = sessao.espaco.jarvis_enabled === true

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-md)', paddingBottom: isJarvis ? 76 : 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <Header espaco={sessao.espaco} onSair={sair} />

      <h1 className="text-titulo">Segurança &amp; Privacidade</h1>

      <section className="detalhe-secao">
        <h2 className="section-label">Sessão atual</h2>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
            <span style={{ color: 'var(--text-dim)' }}>Espaço</span>
            <span>{sessao.espaco.codigo}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
            <span style={{ color: 'var(--text-dim)' }}>Jarvis</span>
            {isJarvis ? (
              <span style={{ color: 'var(--entregue)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={14} /> Ativo
              </span>
            ) : (
              <span style={{ color: 'var(--text-dim)' }}>Inativo</span>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
            <span style={{ color: 'var(--text-dim)' }}>Dados protegidos por</span>
            <span>RLS + JWT · Supabase</span>
          </div>
        </div>
        <button type="button" className="btn-secundario" onClick={sair} style={{ alignSelf: 'flex-start', marginTop: 'var(--space-sm)' }}>
          Encerrar sessão
        </button>
      </section>

      <section className="detalhe-secao">
        <h2 className="section-label">Log de acessos</h2>
        <p className="text-micro" style={{ marginBottom: 'var(--space-sm)' }}>
          IPs armazenados apenas como hash irreversível — nunca o IP real.
        </p>
        {acessos === null ? (
          <button type="button" className="btn-secundario" onClick={carregarAcessos} disabled={carregandoAcessos}>
            {carregandoAcessos ? 'Carregando...' : 'Ver últimos acessos'}
          </button>
        ) : acessos.length === 0 ? (
          <p className="text-micro">Nenhum acesso registrado ainda.</p>
        ) : (
          <div className="lista">
            {acessos.map((a, i) => (
              <div key={i} className="item-atividade" style={{ cursor: 'default', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: corStatus(a.status), fontWeight: 600, fontSize: 12, minWidth: 32 }}>{a.status}</span>
                  <span className="text-micro">{a.endpoint}</span>
                </span>
                <span className="text-micro">{fmtData(a.criado_em)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="detalhe-secao" style={{ borderBottom: 'none' }}>
        <h2 className="section-label">Seus dados (LGPD)</h2>
        <p className="text-micro" style={{ marginBottom: 'var(--space-sm)' }}>
          Exporte todos os seus dados em formato JSON ou delete tudo permanentemente.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)', alignItems: 'flex-start' }}>
          <button type="button" className="btn-primario" onClick={exportarDados} disabled={exportando}>
            <Download size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            {exportando ? 'Exportando...' : 'Exportar meus dados'}
          </button>

          <button
            type="button"
            className="btn-perigo"
            onClick={deletarTudo}
            disabled={deletando}
            style={confirmandoDelete ? { border: '1px solid var(--atencao)', background: 'color-mix(in srgb, var(--atencao) 8%, transparent)' } : undefined}
          >
            <Trash2 size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            {deletando ? 'Deletando...' : confirmandoDelete ? 'Confirmar — isso é permanente' : 'Deletar todos os dados'}
          </button>
          {confirmandoDelete && !deletando && (
            <button type="button" className="link-acao" onClick={() => setConfirmandoDelete(false)}>
              Cancelar
            </button>
          )}
        </div>
      </section>

      {isJarvis && <TabBar />}
    </div>
  )
}
