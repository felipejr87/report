// Funções de tempo sempre em BRT (America/Sao_Paulo) — usar em vez de
// `new Date().getHours()`/`toLocaleTimeString` sem timeZone sempre que
// o resultado depender de "agora" (saudação, período do dia). Isso
// funciona corretamente no browser (executa no fuso do aparelho, que é
// BRT), mas é obrigatório em código que roda no servidor (Edge
// Functions rodam em UTC no Deno) — daí centralizar aqui em vez de
// espalhar `timeZone: 'America/Sao_Paulo'` em cada chamada.

export function horaAtualBRT() {
  const agora = new Date()
  return parseInt(agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }), 10)
}

export function saudacaoBRT(idioma = 'pt') {
  const hora = horaAtualBRT()
  if (idioma === 'en') {
    if (hora < 12) return 'Good morning'
    if (hora < 18) return 'Good afternoon'
    return 'Good evening'
  }
  if (hora < 12) return 'Bom dia'
  if (hora < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function diaSemanaAtualBRT(idioma = 'pt') {
  const agora = new Date()
  return agora.toLocaleDateString(idioma === 'en' ? 'en-US' : 'pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' })
}

export function formatarHoraBRT(isoString) {
  return new Date(isoString).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}
