/** Admin-configurable pay-per-use gates (`app_settings.feature_gates`). */

import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'
import {
  DEFAULT_FEATURE_GATES,
  defaultFeatureGates,
  GATED_FEATURE_DESCRIPTIONS,
  GATED_FEATURE_IDS,
  GATED_FEATURE_LABELS,
  isPaymentRequired,
  type FeatureGates,
  type GatedFeatureId,
} from './featureGateDefs'

export {
  DEFAULT_FEATURE_GATES,
  defaultFeatureGates,
  GATED_FEATURE_DESCRIPTIONS,
  GATED_FEATURE_IDS,
  GATED_FEATURE_LABELS,
  isPaymentRequired,
  type FeatureGates,
  type GatedFeatureId,
}

export const FEATURE_GATES_KEY = 'feature_gates'

const STUB_KEY = 'steigerbuis.feature_gates'

function parseGates(raw: unknown): FeatureGates {
  const base = defaultFeatureGates()
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return base
  const obj = raw as Record<string, unknown>
  for (const id of GATED_FEATURE_IDS) {
    if (typeof obj[id] === 'boolean') base[id] = obj[id]
  }
  return base
}

export function readStubFeatureGates(): FeatureGates {
  try {
    const raw = localStorage.getItem(STUB_KEY)
    if (!raw) return defaultFeatureGates()
    return parseGates(JSON.parse(raw) as unknown)
  } catch {
    return defaultFeatureGates()
  }
}

export function writeStubFeatureGates(gates: FeatureGates): void {
  try {
    localStorage.setItem(STUB_KEY, JSON.stringify(gates))
  } catch {
    /* private mode */
  }
}

export async function fetchFeatureGates(): Promise<FeatureGates> {
  if (!isSupabaseConfigured()) return readStubFeatureGates()
  const supabase = getSupabase()
  if (!supabase) return defaultFeatureGates()
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', FEATURE_GATES_KEY)
    .maybeSingle()
  if (error) {
    console.warn('feature_gates fetch', error.message)
    return defaultFeatureGates()
  }
  if (data == null) return defaultFeatureGates()
  return parseGates(data.value)
}

export async function saveFeatureGates(gates: FeatureGates): Promise<void> {
  const normalized = parseGates(gates)
  if (!isSupabaseConfigured()) {
    writeStubFeatureGates(normalized)
    return
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')
  const { error } = await supabase.rpc('set_app_setting', {
    p_key: FEATURE_GATES_KEY,
    p_value: normalized,
  })
  if (error) throw error
}
