import { ApiError } from '../apiErrors'
import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'
import { stubSetExportPack, stubSetPaid, stubGetSession } from '../auth/localStubStore'
import { isCheckoutablePlan, isFreePlan } from './plans'
import type { GatedFeatureId } from './featureGates'
import { stubGrantModelFeature } from './modelFeatureGrants'
import { stubGrantAccountFeature } from './accountFeatureGrants'
import { fetchResolvedFeaturePriceCents } from './featurePrices'
import { PAID_FEATURE_AUTH_REASON } from './paidFeatureAuth'

export interface CheckoutResult {
  url: string | null
  checkoutUrl: string | null
  stubActivated?: boolean
  message?: string
  plan?: string
  recurring_stage?: string
  subscription_status?: string | null
  feature_grant?: { feature: GatedFeatureId; model_id: string }
  account_feature_grant?: { feature: GatedFeatureId }
}

export interface StartCheckoutOptions {
  discountCode?: string
  /**
   * Pay-per-use unlock (Betaalde functies only).
   * Prefer modelId → model_feature_grants.
   * download_model without modelId → account_feature_grants.
   */
  feature?: GatedFeatureId
  modelId?: string
}

export async function startCheckout(
  plan: string = 'paid_monthly',
  options: StartCheckoutOptions = {},
): Promise<CheckoutResult> {
  const planSlug = plan.trim() || 'paid_monthly'
  const feature = options.feature
  const modelId = options.modelId?.trim() || null

  if (feature && feature !== 'download_model' && !modelId) {
    throw new ApiError(
      'validation',
      'Sla het model eerst op in de cloud om deze functie per model te ontgrendelen.',
    )
  }

  if (!feature && (isFreePlan(planSlug) || !isCheckoutablePlan(planSlug))) {
    throw new ApiError('validation', 'Gratis abonnement vereist geen betaling.')
  }

  // All paid checkouts (subscription + pay-per-use) require a logged-in account.
  if (!isSupabaseConfigured()) {
    const session = stubGetSession()
    if (!session?.user) {
      throw new ApiError('unauthorized', PAID_FEATURE_AUTH_REASON)
    }
    const userId = session.user.id
    if (feature) {
      const cents = await fetchResolvedFeaturePriceCents(feature)
      if (feature === 'download_model' && !modelId) {
        stubGrantAccountFeature(userId, feature, cents)
        return {
          url: null,
          checkoutUrl: null,
          stubActivated: true,
          plan: 'feature_unlock',
          account_feature_grant: { feature },
          message: 'Lokale demo: download ontgrendeld account-breed.',
        }
      }
      if (modelId) {
        stubGrantModelFeature(userId, modelId, feature, cents)
        return {
          url: null,
          checkoutUrl: null,
          stubActivated: true,
          plan: 'feature_unlock',
          feature_grant: { feature, model_id: modelId },
          message: 'Lokale demo: functie ontgrendeld voor dit model (blijvend).',
        }
      }
    }
    if (planSlug === 'export_once') {
      stubSetExportPack(true)
      return {
        url: null,
        checkoutUrl: null,
        stubActivated: true,
        plan: planSlug,
        message: 'Lokale demo: Betaal per keer geactiveerd (geen Mollie).',
      }
    }
    stubSetPaid(true)
    return {
      url: null,
      checkoutUrl: null,
      stubActivated: true,
      plan: planSlug,
      message: 'Lokale demo: maandabonnement is geactiveerd (geen Mollie).',
    }
  }

  const supabase = getSupabase()
  if (!supabase) throw new ApiError('not_configured', 'Supabase ontbreekt.')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new ApiError('unauthorized', PAID_FEATURE_AUTH_REASON)

  const returnUrl =
    (import.meta.env.VITE_BILLING_RETURN_URL as string | undefined)?.trim() ||
    'https://steigerbuisontwerpen.nl/?billing=return'

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

  const body: Record<string, string> = {
    return_url: returnUrl,
    plan: feature ? 'export_once' : planSlug,
  }
  if (options.discountCode?.trim()) {
    body.discount_code = options.discountCode.trim()
  }
  if (feature) {
    body.feature = feature
    if (modelId) body.model_id = modelId
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/create-checkout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const payload = (await res.json().catch(() => ({}))) as {
    checkoutUrl?: string
    url?: string
    error?: string
    message?: string
    recurring_stage?: string
    subscription_status?: string | null
    plan?: string
  }

  if (!res.ok) {
    throw new ApiError(
      res.status === 401 ? 'unauthorized' : 'not_configured',
      payload.message ||
        payload.error ||
        `Checkout mislukt (HTTP ${res.status}). Controleer MOLLIE_API_KEY secret.`,
    )
  }

  const checkoutUrl = payload.checkoutUrl || payload.url || null
  if (!checkoutUrl && payload.recurring_stage !== 'subscription') {
    throw new ApiError('validation', payload.message || 'Geen checkout-URL ontvangen van Mollie.')
  }

  return {
    url: checkoutUrl,
    checkoutUrl,
    plan: payload.plan || (feature ? 'feature_unlock' : planSlug),
    message: payload.message,
    recurring_stage: payload.recurring_stage,
    subscription_status: payload.subscription_status,
    feature_grant: feature && modelId ? { feature, model_id: modelId } : undefined,
    account_feature_grant:
      feature === 'download_model' && !modelId ? { feature } : undefined,
  }
}
