const LIMITE_DIAS_PARADO = 3
const LIMITE_DIAS_ENTREGA = 7

function diasDesde(dataIso) {
  return Math.floor((Date.now() - new Date(dataIso).getTime()) / (1000 * 60 * 60 * 24))
}

function diasAte(dataIso) {
  return Math.floor((new Date(dataIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

// Sinal automático: o projeto precisa de mais atenção se tem demanda parada
// há mais de 3 dias, ou a entrega está a ≤7 dias (ou já passou) sem tudo concluído.
export function precisaDeTracao(projeto, demandasDoProjeto) {
  const naoEntregues = demandasDoProjeto.filter((d) => d.fase !== 'entregue')
  if (naoEntregues.length === 0) return false

  const temParada = naoEntregues.some((d) => diasDesde(d.atualizado_em) > LIMITE_DIAS_PARADO)
  const entregaProxima = projeto.data_entrega && diasAte(projeto.data_entrega) <= LIMITE_DIAS_ENTREGA

  return temParada || !!entregaProxima
}

// Projetos: mais próximos da entrega primeiro; sem data de entrega ficam por último.
export function ordenarProjetosPorEntrega(projetos) {
  return projetos.slice().sort((a, b) => {
    if (!a.data_entrega && !b.data_entrega) return a.nome.localeCompare(b.nome)
    if (!a.data_entrega) return 1
    if (!b.data_entrega) return -1
    return new Date(a.data_entrega) - new Date(b.data_entrega)
  })
}

// Demandas: concluídas sempre por último; entre as demais, a que tem prazo
// mais próximo primeiro; sem prazo entram depois das com prazo, ordenadas
// pela mais recentemente mexida.
export function ordenarDemandasPorPrioridade(demandas) {
  const entregues = demandas.filter((d) => d.fase === 'entregue')
  const ativas = demandas.filter((d) => d.fase !== 'entregue')

  const comPrazo = ativas.filter((d) => d.data_fim).sort((a, b) => new Date(a.data_fim) - new Date(b.data_fim))
  const semPrazo = ativas.filter((d) => !d.data_fim).sort((a, b) => new Date(b.atualizado_em) - new Date(a.atualizado_em))

  const entreguesOrdenadas = entregues.sort((a, b) => new Date(b.atualizado_em) - new Date(a.atualizado_em))

  return [...comPrazo, ...semPrazo, ...entreguesOrdenadas]
}
