import { ROTULO_FASE } from '../components/ChipFase'

export async function buscarProximosPassosPendentes(cliente, atividadeIds) {
  if (!atividadeIds.length) return {}

  const { data, error } = await cliente
    .from('movimentos')
    .select('*')
    .in('atividade_id', atividadeIds)
    .eq('tipo', 'acao_planejada')
    .eq('status', 'pendente')

  if (error) throw error

  const mapa = {}
  for (const m of data || []) {
    // uma atividade pode ter mais de uma linha pendente por engano — mantém a mais recente
    if (!mapa[m.atividade_id] || new Date(m.criado_em) > new Date(mapa[m.atividade_id].criado_em)) {
      mapa[m.atividade_id] = m
    }
  }
  return mapa
}

export async function concluirAcao(cliente, movimentoId, atividadeId, usuario) {
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

  await cliente.from('atividades').update({ atualizado_em: agora }).eq('id', atividadeId)
}

export async function adicionarAcao(cliente, atividadeId, texto, usuario) {
  const agora = new Date().toISOString()
  const { data, error } = await cliente
    .from('movimentos')
    .insert({
      atividade_id: atividadeId,
      tipo: 'acao_planejada',
      status: 'pendente',
      ordem: 0,
      detalhe: { texto, criado_por: usuario || null },
    })
    .select()
    .single()
  if (error) throw error

  await cliente.from('atividades').update({ atualizado_em: agora }).eq('id', atividadeId)
  return data
}

export async function editarAcao(cliente, movimento, atividadeId, novoTexto, usuario) {
  const agora = new Date().toISOString()
  const textoAntigo = movimento.detalhe?.texto

  const { error: eUpdate } = await cliente
    .from('movimentos')
    .update({ detalhe: { ...movimento.detalhe, texto: novoTexto, editado_por: usuario || null } })
    .eq('id', movimento.id)
  if (eUpdate) throw eUpdate

  const { error: eLog } = await cliente.from('movimentos').insert({
    atividade_id: atividadeId,
    tipo: 'edicao',
    detalhe: { texto: 'Próximo passo editado', de: textoAntigo, para: novoTexto, usuario: usuario || null },
  })
  if (eLog) throw eLog

  await cliente.from('atividades').update({ atualizado_em: agora }).eq('id', atividadeId)
}

// `projeto` é opcional — quando informado, inclui OKR/Ganho do épico no report.
export function gerarReportTexto(atividade, movimentos, projeto) {
  const feitos = movimentos
    .filter((m) => m.status === 'concluido' && m.detalhe?.texto)
    .sort((a, b) => new Date(b.concluido_em || b.criado_em) - new Date(a.concluido_em || a.criado_em))
  const proximo = movimentos.find((m) => m.tipo === 'acao_planejada' && m.status === 'pendente')

  const linhas = [
    atividade.nome,
    `Fase: ${ROTULO_FASE[atividade.fase]} · Responsável: ${atividade.responsavel || '—'}`,
  ]
  if (projeto?.nome) linhas.push(`Projeto: ${projeto.nome}`)
  if (projeto?.okr) linhas.push(`OKR: ${projeto.okr}`)
  if (projeto?.ganho) linhas.push(`Ganho: ${projeto.ganho}`)

  linhas.push('', 'O que é', atividade.resumo || '—')

  linhas.push('', 'O que já foi feito')
  linhas.push(
    feitos.length
      ? feitos.map((m) => `• ${new Date(m.concluido_em || m.criado_em).toLocaleDateString('pt-BR')} — ${m.detalhe.texto}`).join('\n')
      : '—'
  )

  linhas.push('', 'Próximo passo')
  linhas.push(proximo ? `→ ${proximo.detalhe.texto}` : 'Atividade sem próximo passo definido.')

  return linhas.join('\n').trim()
}

// IDs de todas as atividades que dependem (direta ou transitivamente) de `id`.
// Usado pra impedir escolher uma sucessora como predecessora (ciclo).
export function idsSucessoras(atividades, id) {
  const diretas = atividades.filter((a) => a.predecessora_id === id).map((a) => a.id)
  const todas = new Set(diretas)
  for (const sucessoraId of diretas) {
    for (const neta of idsSucessoras(atividades, sucessoraId)) todas.add(neta)
  }
  return todas
}

const UM_DIA_MS = 24 * 60 * 60 * 1000

// Calcula posição/largura (em %) de cada atividade com data para desenhar um Gantt simples.
export function calcularGantt(atividades) {
  const comData = atividades.filter((a) => a.data_inicio)
  const semData = atividades.filter((a) => !a.data_inicio)

  if (comData.length === 0) return { itens: [], semData, inicio: null, fim: null }

  const hoje = new Date()
  const datas = comData.flatMap((a) => [
    new Date(a.data_inicio),
    new Date(a.data_fim || hoje),
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
    .map((a) => {
      const ini = new Date(a.data_inicio)
      const dFim = a.data_fim ? new Date(a.data_fim) : hoje
      const offset = ((ini.getTime() - inicio.getTime()) / duracaoTotal) * 100
      const largura = Math.max(((dFim.getTime() - ini.getTime()) / duracaoTotal) * 100, 1)
      return { atividade: a, offsetPct: offset, larguraPct: largura, semDataFim: !a.data_fim }
    })

  return { itens, semData, inicio, fim }
}
