import type { Profile } from '../auth/types'
import {
  DEFAULT_FEATURE_GATES,
  FALLBACK_EXPORT_ONCE_FEATURES,
  FALLBACK_PAID_FEATURES,
  isPaymentRequired,
  type FeatureGates,
  type GatedFeatureId,
} from './featureGateDefs'
import { PAID_PLAN_AMOUNT_EUR } from './planPricing'

type PlanFeaturesRow = { slug: string; features: readonly string[] }

/**
 * Client-side mirror of Paid entitlement (monthly).
 * Server RPCs / RLS remain authoritative for cloud mutations.
 */
export function isEntitledPaid(
  profile: Pick<Profile, 'is_paid' | 'paid_until'> | null | undefined,
): boolean {
  if (!profile?.is_paid) return false
  if (!profile.paid_until) return true
  return new Date(profile.paid_until).getTime() > Date.now()
}

export function hasExportPack(
  profile: Pick<Profile, 'export_pack'> | null | undefined,
): boolean {
  return Boolean(profile?.export_pack)
}

export function hasPaidOrExportEntitlement(
  profile: Profile | null | undefined,
): boolean {
  return isEntitledPaid(profile) || hasExportPack(profile)
}

function resolvePlanFeatures(
  profile: Profile | null | undefined,
  plans: readonly PlanFeaturesRow[] | null | undefined,
): string[] {
  const slug = profile?.subscription_plan_slug?.trim()
  if (slug && plans?.length) {
    const plan = plans.find((p) => p.slug === slug)
    if (plan) return [...plan.features]
  }
  if (isEntitledPaid(profile)) {
    return [...FALLBACK_PAID_FEATURES]
  }
  if (hasExportPack(profile)) {
    return [...FALLBACK_EXPORT_ONCE_FEATURES]
  }
  return []
}

/**
 * Does the user's current plan include this subscription feature flag?
 * Requires active Paid for subscription flags (except when reading free plan features).
 */
export function hasPlanFeature(
  flag: string,
  profile: Profile | null | undefined,
  plans?: readonly PlanFeaturesRow[] | null,
): boolean {
  if (!isEntitledPaid(profile) && !hasExportPack(profile)) {
    // Free / guest: only features on their assigned free plan (usually none)
    const features = resolvePlanFeatures(profile, plans)
    return features.includes(flag)
  }
  if (hasExportPack(profile) && !isEntitledPaid(profile)) {
    return FALLBACK_EXPORT_ONCE_FEATURES.includes(
      flag as (typeof FALLBACK_EXPORT_ONCE_FEATURES)[number],
    )
  }
  return resolvePlanFeatures(profile, plans).includes(flag)
}

/** Map pay-per-use gates → plan feature flags that cover them while subscribed. */
export function planFeaturesCoveringGate(feature: GatedFeatureId): string[] {
  switch (feature) {
    case 'full_print':
      return ['full_print']
    case 'copy_order_list':
      return ['copy_order_list']
    case 'bom_print':
      return ['full_print', 'copy_order_list']
    case 'download_model':
      return ['download_model', 'cloud_save']
    case 'full_pdf':
      return ['full_pdf']
    default:
      return []
  }
}

function planHasCoveringFeature(
  planFeatures: readonly string[] | null | undefined,
  feature: GatedFeatureId,
): boolean {
  const needed = planFeaturesCoveringGate(feature)
  if (needed.length === 0) return false
  const set = new Set(planFeatures ?? [])
  return needed.some((f) => set.has(f))
}

export function hasActiveSubscriptionCovering(
  feature: GatedFeatureId,
  profile: Profile | null | undefined,
  plans?: readonly PlanFeaturesRow[] | null,
): boolean {
  if (hasExportPack(profile)) {
    return planHasCoveringFeature(FALLBACK_EXPORT_ONCE_FEATURES, feature)
  }
  if (!isEntitledPaid(profile)) return false
  return planHasCoveringFeature(resolvePlanFeatures(profile, plans), feature)
}

export interface GatedAccessOptions {
  hasModelGrant?: boolean
  hasAccountGrant?: boolean
  plans?: readonly PlanFeaturesRow[] | null
}

/**
 * Pay-per-use gate check (Betaalde functies).
 * Gate off → allow everyone.
 * Gate on → subscription covering feature OR export_pack OR durable grant.
 */
export function canAccessGatedFeature(
  feature: GatedFeatureId,
  profile: Profile | null | undefined,
  gates: FeatureGates | null | undefined = DEFAULT_FEATURE_GATES,
  options?: GatedAccessOptions,
): boolean {
  if (!isPaymentRequired(feature, gates)) return true
  if (options?.hasModelGrant) return true
  if (options?.hasAccountGrant) return true
  return hasActiveSubscriptionCovering(feature, profile, options?.plans)
}

export function canPrintFullFootprint(
  profile: Profile | null | undefined,
  gates?: FeatureGates | null,
  options?: GatedAccessOptions,
): boolean {
  return canAccessGatedFeature('full_print', profile, gates, options)
}

export function canPrintFullBuildInstructions(
  profile: Profile | null | undefined,
  gates?: FeatureGates | null,
  options?: GatedAccessOptions,
): boolean {
  return canPrintFullFootprint(profile, gates, options)
}

export function canCopyOrderList(
  profile: Profile | null | undefined,
  gates?: FeatureGates | null,
  options?: GatedAccessOptions,
): boolean {
  return canAccessGatedFeature('copy_order_list', profile, gates, options)
}

export function canPrintBomList(
  profile: Profile | null | undefined,
  gates?: FeatureGates | null,
  options?: GatedAccessOptions,
): boolean {
  return canAccessGatedFeature('bom_print', profile, gates, options)
}

export function canDownloadModel(
  profile: Profile | null | undefined,
  gates?: FeatureGates | null,
  options?: GatedAccessOptions,
): boolean {
  return canAccessGatedFeature('download_model', profile, gates, options)
}

export function canPrintFullPdf(
  profile: Profile | null | undefined,
  gates?: FeatureGates | null,
  options?: GatedAccessOptions,
): boolean {
  return canAccessGatedFeature('full_pdf', profile, gates, options)
}

/**
 * Subscription plan features (Abonnementen-tab) — NOT pay-per-use.
 * Open from disk: plan flag `open_from_disk` or legacy `cloud_save` while Paid.
 */
export function canOpenFromDisk(
  profile: Profile | null | undefined,
  plans?: readonly PlanFeaturesRow[] | null,
): boolean {
  if (!isEntitledPaid(profile)) return false
  const features = resolvePlanFeatures(profile, plans)
  return features.includes('open_from_disk') || features.includes('cloud_save')
}

/** @deprecated */
export const canImportFromDisk = canOpenFromDisk

export function canPublishModel(
  profile: Profile | null | undefined,
  plans?: readonly PlanFeaturesRow[] | null,
): boolean {
  if (!isEntitledPaid(profile)) return false
  return resolvePlanFeatures(profile, plans).includes('publish')
}

export function canForkModel(
  profile: Profile | null | undefined,
  plans?: readonly PlanFeaturesRow[] | null,
): boolean {
  if (!isEntitledPaid(profile)) return false
  return resolvePlanFeatures(profile, plans).includes('fork')
}

/**
 * Cloud save is allowed for logged-in free users within max_private_models.
 * Plan flag `cloud_save` is informational for paid tiers; hard block only when
 * free limit is 0 and not paid — enforced by save_model RPC.
 */
export function canCloudSave(
  profile: Profile | null | undefined,
  _plans?: readonly PlanFeaturesRow[] | null,
): boolean {
  // Login required is enforced in UI; free tier uses resolvePrivateModelLimit.
  return Boolean(profile)
}

export const isPaidEntitled = isEntitledPaid

export function remainingFreeSaves(
  currentPrivateCount: number,
  profile: Profile | null | undefined,
  limit = 3,
): number | null {
  if (isEntitledPaid(profile)) return null
  return Math.max(0, limit - currentPrivateCount)
}

export function resolvePrivateModelLimit(
  profile: Pick<Profile, 'is_paid' | 'paid_until' | 'subscription_plan_slug'> | null | undefined,
  plans: readonly {
    slug: string
    max_private_models: number | null
    is_default?: boolean
    kind?: string
    price_cents?: number
  }[] | null | undefined,
  freeLimit = 3,
): number | null {
  if (isEntitledPaid(profile)) {
    const slug = profile?.subscription_plan_slug?.trim() || 'paid_monthly'
    const plan = plans?.find((p) => p.slug === slug)
    if (!plan) return null
    return plan.max_private_models
  }
  const assigned = profile?.subscription_plan_slug?.trim()
  if (assigned && plans?.length) {
    const plan = plans.find((p) => p.slug === assigned)
    if (plan) return plan.max_private_models ?? freeLimit
  }
  const freePlan =
    plans?.find((p) => p.is_default) ??
    plans?.find((p) => p.kind === 'free' || p.slug === 'free' || p.slug === 'gratis') ??
    plans?.find((p) => (p.price_cents ?? 1) <= 0)
  if (freePlan) return freePlan.max_private_models ?? freeLimit
  return freeLimit
}

export function remainingPrivateSaves(
  currentPrivateCount: number,
  limit: number | null,
): number | null {
  if (limit == null) return null
  return Math.max(0, limit - currentPrivateCount)
}

export const PAID_PLAN_LABEL =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_PAID_PLAN_LABEL?.trim()) ||
  'Basis account'

export const PAID_PLAN_PRICE_HINT =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_PAID_PLAN_PRICE_HINT?.trim()) ||
  `€${PAID_PLAN_AMOUNT_EUR.replace('.00', '')} / maand · via Mollie (iDEAL/creditcard)`

export const EXPORT_PACK_LABEL = 'Blijvende printtoegang'
export const EXPORT_PACK_PRICE_HINT =
  'Eerdere aankoop · blijvende toegang (geen abonnement)'
