/** Mollie test/live mode from app_settings (keys stay in Edge secrets). */

import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'

export const MOLLIE_MODE_SETTING_KEY = 'mollie_mode'

export type MollieMode = 'test' | 'live'

const DEFAULT_MODE: MollieMode = 'test'

export function parseMollieMode(value: unknown): MollieMode | null {
  if (value === 'test' || value === 'live') return value
  if (typeof value === 'string') {
    const t = value.trim().replace(/^"|"$/g, '')
    if (t === 'test' || t === 'live') return t
  }
  return null
}

/** Default test when unset / local stub. */
export function defaultMollieMode(): MollieMode {
  return DEFAULT_MODE
}

export async function fetchMollieMode(): Promise<MollieMode> {
  if (!isSupabaseConfigured()) return defaultMollieMode()
  const supabase = getSupabase()
  if (!supabase) return defaultMollieMode()

  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', MOLLIE_MODE_SETTING_KEY)
    .maybeSingle()

  if (error) {
    console.warn('mollie_mode fetch', error.message)
    return defaultMollieMode()
  }

  return parseMollieMode(data?.value) ?? defaultMollieMode()
}

export async function saveMollieMode(mode: MollieMode): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Mollie-modus opslaan vereist Supabase.')
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')

  if (mode !== 'test' && mode !== 'live') {
    throw new Error('Ongeldige Mollie-modus (test of live).')
  }

  const { error } = await supabase.rpc('set_app_setting', {
    p_key: MOLLIE_MODE_SETTING_KEY,
    p_value: mode,
  })
  if (error) throw error
}
