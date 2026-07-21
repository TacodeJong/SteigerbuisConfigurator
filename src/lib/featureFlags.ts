import { getSupabase, isSupabaseConfigured } from './auth/supabaseClient'

const PLANKS_KEY = 'planks_enabled'
const STUB_PLANKS_KEY = 'steigerbuis.feature.planks'

/** Local-stub / offline default (planks on). */
export function readStubPlanksEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STUB_PLANKS_KEY)
    if (raw === '0' || raw === 'false') return false
    if (raw === '1' || raw === 'true') return true
  } catch {
    /* private mode */
  }
  return true
}

export function writeStubPlanksEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STUB_PLANKS_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export async function fetchPlanksEnabled(): Promise<boolean> {
  if (!isSupabaseConfigured()) return readStubPlanksEnabled()
  const supabase = getSupabase()
  if (!supabase) return true
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', PLANKS_KEY)
    .maybeSingle()
  if (error) {
    console.warn('app_settings fetch', error.message)
    return true
  }
  if (data == null) return true
  return data.value !== false && data.value !== 'false'
}

/** Persist site-wide (Supabase) or stub local setting. Requires admin on server. */
export async function setPlanksEnabledRemote(enabled: boolean): Promise<void> {
  if (!isSupabaseConfigured()) {
    writeStubPlanksEnabled(enabled)
    return
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')
  const { error } = await supabase.rpc('set_app_setting', {
    p_key: PLANKS_KEY,
    p_value: enabled,
  })
  if (error) throw error
}
