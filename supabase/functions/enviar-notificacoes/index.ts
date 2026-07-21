import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-cron-secret',
}

// Chamada só pelo pg_cron (via pg_net), nunca por um usuário — não tem
// JWT de espaço, então a autorização é um secret compartilhado no
// header, comparado contra o secret desta função (mesmo valor guardado
// em vault.secrets como 'jarvis_cron_secret', usado pela migration do
// cron job).
function autorizado(req: Request): boolean {
  const secret = Deno.env.get('CRON_SECRET')
  return !!secret && req.headers.get('x-cron-secret') === secret
}

type TipoNotif = 'ponto_entrada' | 'ponto_saida' | 'brief_horario'

function mensagemPara(tipo: TipoNotif) {
  switch (tipo) {
    case 'ponto_entrada':
      return { titulo: 'Bom dia, Felipe', corpo: 'Início do expediente. Dá uma olhada na agenda do dia com o Jarvis.' }
    case 'ponto_saida':
      return { titulo: 'Fim do expediente', corpo: 'Hora de fechar o dia — veja o que ficou pendente.' }
    case 'brief_horario':
      return { titulo: 'Briefing do dia', corpo: 'Clima, agenda e prioridades de hoje já estão prontos.' }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  if (!autorizado(req)) {
    return new Response(JSON.stringify({ ok: false, erro: 'Não autorizado.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
    if (!vapidPublic || !vapidPrivate) {
      console.error('[enviar-notificacoes] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas')
      return new Response(JSON.stringify({ ok: false, erro: 'VAPID não configurado.' }), {
        status: 501,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    webpush.setVapidDetails('mailto:felipejr1@gmail.com', vapidPublic, vapidPrivate)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const agora = new Date()
    // Todo horário configurado (ponto_entrada/saida, brief_horario) e o
    // dia da semana são avaliados no fuso do próprio espaço.
    const { data: configs } = await supabase.from('jarvis_notif_config').select('*').eq('ativo', true)

    let disparados = 0
    let enviados = 0

    for (const cfg of configs || []) {
      const tz = cfg.timezone || 'America/Sao_Paulo'
      const horaAtual = agora.toLocaleTimeString('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
      const dataLocal = new Date(agora.toLocaleString('en-US', { timeZone: tz }))
      const diaSemanaLocal = dataLocal.getDay() // 0=dom ... 6=sáb, igual à convenção de dias_uteis
      const hojeStr = dataLocal.toISOString().split('T')[0]

      if (cfg.dias_uteis?.length && !cfg.dias_uteis.includes(diaSemanaLocal)) continue

      const candidatos: [TipoNotif, string | null][] = [
        ['ponto_entrada', cfg.ponto_entrada],
        ['ponto_saida', cfg.ponto_saida],
        ['brief_horario', cfg.brief_horario],
      ]

      for (const [tipo, horarioCfg] of candidatos) {
        if (!horarioCfg || horarioCfg.slice(0, 5) !== horaAtual) continue
        disparados++

        // Idempotência atômica — se já existe log de hoje pra esse tipo,
        // o insert conflita e não retorna linha, então pula sem enviar de novo.
        const { data: log, error: erroLog } = await supabase
          .from('jarvis_notif_log')
          .insert({ espaco_id: cfg.espaco_id, tipo, data_ref: hojeStr })
          .select('id')
          .single()
        if (erroLog || !log) continue

        const { data: subs } = await supabase
          .from('jarvis_push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('espaco_id', cfg.espaco_id)

        const { titulo, corpo } = mensagemPara(tipo)
        for (const sub of subs || []) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({ title: titulo, body: corpo, url: '/jarvis' })
            )
            enviados++
          } catch (e) {
            const status = (e as { statusCode?: number })?.statusCode
            console.error('[enviar-notificacoes] falha ao enviar', status, e)
            // 404/410 = subscription morta (usuário revogou/desinstalou) — limpa.
            if (status === 404 || status === 410) {
              await supabase.from('jarvis_push_subscriptions').delete().eq('id', sub.id)
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, disparados, enviados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('[enviar-notificacoes]', e)
    return new Response(JSON.stringify({ ok: false, erro: e instanceof Error ? e.message : 'Erro interno.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
