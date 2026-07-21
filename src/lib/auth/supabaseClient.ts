import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const viteEnv =
  typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    : undefined
const url = viteEnv?.VITE_SUPABASE_URL
const anonKey = viteEnv?.VITE_SUPABASE_ANON_KEY

/** True when Vite env has Supabase public credentials. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url?.trim() && anonKey?.trim())
}

let client: SupabaseClient | null = null

/** Returns null when Supabase is not configured (local stub mode). */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  if (!client) {
    client = createClient(url!.trim(), anonKey!.trim(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}
