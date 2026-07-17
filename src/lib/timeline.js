import { ROTULO_FASE } from '../components/ChipFase'

export async function buscarProximosPassosPendentes(cliente, demandaIds) {
  if (!demandaIds.length) return {}

  const { data, error } = await cliente
    .from('movimentos')
    .select('*')
    .in('demanda_id', demandaIds)
    .eq('tipo', 'acao_planejada')
    .eq('status', 'pendente')

  if (error) throw error

  const mapa = {}
  for (const m of data || []) {
    // uma demanda pode ter mais de uma linha pendente por engano — mantém a mais recente
    if (!mapa[m.demanda_id] || new Date(m.criado_em) > new Date(mapa[m.demanda_id].criado_em)) {
      mapa[m.demanda_id] = m
    }
  }
  return mapa
}

export async function concluirAcao(cliente, movimentoId, demandaId) {
  const agora = new Date().toISOString()
  const { error } = await cliente
    .from('movimentos')
    .update({ status: 'concluido', tipo: 'acao_concluida', concluido_em: agora })
    .eq('id', movimentoId)
  if (error) throw error

  await cliente.from('demandas').update({ atualizado_em: agora }).eq('id', demandaId)
}

export async function adicionarAcao(cliente, demandaId, texto) {
  const agora = new Date().toISOString()
  const { data, error } = await cliente
    .from('movimentos')
    .insert({ demanda_id: demandaId, tipo: 'acao_planejada', status: 'pendente', ordem: 0, detalhe: { texto } })
    .select()
    .single()
  if (error) throw error

  await cliente.from('demandas').update({ atualizado_em: agora }).eq('id', demandaId)
  return data
}

export function gerarReportTexto(demanda, movimentos) {
  const feitos = movimentos
    .filter((m) => m.status === 'concluido' && m.detalhe?.texto)
    .sort((a, b) => new Date(b.concluido_em || b.criado_em) - new Date(a.concluido_em || a.criado_em))
  const proximo = movimentos.find((m) => m.tipo === 'acao_planejada' && m.status === 'pendente')

  const linhas = [
    demanda.nome,
    `Fase: ${ROTULO_FASE[demanda.fase]} · Responsável: ${demanda.responsavel || '—'}`,
  ]
  if (demanda.okr) linhas.push(`OKR: ${demanda.okr}`)
  if (demanda.ganho) linhas.push(`Ganho: ${demanda.ganho}`)

  linhas.push('', 'O que é', demanda.resumo || '—')

  linhas.push('', 'O que já foi feito')
  linhas.push(
    feitos.length
      ? feitos.map((m) => `• ${new Date(m.concluido_em || m.criado_em).toLocaleDateString('pt-BR')} — ${m.detalhe.texto}`).join('\n')
      : '—'
  )

  linhas.push('', 'Próximo passo')
  linhas.push(proximo ? `→ ${proximo.detalhe.texto}` : 'Demanda sem próximo passo definido.')

  return linhas.join('\n').trim()
}
