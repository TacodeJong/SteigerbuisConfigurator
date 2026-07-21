/** Permanent per-model unlocks after pay-per-feature checkout. */

import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'
import type { GatedFeatureId } from './featureGates'
import { GATED_FEATURE_IDS } from './featureGates'

export interface ModelFeatureGrant {
  user_id: string
  model_id: string
  feature_key: GatedFeatureId
  payment_id?: string | null
  amount_cents?: number | null
  created_at?: string
}

const STUB_KEY = 'steigerbuis.model_feature_grants'

function isFeatureKey(v: string): v is GatedFeatureId {
  return (GATED_FEATURE_IDS as readonly string[]).includes(v)
}

function readStubGrants(): ModelFeatureGrant[] {
  try {
    const raw = localStorage.getItem(STUB_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (g): g is ModelFeatureGrant =>
        !!g &&
        typeof g === 'object' &&
        typeof (g as ModelFeatureGrant).user_id === 'string' &&
        typeof (g as ModelFeatureGrant).model_id === 'string' &&
        typeof (g as ModelFeatureGrant).feature_key === 'string' &&
        isFeatureKey((g as ModelFeatureGrant).feature_key),
    )
  } catch {
    return []
  }
}

function writeStubGrants(grants: ModelFeatureGrant[]): void {
  try {
    localStorage.setItem(STUB_KEY, JSON.stringify(grants))
  } catch {
    /* private mode */
  }
}

/** Local demo: permanently unlock a feature for a model. */
export function stubGrantModelFeature(
  userId: string,
  modelId: string,
  feature: GatedFeatureId,
  amountCents?: number,
): void {
  const list = readStubGrants()
  if (list.some((g) => g.user_id === userId && g.model_id === modelId && g.feature_key === feature)) {
    return
  }
  list.push({
    user_id: userId,
    model_id: modelId,
    feature_key: feature,
    amount_cents: amountCents ?? null,
    created_at: new Date().toISOString(),
  })
  writeStubGrants(list)
}

export async function fetchModelFeatureGrants(
  modelId: string | null | undefined,
): Promise<Set<GatedFeatureId>> {
  const empty = new Set<GatedFeatureId>()
  if (!modelId?.trim()) return empty

  if (!isSupabaseConfigured()) {
    const grants = readStubGrants().filter((g) => g.model_id === modelId)
    return new Set(grants.map((g) => g.feature_key))
  }

  const supabase = getSupabase()
  if (!supabase) return empty

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user) return empty

  const { data, error } = await supabase
    .from('model_feature_grants')
    .select('feature_key')
    .eq('model_id', modelId)
    .eq('user_id', session.user.id)

  if (error) {
    console.warn('model_feature_grants fetch', error.message)
    return empty
  }

  const set = new Set<GatedFeatureId>()
  for (const row of data ?? []) {
    const key = String(row.feature_key ?? '')
    if (isFeatureKey(key)) set.add(key)
  }
  return set
}

export function hasModelFeatureGrant(
  grants: Set<GatedFeatureId> | null | undefined,
  feature: GatedFeatureId,
): boolean {
  return Boolean(grants?.has(feature))
}
