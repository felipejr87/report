import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// Cliente base (para chamadas sem JWT de espaço, ex: Edge Functions de entrada)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Cliente autenticado com JWT do espaço (para operações em projetos/atividades)
export function supabaseEspaco(token) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })
}

export function urlFuncao(nome) {
  return `${SUPABASE_URL}/functions/v1/${nome}`
}
