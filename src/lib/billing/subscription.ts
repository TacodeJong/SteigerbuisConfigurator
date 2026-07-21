import { ApiError } from '../apiErrors'
import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'
import { stubCancelSubscription } from '../auth/localStubStore'
import type { Profile } from '../auth/types'
import type { CheckoutPlan } from './planPricing'
import { isEntitledPaid } from './entitlements'
import {
  defaultPlanSlug,
  defaultSubscriptionPlans,
  FALLBACK_PLAN_DISPLAY_NAMES,
  findPlanBySlug,
  FREE_PLAN_SLUG,
  isFreePlan,
  isVirtualFreePlan,
  planDisplayName,
  planHasPrintEntitlement,
  comparePlansByTier,
  type PlanKind,
  type SubscriptionPlan,
} from './plans'

export type SubscriptionStatus =
  | 'active'
  | 'pending'
  | 'canceled'
  | 'expired'
  | 'suspended'
  | 'failed'
  | null

/** @deprecated Prefer FALLBACK_PLAN_DISPLAY_NAMES from plans.ts */
export const FALLBACK_PLAN_NAMES = FALLBACK_PLAN_DISPLAY_NAMES

export {
  planDisplayName,
  FALLBACK_PLAN_DISPLAY_NAMES,
}

/** Alias — zelfde als planDisplayName in plans.ts. */
export const resolvePlanDisplayName = planDisplayName

/** @deprecated Prefer planDisplayName(slug, plans). */
export function planLabel(
  slug: string | null | undefined,
  plans?: readonly SubscriptionPlan[] | null,
): string {
  return planDisplayName(slug, plans)
}

/**
 * Known checkout slug → subscription_plans.kind.
 * Prefer `planKindFromPlans` when an active plans list is available.
 */
export function planKindForSlug(slug: string | null | undefined): PlanKind | null {
  if (slug === 'export_once') return 'one_time'
  if (slug === 'paid_monthly') return 'subscription'
  return null
}

export function planKindFromPlans(
  slug: string | null | undefined,
  plans?: readonly SubscriptionPlan[] | null,
): PlanKind | null {
  if (!slug) return null
  const found = plans?.find((p) => p.slug === slug)
  if (found) return found.kind
  return planKindForSlug(slug)
}

export function isSubscriptionPlan(
  slug: string | null | undefined,
  plans?: readonly SubscriptionPlan[] | null,
): boolean {
  if (!slug || isFreePlan(slug)) return false
  const found = plans?.find((p) => p.slug === slug)
  if (found?.kind === 'free') return false
  return planKindFromPlans(slug, plans) === 'subscription'
}

export function isOneTimePlan(
  slug: string | null | undefined,
  plans?: readonly SubscriptionPlan[] | null,
): boolean {
  return planKindFromPlans(slug, plans) === 'one_time'
}

export function isCheckoutPlan(slug: string): slug is CheckoutPlan {
  return slug === 'paid_monthly' || slug === 'export_once'
}

/**
 * Infer current product from profile fields (slug preferred).
 * Empty subscription_plan_slug + is_paid → paid_monthly.
 * Paid entitlement wins over export when both are active.
 */
export function currentPlanSlug(
  profile: Profile | null | undefined,
  plans?: readonly SubscriptionPlan[] | null,
): string | null {
  if (!profile) return null

  if (isEntitledPaid(profile)) {
    const slug = profile.subscription_plan_slug?.trim() || null
    if (slug && isOneTimePlan(slug, plans)) return 'paid_monthly'
    return slug || 'paid_monthly'
  }

  const slug = profile.subscription_plan_slug?.trim() || null
  if (slug === 'export_once' && profile.export_pack) return 'export_once'
  if (slug === 'paid_monthly' && profile.subscription_status === 'canceled') {
    return null
  }
  if (profile.export_pack) return 'export_once'
  return null
}

/** Abonnement-regel: nooit een one_time-product als “huidig abonnement”. */
export function currentSubscriptionLabel(
  profile: Profile | null | undefined,
  plans?: readonly SubscriptionPlan[] | null,
): string {
  if (!isEntitledPaid(profile)) return 'Geen abonnement'
  const slug = currentPlanSlug(profile, plans) ?? 'paid_monthly'
  return planDisplayName(slug, plans)
}

/**
 * Legacy account-wide export_pack (oude “Betaal per keer”-aankoop).
 * Geen abonnement — alleen statuslabel in Jouw toegang.
 */
export function currentOneTimeLabel(
  profile: Profile | null | undefined,
  _plans?: readonly SubscriptionPlan[] | null,
): string | null {
  if (!profile) return null
  if (isEntitledPaid(profile)) return null
  if (profile.export_pack) {
    return 'Blijvende printtoegang (eerdere aankoop)'
  }
  return null
}

export function subscriptionStatusLabel(status: SubscriptionStatus | string | null | undefined): string {
  switch (status) {
    case 'active':
      return 'Actief'
    case 'pending':
      return 'In afwachting'
    case 'canceled':
      return 'Geannuleerd'
    case 'suspended':
      return 'Opgeschort'
    case 'failed':
      return 'Mislukt'
    case 'expired':
      return 'Verlopen'
    default:
      return '—'
  }
}

export function formatPeriodEnd(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function activePlansOfKind(
  kind: PlanKind,
  plans?: readonly SubscriptionPlan[] | null,
): SubscriptionPlan[] {
  const source =
    plans && plans.length > 0 ? plans : defaultSubscriptionPlans()
  return source.filter(
    (p) => p.is_active !== false && p.kind === kind && !isFreePlan(p),
  )
}

/**
 * Andere actieve subscription-plans om naartoe te wisselen / upgraden.
 * One_time-plannen horen hier niet in.
 */
export function switchableSubscriptionPlans(
  current: string | null,
  plans?: readonly SubscriptionPlan[] | null,
): SubscriptionPlan[] {
  const list = activePlansOfKind('subscription', plans)
  if (current && isSubscriptionPlan(current, plans)) {
    return list.filter((p) => p.slug !== current)
  }
  return [...list]
}

/**
 * Huidig subscription-plan opnieuw betalen / verlengen wanneer er geen
 * andere subscription-alternatieven zijn (typisch: alleen paid_monthly).
 */
export function renewSubscriptionPlan(
  current: string | null,
  plans?: readonly SubscriptionPlan[] | null,
): SubscriptionPlan | null {
  if (!current || !isSubscriptionPlan(current, plans)) return null
  const list = activePlansOfKind('subscription', plans)
  const mine = list.find((p) => p.slug === current)
  if (mine) return mine
  // Fallback when plans list omits current but slug is known
  if (isCheckoutPlan(current)) {
    return (
      defaultSubscriptionPlans().find((p) => p.slug === current) ?? null
    )
  }
  return null
}

/**
 * True when Betaal-per-keer overbodig is: actief abonnement dekt full_print
 * (of onbekend paid plan → ga uit van inbegrepen).
 */
export function isOneTimeExportIncluded(
  profile: Profile | null | undefined,
  plans?: readonly SubscriptionPlan[] | null,
): boolean {
  if (!isEntitledPaid(profile)) return false
  const slug =
    profile?.subscription_plan_slug?.trim() ||
    currentPlanSlug(profile, plans) ||
    'paid_monthly'
  if (isOneTimePlan(slug, plans)) return false
  const catalog =
    plans && plans.length > 0 ? plans : defaultSubscriptionPlans()
  const plan = findPlanBySlug([...catalog], slug)
  if (plan) return planHasPrintEntitlement(plan.features)
  // Legacy / onbekend paid plan: export zit standaard in abonnement
  return true
}

/** Alias — zelfde check als isOneTimeExportIncluded. */
export const isOneTimeRedundant = isOneTimeExportIncluded

/**
 * Eenmalige producten (kind === one_time) — geen abonnement-wissel.
 * Verborgen wanneer al inbegrepen bij abonnement, of wanneer export_pack al actief is.
 */
export function availableOneTimePlans(
  current: string | null,
  profile: Profile | null | undefined,
  plans?: readonly SubscriptionPlan[] | null,
): SubscriptionPlan[] {
  const list = activePlansOfKind('one_time', plans)
  if (isOneTimeExportIncluded(profile, plans)) return []
  if (current && isOneTimePlan(current, plans)) return []
  if (profile?.export_pack) return []
  return [...list]
}

/**
 * Welke Upgrade-kaart “Huidig” is voor de ingelogde user.
 * Gratis | subscription-slug. export_pack is geen plan-kaart meer
 * (blijft wel entitlement; zie currentOneTimeLabel / Jouw toegang).
 */
export function activeUpgradeCardSlug(
  profile: Profile | null | undefined,
  plans?: readonly SubscriptionPlan[] | null,
): string | null {
  if (!profile) return null
  if (isEntitledPaid(profile)) {
    const slug = currentPlanSlug(profile, plans)
    if (slug && isSubscriptionPlan(slug, plans)) return slug
    return slug || 'paid_monthly'
  }
  const stored = profile.subscription_plan_slug?.trim() || null
  if (stored && isFreePlan(stored)) return stored
  // export_pack alleen: toon Gratis als huidige kaart (geen one_time-kaart)
  return defaultPlanSlug(plans)
}

export { isVirtualFreePlan, isFreePlan, FREE_PLAN_SLUG, defaultPlanSlug }

/** Actieve subscription-plannen (feature-score → sort_order → prijs). */
export function activeSubscriptionPlans(
  plans?: readonly SubscriptionPlan[] | null,
): SubscriptionPlan[] {
  return [...activePlansOfKind('subscription', plans)].sort(comparePlansByTier)
}

/** Actieve one_time-plannen (typisch export_once). */
export function activeOneTimePlans(
  plans?: readonly SubscriptionPlan[] | null,
): SubscriptionPlan[] {
  return [...activePlansOfKind('one_time', plans)].sort(comparePlansByTier)
}

/** @deprecated Gebruik switchableSubscriptionPlans + availableOneTimePlans. */
export function switchablePlans(current: CheckoutPlan | null): CheckoutPlan[] {
  const all: CheckoutPlan[] = ['paid_monthly', 'export_once']
  if (!current) return all
  return all.filter((p) => p !== current)
}

export interface CancelSubscriptionOptions {
  /** If true, clear Paid entitlement immediately. Default: keep until paid_until. */
  endImmediately?: boolean
}

/**
 * Cancel Paid subscription (stop intending to renew).
 * Local stub: updates profile in memory/localStorage.
 */
export async function cancelMySubscription(
  options: CancelSubscriptionOptions = {},
): Promise<Profile> {
  const endImmediately = Boolean(options.endImmediately)

  if (!isSupabaseConfigured()) {
    return stubCancelSubscription(endImmediately)
  }

  const supabase = getSupabase()
  if (!supabase) throw new ApiError('not_configured', 'Supabase ontbreekt.')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new ApiError('unauthorized', 'Log in om te annuleren.')

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

  const edgeRes = await fetch(`${supabaseUrl}/functions/v1/cancel-subscription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ end_immediately: endImmediately }),
  })
  const edgePayload = (await edgeRes.json().catch(() => ({}))) as {
    profile?: Profile
    error?: string
    message?: string
  }
  if (edgeRes.ok && edgePayload.profile) return edgePayload.profile

  const { data, error } = await supabase.rpc('cancel_my_subscription', {
    p_end_immediately: endImmediately,
  })
  if (error) {
    const msg = error.message || ''
    if (msg.includes('no_active_subscription')) {
      throw new ApiError('validation', 'Geen actief maandabonnement om te annuleren.')
    }
    if (msg.includes('not_authenticated')) {
      throw new ApiError('unauthorized', 'Log in om te annuleren.')
    }
    throw new ApiError('validation', msg || 'Annuleren mislukt.')
  }

  if (!data && edgePayload.message) {
    throw new ApiError('validation', edgePayload.message)
  }

  return data as Profile
}
