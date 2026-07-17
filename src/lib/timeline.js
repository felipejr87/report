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

export async function concluirAcao(cliente, movimentoId, demandaId, usuario) {
  const agora = new Date().toISOString()
  const { data: atual } = await cliente.from('movimentos').select('detalhe').eq('id', movimentoId).single()

  const { error } = await cliente
    .from('movimentos')
    .update({
      status: 'concluido',
      tipo: 'acao_concluida',
      concluido_em: agora,
      detalhe: { ...atual?.detalhe, concluido_por: usuario || null },
    })
    .eq('id', movimentoId)
  if (error) throw error

  await cliente.from('demandas').update({ atualizado_em: agora }).eq('id', demandaId)
}

export async function adicionarAcao(cliente, demandaId, texto, usuario) {
  const agora = new Date().toISOString()
  const { data, error } = await cliente
    .from('movimentos')
    .insert({
      demanda_id: demandaId,
      tipo: 'acao_planejada',
      status: 'pendente',
      ordem: 0,
      detalhe: { texto, criado_por: usuario || null },
    })
    .select()
    .single()
  if (error) throw error

  await cliente.from('demandas').update({ atualizado_em: agora }).eq('id', demandaId)
  return data
}

export async function editarAcao(cliente, movimento, demandaId, novoTexto, usuario) {
  const agora = new Date().toISOString()
  const textoAntigo = movimento.detalhe?.texto

  const { error: eUpdate } = await cliente
    .from('movimentos')
    .update({ detalhe: { ...movimento.detalhe, texto: novoTexto, editado_por: usuario || null } })
    .eq('id', movimento.id)
  if (eUpdate) throw eUpdate

  const { error: eLog } = await cliente.from('movimentos').insert({
    demanda_id: demandaId,
    tipo: 'edicao',
    detalhe: { texto: 'Próximo passo editado', de: textoAntigo, para: novoTexto, usuario: usuario || null },
  })
  if (eLog) throw eLog

  await cliente.from('demandas').update({ atualizado_em: agora }).eq('id', demandaId)
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

// IDs de todas as demandas que dependem (direta ou transitivamente) de `id`.
// Usado pra impedir escolher uma sucessora como predecessora (ciclo).
export function idsSucessoras(demandas, id) {
  const diretas = demandas.filter((d) => d.predecessora_id === id).map((d) => d.id)
  const todas = new Set(diretas)
  for (const sucessoraId of diretas) {
    for (const neta of idsSucessoras(demandas, sucessoraId)) todas.add(neta)
  }
  return todas
}

const UM_DIA_MS = 24 * 60 * 60 * 1000

// Calcula posição/largura (em %) de cada demanda com data para desenhar um Gantt simples.
export function calcularGantt(demandas) {
  const comData = demandas.filter((d) => d.data_inicio)
  const semData = demandas.filter((d) => !d.data_inicio)

  if (comData.length === 0) return { itens: [], semData, inicio: null, fim: null }

  const hoje = new Date()
  const datas = comData.flatMap((d) => [
    new Date(d.data_inicio),
    new Date(d.data_fim || hoje),
  ])
  let inicio = new Date(Math.min(...datas))
  let fim = new Date(Math.max(...datas.concat(hoje)))

  // margem de 1 dia em cada ponta pra barras não colarem na borda
  inicio = new Date(inicio.getTime() - UM_DIA_MS)
  fim = new Date(fim.getTime() + UM_DIA_MS)
  const duracaoTotal = fim.getTime() - inicio.getTime()

  const itens = comData
    .slice()
    .sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio))
    .map((d) => {
      const ini = new Date(d.data_inicio)
      const dFim = d.data_fim ? new Date(d.data_fim) : hoje
      const offset = ((ini.getTime() - inicio.getTime()) / duracaoTotal) * 100
      const largura = Math.max(((dFim.getTime() - ini.getTime()) / duracaoTotal) * 100, 1)
      return { demanda: d, offsetPct: offset, larguraPct: largura, semDataFim: !d.data_fim }
    })

  return { itens, semData, inicio, fim }
}
