// Feature flags do Jarvis/Report! — um lugar só pra ligar/desligar
// pedaços do app. Mudar um valor aqui exige rebuild + deploy (não é
// um remote config dinâmico), mas evita sinalizadores espalhados
// pelo código.
//
// Nem toda flag abaixo está conectada a alguma tela ainda — muitas
// marcam intenção pra features futuras (comentadas como tal). Só
// wire uma flag a `isEnabled()` quando a feature que ela controla
// já existe.

export const FEATURES = {
  // ASSISTENTE
  JARVIS_VOZ_AUTO: true, // resposta por voz automática (já shipada; usuário liga/desliga no header)
  JARVIS_CONFIRMACAO: true, // pedir confirmação antes de executar ações no banco (via system prompt)
  JARVIS_MODO_CONFRONTO: true, // alertas de evitação no brief
  JARVIS_BUSCA_WEB: false, // busca na web para recomendações (futuro)

  // FINANCEIRO
  FIN_LANCAMENTOS: true, // módulo de lançamentos
  FIN_GRAFICO_MENSAL: false, // gráfico temporal (futuro)
  FIN_ORCAMENTO_ANUAL: false, // visão anual (futuro)

  // PROJETOS
  PROJ_POKER: false, // planning poker (não usado no Jarvis)
  PROJ_TIMELINE: true, // gantt/timeline por projeto
  PROJ_REPORT_GERENCIAL: true, // botão "Copiar report"
  PROJ_WIP_LIMIT: false, // limite de projetos ativos (futuro)

  // HÁBITOS E CALENDÁRIO
  HABIT_TRACKING: true, // módulo de hábitos
  CAL_EVENTOS: true, // calendário de eventos
  CAL_LEMBRETES_PUSH: false, // push de lembrete de evento (futuro — depende de VAPID)

  // BRIEF
  BRIEF_DIARIO: true, // tela de brief
  BRIEF_PUSH_630: false, // push às 6h30 (futuro — depende de cron + VAPID)

  // UI
  UI_BUSCA_UNIVERSAL: true, // campo de busca no header
  UI_VOZ_BUSCA: true, // microfone na busca
  UI_ANIMACOES: true, // animações (desligar em devices lentos)
  UI_ONBOARDING: false, // tour guiado (futuro)

  // EXPERIMENTOS (A/B empírico)
  EXP_CARD_COMPACTO: true, // cards compactos vs expandidos na lista
  EXP_BRIEF_NO_TOPO: false, // resumo do brief na tela de projetos (futuro)
  EXP_ACOES_RAPIDAS: false, // atalhos rápidos flutuantes no mobile (futuro)
}

export function isEnabled(flag) {
  return FEATURES[flag] === true
}
