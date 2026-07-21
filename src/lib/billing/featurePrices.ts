/** Per-feature one-shot prices (centen). Missing → fall back to export_once. */

import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'
import { GATED_FEATURE_IDS, type GatedFeatureId } from './featureGates'
import { defaultPlanPrices, fetchPlanPrices } from './appPricing'

export const FEATURE_PRICES_KEY = 'feature_prices'

export type FeaturePrices = Record<GatedFeatureId, number | null>

const STUB_KEY = 'steigerbuis.feature_prices'

export function defaultFeaturePrices(): FeaturePrices {
  return {
    full_print: null,
    copy_order_list: null,
    bom_print: null,
    viewport_print: null,
    download_model: null,
    full_pdf: null,
  }
}

function parsePrices(raw: unknown): FeaturePrices {
  const base = defaultFeaturePrices()
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return base
  const obj = raw as Record<string, unknown>
  for (const id of GATED_FEATURE_IDS) {
    const v = obj[id]
    if (v == null) {
      base[id] = null
      continue
    }
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1) {
      base[id] = Math.round(v)
      continue
    }
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number.parseInt(v, 10)
      if (Number.isFinite(n) && n >= 1) base[id] = n
    }
  }
  return base
}

export function readStubFeaturePrices(): FeaturePrices {
  try {
    const raw = localStorage.getItem(STUB_KEY)
    if (!raw) return defaultFeaturePrices()
    return parsePrices(JSON.parse(raw) as unknown)
  } catch {
    return defaultFeaturePrices()
  }
}

export function writeStubFeaturePrices(prices: FeaturePrices): void {
  try {
    localStorage.setItem(STUB_KEY, JSON.stringify(parsePrices(prices)))
  } catch {
    /* private mode */
  }
}

export async function fetchFeaturePrices(): Promise<FeaturePrices> {
  if (!isSupabaseConfigured()) return readStubFeaturePrices()
  const supabase = getSupabase()
  if (!supabase) return defaultFeaturePrices()
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', FEATURE_PRICES_KEY)
    .maybeSingle()
  if (error) {
    console.warn('feature_prices fetch', error.message)
    return defaultFeaturePrices()
  }
  if (data == null) return defaultFeaturePrices()
  return parsePrices(data.value)
}

export async function saveFeaturePrices(prices: FeaturePrices): Promise<void> {
  const normalized = parsePrices(prices)
  if (!isSupabaseConfigured()) {
    writeStubFeaturePrices(normalized)
    return
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')
  const { error } = await supabase.rpc('set_app_setting', {
    p_key: FEATURE_PRICES_KEY,
    p_value: normalized,
  })
  if (error) throw error
}

export function resolveFeaturePriceCents(
  feature: GatedFeatureId,
  featurePrices: FeaturePrices | null | undefined,
  exportOnceCents: number,
): number {
  const specific = featurePrices?.[feature]
  if (typeof specific === 'number' && Number.isFinite(specific) && specific >= 1) {
    return Math.round(specific)
  }
  return Math.max(1, Math.round(exportOnceCents))
}

export async function fetchResolvedFeaturePriceCents(
  feature: GatedFeatureId,
): Promise<number> {
  const [fp, plans] = await Promise.all([fetchFeaturePrices(), fetchPlanPrices()])
  return resolveFeaturePriceCents(feature, fp, plans.exportOnceCents)
}

export { defaultPlanPrices }
