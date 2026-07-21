/** Permanent account-wide unlocks (only download_model when no cloud model id). */

import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'
import { GATED_FEATURE_IDS, type GatedFeatureId } from './featureGates'

export interface AccountFeatureGrant {
  user_id: string
  feature_key: GatedFeatureId
  payment_id?: string | null
  amount_cents?: number | null
  created_at?: string
}

const STUB_KEY = 'steigerbuis.account_feature_grants'
const ACCOUNT_KEYS = new Set<GatedFeatureId>(['download_model'])

function isFeatureKey(v: string): v is GatedFeatureId {
  return (GATED_FEATURE_IDS as readonly string[]).includes(v) && ACCOUNT_KEYS.has(v as GatedFeatureId)
}

function readStubGrants(): AccountFeatureGrant[] {
  try {
    const raw = localStorage.getItem(STUB_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (g): g is AccountFeatureGrant =>
        !!g &&
        typeof g === 'object' &&
        typeof (g as AccountFeatureGrant).user_id === 'string' &&
        typeof (g as AccountFeatureGrant).feature_key === 'string' &&
        isFeatureKey((g as AccountFeatureGrant).feature_key),
    )
  } catch {
    return []
  }
}

function writeStubGrants(grants: AccountFeatureGrant[]): void {
  try {
    localStorage.setItem(STUB_KEY, JSON.stringify(grants))
  } catch {
    /* private mode */
  }
}

export function stubGrantAccountFeature(
  userId: string,
  feature: GatedFeatureId,
  amountCents?: number,
): void {
  if (!ACCOUNT_KEYS.has(feature)) return
  const list = readStubGrants()
  if (list.some((g) => g.user_id === userId && g.feature_key === feature)) return
  list.push({
    user_id: userId,
    feature_key: feature,
    amount_cents: amountCents ?? null,
    created_at: new Date().toISOString(),
  })
  writeStubGrants(list)
}

export async function fetchAccountFeatureGrants(): Promise<Set<GatedFeatureId>> {
  const empty = new Set<GatedFeatureId>()

  if (!isSupabaseConfigured()) {
    const sessionRaw = localStorage.getItem('steigerbuis.localStub.v1')
    let userId: string | null = null
    try {
      if (sessionRaw) {
        const store = JSON.parse(sessionRaw) as { sessionUserId?: string | null }
        userId = store.sessionUserId ?? null
      }
    } catch {
      /* ignore */
    }
    if (!userId) return empty
    return new Set(
      readStubGrants()
        .filter((g) => g.user_id === userId)
        .map((g) => g.feature_key),
    )
  }

  const supabase = getSupabase()
  if (!supabase) return empty

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user) return empty

  const { data, error } = await supabase
    .from('account_feature_grants')
    .select('feature_key')
    .eq('user_id', session.user.id)

  if (error) {
    console.warn('account_feature_grants fetch', error.message)
    return empty
  }

  const set = new Set<GatedFeatureId>()
  for (const row of data ?? []) {
    const key = String(row.feature_key ?? '')
    if (isFeatureKey(key)) set.add(key)
  }
  return set
}

export function hasAccountFeatureGrant(
  grants: Set<GatedFeatureId> | null | undefined,
  feature: GatedFeatureId,
): boolean {
  return Boolean(grants?.has(feature))
}
