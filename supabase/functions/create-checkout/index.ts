// Edge Function: create Mollie checkout for paid_monthly / export_once (+ future plan slugs)
// Amounts: subscription_plans → app_settings (cents) → env secrets → hardcoded defaults
// Optional discount_code / profile discount via resolve_checkout_discount RPC
// Mollie key: app_settings.mollie_mode → MOLLIE_API_KEY_TEST / _LIVE
// (legacy MOLLIE_API_KEY only if prefix matches mode; never silent cross-mode fallback)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  fetchMollieModeFromSettings,
  type MollieMode,
  resolveMollieApiKey,
} from '../_shared/mollieApiKey.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function centsToEur(cents: number): string {
  return (Math.max(1, Math.round(cents)) / 100).toFixed(2)
}

function parseSettingCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Math.round(value)
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number.parseInt(value, 10)
    if (Number.isFinite(n) && n >= 1) return n
  }
  return null
}

function applyDiscount(
  baseCents: number,
  discount: {
    percent_off?: number | null
    amount_off_cents?: number | null
  } | null,
): number {
  if (!discount) return baseCents
  let next = baseCents
  if (discount.percent_off != null && Number.isFinite(Number(discount.percent_off))) {
    next = Math.round(baseCents * (1 - Number(discount.percent_off) / 100))
  } else if (
    discount.amount_off_cents != null &&
    Number.isFinite(Number(discount.amount_off_cents))
  ) {
    next = baseCents - Math.round(Number(discount.amount_off_cents))
  }
  return Math.max(1, next)
}

type MollieCustomer = { id: string }
type MollieMandate = { id: string; status?: string }
type MollieSubscription = {
  id: string
  status?: string
  nextPaymentDate?: string | null
  _links?: { checkout?: { href?: string } }
}

async function mollieRequest(
  path: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; data: unknown }> {
  const res = await fetch(`https://api.mollie.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, status: res.status, data }
  return { ok: true, data: data as Record<string, unknown> }
}

function detailFromMollie(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Onbekende Mollie-fout'
  const obj = data as Record<string, unknown>
  const msg = obj.detail ?? obj.title ?? obj.message
  return typeof msg === 'string'
    ? msg
    : JSON.stringify(data).slice(0, 400)
}

function isNoSuitableMethodsError(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const detail = String((data as Record<string, unknown>).detail ?? '').toLowerCase()
  const title = String((data as Record<string, unknown>).title ?? '').toLowerCase()
  return (
    detail.includes('no suitable payment methods found') ||
    title.includes('no suitable payment methods found')
  )
}

function paymentMethodAdvice(mode: MollieMode): string {
  const dashboardMode = mode === 'live' ? 'live' : 'test'
  return (
    `Controleer in Mollie (${dashboardMode}) → Website profiles → Payment methods: ` +
    `zet Credit card aan voor recurring/mandates, en voor iDEAL-mandates ook SEPA Direct Debit. ` +
    `Alleen “actief voor one-off” is niet genoeg voor sequenceType=first. ` +
    `Wero ondersteunt (nog) geen Mollie-mandate/first payment voor abonnementen.`
  )
}

/**
 * Prefer NL-friendly first-payment methods when Mollie returns several.
 * Wero is intentionally absent: Mollie recurring docs do not list it for
 * sequenceType=first (mandates); iDEAL requires SEPA Direct Debit enabled.
 */
const FIRST_METHOD_PREFERENCE = ['ideal', 'bancontact', 'paybybank', 'creditcard', 'paypal'] as const

function sortFirstPaymentMethods(ids: string[]): string[] {
  const rank = new Map<string, number>(
    FIRST_METHOD_PREFERENCE.map((id, i) => [id, i]),
  )
  return [...ids].sort((a, b) => {
    const ra = rank.get(a) ?? 100
    const rb = rank.get(b) ?? 100
    if (ra !== rb) return ra - rb
    return a.localeCompare(b)
  })
}

function methodIdsFromListResponse(data: Record<string, unknown>): string[] {
  const methods =
    ((data as { _embedded?: { methods?: Array<{ id?: string }> } })._embedded?.methods ??
      []) as Array<{ id?: string }>
  return methods.map((m) => m.id).filter((id): id is string => typeof id === 'string' && id !== '')
}

type MethodsPreflight = {
  first: string[]
  oneoff: string[]
  firstOk: boolean
  oneoffOk: boolean
}

async function fetchMethodsPreflight(
  apiKey: string,
  amountValue: string,
): Promise<MethodsPreflight> {
  const base = new URLSearchParams()
  base.set('amount[value]', amountValue)
  base.set('amount[currency]', 'EUR')
  base.set('locale', 'nl_NL')

  const firstParams = new URLSearchParams(base)
  firstParams.set('sequenceType', 'first')
  const oneoffParams = new URLSearchParams(base)
  oneoffParams.set('sequenceType', 'oneoff')

  const [firstRes, oneoffRes] = await Promise.all([
    mollieRequest(`/v2/methods?${firstParams.toString()}`, apiKey),
    mollieRequest(`/v2/methods?${oneoffParams.toString()}`, apiKey),
  ])

  const first = firstRes.ok ? sortFirstPaymentMethods(methodIdsFromListResponse(firstRes.data)) : []
  const oneoff = oneoffRes.ok ? methodIdsFromListResponse(oneoffRes.data) : []

  console.log(
    JSON.stringify({
      event: 'mollie_methods_preflight',
      amount: amountValue,
      currency: 'EUR',
      sequenceType_first: first,
      sequenceType_oneoff: oneoff,
      first_empty: first.length === 0,
      first_http_ok: firstRes.ok,
      oneoff_http_ok: oneoffRes.ok,
    }),
  )

  return {
    first,
    oneoff,
    firstOk: firstRes.ok,
    oneoffOk: oneoffRes.ok,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json(401, { error: 'unauthorized', message: 'Geen Authorization-header.' })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
      ''
    const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
    const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://steigerbuisontwerpen.nl').replace(
      /\/$/,
      '',
    )

    if (!supabaseUrl || !anonKey) {
      return json(500, {
        error: 'misconfigured',
        message: 'SUPABASE_URL / ANON key ontbreekt op de Edge Function.',
      })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) {
      return json(401, {
        error: 'unauthorized',
        message: userErr?.message ?? 'Sessie ongeldig — opnieuw inloggen.',
      })
    }

    const body = (await req.json().catch(() => ({}))) as {
      plan?: string
      return_url?: string
      discount_code?: string
      /** Gated feature unlock scoped to one model (permanent grant). */
      feature?: string
      model_id?: string
    }
    const planSlug = (body.plan?.trim() || 'paid_monthly').toLowerCase()
    const discountCode = body.discount_code?.trim() || null
    // Pay-per-use only (Betaalde functies). open_from_disk / publish / fork = plan features.
    const PAY_PER_USE_KEYS = new Set([
      'full_print',
      'copy_order_list',
      'bom_print',
      'download_model',
    ])
    const featureKey =
      typeof body.feature === 'string' && PAY_PER_USE_KEYS.has(body.feature.trim())
        ? body.feature.trim()
        : null
    const modelId =
      typeof body.model_id === 'string' && body.model_id.trim()
        ? body.model_id.trim()
        : null
    const isFeatureUnlock = featureKey != null
    /** download_model without modelId → account grant; other pay-per-use → model grant. */
    const grantScope: 'model' | 'account' | null = !featureKey
      ? null
      : featureKey === 'download_model' && !modelId
        ? 'account'
        : modelId
          ? 'model'
          : null

    if (isFeatureUnlock && grantScope === 'model' && !modelId) {
      return json(400, {
        error: 'validation',
        message: 'Sla het model eerst op in de cloud om deze functie per model te ontgrendelen.',
      })
    }

    if (isFeatureUnlock && !grantScope) {
      return json(400, {
        error: 'validation',
        message:
          featureKey === 'download_model'
            ? 'Sla het model eerst op in de cloud, of ontgrendel download account-breed.'
            : 'Ongeldige feature-unlock aanvraag.',
      })
    }

    if (planSlug === 'free' || planSlug === 'gratis' || planSlug === '__free__') {
      return json(400, {
        error: 'free_plan',
        message: 'Gratis abonnement vereist geen betaling.',
      })
    }

    const settingsClient = serviceKey
      ? createClient(supabaseUrl, serviceKey)
      : userClient

    const settingsMode = await fetchMollieModeFromSettings(settingsClient)
    const mollieResolved = resolveMollieApiKey(settingsMode)
    if (!mollieResolved.ok) {
      return json(501, {
        error: 'billing_not_configured',
        message: mollieResolved.message,
        mollie_mode: mollieResolved.mode,
      })
    }
    const mollieKey = mollieResolved.apiKey
    const mollieMode = mollieResolved.mode

    // Feature unlock: verify no duplicate grant; price from feature_prices → export_once
    if (isFeatureUnlock && featureKey && grantScope === 'model' && modelId) {
      const { data: modelRow } = await settingsClient
        .from('models')
        .select('id')
        .eq('id', modelId)
        .maybeSingle()
      if (!modelRow) {
        return json(400, {
          error: 'validation',
          message: 'Model niet gevonden. Sla eerst op in de cloud.',
        })
      }

      const { data: existingGrant } = await settingsClient
        .from('model_feature_grants')
        .select('id')
        .eq('user_id', userData.user.id)
        .eq('model_id', modelId)
        .eq('feature_key', featureKey)
        .maybeSingle()
      if (existingGrant) {
        return json(400, {
          error: 'already_entitled',
          message: 'Deze functie is al ontgrendeld voor dit model.',
        })
      }

      // Active paid sub covering feature → no need to pay again
      const { data: profile } = await settingsClient
        .from('profiles')
        .select('is_paid, paid_until, export_pack, subscription_plan_slug')
        .eq('id', userData.user.id)
        .maybeSingle()

      if (profile?.export_pack && ['full_print', 'copy_order_list', 'bom_print'].includes(featureKey)) {
        return json(400, {
          error: 'already_entitled',
          message: 'Betaal per keer dekt deze functie al account-breed.',
        })
      }

      const paidUntil = profile?.paid_until ? new Date(String(profile.paid_until)).getTime() : null
      const paidActive =
        Boolean(profile?.is_paid) &&
        (paidUntil == null || Number.isNaN(paidUntil) || paidUntil > Date.now())

      if (paidActive) {
        const subSlug =
          (typeof profile?.subscription_plan_slug === 'string' &&
            profile.subscription_plan_slug.trim()) ||
          'paid_monthly'
        const { data: subPlan } = await settingsClient
          .from('subscription_plans')
          .select('features')
          .eq('slug', subSlug)
          .maybeSingle()
        const features = Array.isArray(subPlan?.features) ? (subPlan!.features as string[]) : []
        const covered =
          featureKey === 'bom_print'
            ? features.includes('full_print') || features.includes('copy_order_list')
            : featureKey === 'download_model'
              ? features.includes('download_model') ||
                features.includes('cloud_save') ||
                subPlan == null
              : features.includes(featureKey) || (subPlan == null && featureKey !== 'bom_print')
        if (covered) {
          return json(400, {
            error: 'already_entitled',
            message: 'Deze functie is al inbegrepen bij je abonnement.',
          })
        }
      }
    }

    // Account grant path: only download_model without modelId
    if (isFeatureUnlock && featureKey === 'download_model' && grantScope === 'account') {
      const { data: existingAccountGrant } = await settingsClient
        .from('account_feature_grants')
        .select('id')
        .eq('user_id', userData.user.id)
        .eq('feature_key', 'download_model')
        .maybeSingle()
      if (existingAccountGrant) {
        return json(400, {
          error: 'already_entitled',
          message: 'Downloaden is al ontgrendeld op dit account.',
        })
      }

      const { data: profile } = await settingsClient
        .from('profiles')
        .select('is_paid, paid_until, subscription_plan_slug')
        .eq('id', userData.user.id)
        .maybeSingle()

      const paidUntil = profile?.paid_until ? new Date(String(profile.paid_until)).getTime() : null
      const paidActive =
        Boolean(profile?.is_paid) &&
        (paidUntil == null || Number.isNaN(paidUntil) || paidUntil > Date.now())

      if (paidActive) {
        const subSlug =
          (typeof profile?.subscription_plan_slug === 'string' &&
            profile.subscription_plan_slug.trim()) ||
          'paid_monthly'
        const { data: subPlan } = await settingsClient
          .from('subscription_plans')
          .select('features')
          .eq('slug', subSlug)
          .maybeSingle()
        const features = Array.isArray(subPlan?.features) ? (subPlan!.features as string[]) : []
        const covered =
          features.includes('download_model') ||
          features.includes('cloud_save') ||
          subPlan == null
        if (covered) {
          return json(400, {
            error: 'already_entitled',
            message: 'Deze functie is al inbegrepen bij je abonnement.',
          })
        }
      }
    }

    // 1) subscription_plans (active) by slug
    let baseCents: number | null = null
    let planName: string | null = null
    let planKind: string | null = null
    const { data: planRow } = await settingsClient
      .from('subscription_plans')
      .select('slug, name, kind, price_cents, is_active, interval, features')
      .eq('slug', planSlug)
      .eq('is_active', true)
      .maybeSingle()

    if (
      !isFeatureUnlock &&
      planRow &&
      (planRow.kind === 'free' ||
        (typeof planRow.price_cents === 'number' && planRow.price_cents <= 0))
    ) {
      return json(400, {
        error: 'free_plan',
        message: 'Gratis abonnement vereist geen betaling.',
      })
    }

    if (planRow && typeof planRow.price_cents === 'number' && planRow.price_cents >= 1) {
      baseCents = Math.round(planRow.price_cents)
      planName = String(planRow.name || planSlug)
      planKind = String(planRow.kind || '')
    }

    // Feature-specific price overrides export_once when set in app_settings.feature_prices
    if (isFeatureUnlock && featureKey) {
      const { data: fpRow } = await settingsClient
        .from('app_settings')
        .select('value')
        .eq('key', 'feature_prices')
        .maybeSingle()
      const fpVal = fpRow?.value
      if (fpVal && typeof fpVal === 'object' && !Array.isArray(fpVal)) {
        const specific = parseSettingCents((fpVal as Record<string, unknown>)[featureKey])
        if (specific != null) {
          baseCents = specific
          planName = `Functie: ${featureKey}`
        }
      }
      // Ensure we still have export_once fallback below if baseCents null
      if (baseCents == null && planRow && typeof planRow.price_cents === 'number') {
        baseCents = Math.round(planRow.price_cents)
      }
    }

    // 2) Legacy app_settings for known slugs
    if (baseCents == null) {
      const priceKey =
        planSlug === 'export_once' || isFeatureUnlock
          ? 'price_export_once_cents'
          : 'price_paid_monthly_cents'
      const { data: settingRow } = await settingsClient
        .from('app_settings')
        .select('value')
        .eq('key', priceKey)
        .maybeSingle()
      baseCents = parseSettingCents(settingRow?.value)
    }

    // 3) Env → hardcoded defaults
    if (baseCents == null) {
      const envFallback =
        planSlug === 'export_once' || isFeatureUnlock
          ? (Deno.env.get('MOLLIE_EXPORT_AMOUNT') ?? '5.00').trim() || '5.00'
          : (Deno.env.get('MOLLIE_PAYMENT_AMOUNT') ?? '7.00').trim() || '7.00'
      let fromEnv = Math.round(Number.parseFloat(envFallback) * 100)
      if (!Number.isFinite(fromEnv) || fromEnv < 1) {
        fromEnv = planSlug === 'export_once' || isFeatureUnlock ? 500 : 700
      }
      baseCents = fromEnv
    }

    const isExport = isFeatureUnlock || planSlug === 'export_once' || planKind === 'one_time'
    const isSubscriptionPlan = !isExport

    // Weiger account-wide one_time als user al print/export heeft via paid abonnement of export_pack
    if (isExport && !isFeatureUnlock) {
      const { data: profile } = await settingsClient
        .from('profiles')
        .select('is_paid, paid_until, export_pack, subscription_plan_slug')
        .eq('id', userData.user.id)
        .maybeSingle()

      if (profile?.export_pack) {
        return json(400, {
          error: 'already_entitled',
          message: 'Betaal per keer is al actief op dit account.',
        })
      }

      const paidUntil = profile?.paid_until ? new Date(String(profile.paid_until)).getTime() : null
      const paidActive =
        Boolean(profile?.is_paid) &&
        (paidUntil == null || Number.isNaN(paidUntil) || paidUntil > Date.now())

      if (paidActive) {
        const subSlug =
          (typeof profile?.subscription_plan_slug === 'string' &&
            profile.subscription_plan_slug.trim()) ||
          'paid_monthly'
        const { data: subPlan } = await settingsClient
          .from('subscription_plans')
          .select('features, kind')
          .eq('slug', subSlug)
          .maybeSingle()

        const features = Array.isArray(subPlan?.features) ? subPlan.features : []
        const hasFullPrint =
          features.includes('full_print') ||
          // Onbekend paid plan: ga uit van print inbegrepen (legacy paid_monthly)
          subPlan == null

        if (hasFullPrint) {
          return json(400, {
            error: 'already_entitled',
            message: 'Betaal per keer is al inbegrepen bij je abonnement.',
          })
        }
      }
    }

    // Discount: code and/or personal profile discount
    let discountMeta: Record<string, unknown> | null = null
    let amountCents = baseCents
    const { data: discountJson, error: discountErr } = await userClient.rpc(
      'resolve_checkout_discount',
      { p_code: discountCode },
    )
    if (discountErr) {
      console.warn('resolve_checkout_discount', discountErr.message)
    } else if (discountJson && (discountJson as { applied?: boolean }).applied) {
      const d = discountJson as {
        percent_off?: number | null
        amount_off_cents?: number | null
        source?: string
        code?: string
      }
      amountCents = applyDiscount(baseCents, d)
      discountMeta = {
        source: d.source,
        code: d.code ?? null,
        percent_off: d.percent_off ?? null,
        amount_off_cents: d.amount_off_cents ?? null,
        base_cents: baseCents,
      }
    } else if (discountCode) {
      return json(400, {
        error: 'invalid_discount',
        message: 'Kortingscode is ongeldig of verlopen.',
      })
    }

    const amountValue = centsToEur(amountCents)
    const featureLabels: Record<string, string> = {
      full_print: 'Plattegrond / bouwinstructie',
      copy_order_list: 'Bestellijst kopiëren naar klembord',
      bom_print: 'Stuklijst printen',
      download_model: 'Downloaden van modellen',
    }
    const description = isFeatureUnlock && featureKey
      ? grantScope === 'account'
        ? `Steigerbuisontwerpen — ${featureLabels[featureKey] ?? featureKey} (blijvend op dit account)`
        : `Steigerbuisontwerpen — ${featureLabels[featureKey] ?? featureKey} (blijvend voor dit model)`
      : planName != null
        ? `Steigerbuisontwerpen — ${planName}`
        : isExport
          ? 'Steigerbuisontwerpen — Betaal per keer (blijvende toegang na aankoop)'
          : 'Steigerbuisontwerpen — maandabonnement (1 maand)'

    let returnUrl = body.return_url?.trim() || `${siteUrl}/?billing=return`

    try {
      const u = new URL(returnUrl)
      if (
        u.hostname === 'localhost' ||
        u.hostname === '127.0.0.1' ||
        u.hostname.endsWith('.local')
      ) {
        returnUrl = `${siteUrl}/?billing=return`
      }
    } catch {
      returnUrl = `${siteUrl}/?billing=return`
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/mollie-webhook`
    const checkoutMetadata: Record<string, unknown> = {
      user_id: userData.user.id,
      plan: isFeatureUnlock ? 'feature_unlock' : planSlug,
      period_months: isExport ? '0' : '1',
      amount_eur: amountValue,
      amount_cents: amountCents,
      discount: discountMeta,
      mollie_mode: mollieMode,
      recurring_flow: isSubscriptionPlan,
    }
    if (isFeatureUnlock && featureKey) {
      checkoutMetadata.feature = featureKey
      checkoutMetadata.grant_scope = grantScope ?? 'model'
      if (grantScope === 'model' && modelId) {
        checkoutMetadata.model_id = modelId
      }
    }

    if (isSubscriptionPlan) {
      const { data: profile } = await settingsClient
        .from('profiles')
        .select('id, display_name, mollie_customer_id')
        .eq('id', userData.user.id)
        .maybeSingle()

      let customerId =
        (typeof profile?.mollie_customer_id === 'string' && profile.mollie_customer_id.trim()) ||
        null

      if (customerId) {
        const existingCustomer = await mollieRequest(`/v2/customers/${customerId}`, mollieKey)
        if (!existingCustomer.ok && existingCustomer.status === 404) {
          customerId = null
        }
      }

      if (!customerId) {
        const customerRes = await mollieRequest('/v2/customers', mollieKey, {
          method: 'POST',
          body: JSON.stringify({
            name: profile?.display_name || userData.user.email || 'Steigerbuis gebruiker',
            email: userData.user.email ?? undefined,
            metadata: { user_id: userData.user.id, mollie_mode: mollieMode },
          }),
        })
        if (!customerRes.ok) {
          return json(502, {
            error: 'customer_create_failed',
            message: `Mollie customer aanmaken mislukte: ${detailFromMollie(customerRes.data)}`,
            detail: customerRes.data,
          })
        }
        customerId = (customerRes.data as MollieCustomer).id
        await settingsClient
          .from('profiles')
          .update({ mollie_customer_id: customerId })
          .eq('id', userData.user.id)
      }

      const mandatesRes = await mollieRequest(
        `/v2/customers/${customerId}/mandates?limit=50`,
        mollieKey,
      )
      const mandates = mandatesRes.ok
        ? ((((mandatesRes.data as { _embedded?: { mandates?: MollieMandate[] } })._embedded ??
            {})
            .mandates ??
            []) as MollieMandate[])
        : []
      const hasValidMandate = mandates.some((m) => m.status === 'valid')

      if (!hasValidMandate) {
        const preflight = await fetchMethodsPreflight(mollieKey, amountValue)
        const recurringMethodHint = preflight.first
        const modeAdvice = paymentMethodAdvice(mollieMode)

        // Fail fast when Mollie has no sequenceType=first methods (common: iDEAL
        // enabled for one-off but SEPA Direct Debit missing → iDEAL absent for mandates).
        if (recurringMethodHint.length === 0) {
          const oneoffNote =
            preflight.oneoff.length > 0
              ? ` One-off methodes wel actief: ${preflight.oneoff.join(', ')}.`
              : ' Ook one-off methodes lijken leeg of niet ophaalbaar.'
          return json(502, {
            error: 'checkout_failed',
            message:
              `Mollie first payment mislukt: geen recurring-geschikte methodes (sequenceType=first) voor €${amountValue}.${oneoffNote} ${modeAdvice}`,
            mollie_mode: mollieMode,
            advice: modeAdvice,
            recurring_methods_hint: [],
            oneoff_methods_hint: preflight.oneoff,
            preflight_empty: true,
            amount_eur: amountValue,
          })
        }

        // Only pass methods Mollie already lists for sequenceType=first.
        // This does not hide iDEAL when it is mandate-capable; it prevents Mollie
        // from offering one-off-only methods (common: iDEAL without SEPA DD) which
        // then fail create with "No suitable payment methods found".
        const idealBlockedWithoutSepa =
          !recurringMethodHint.includes('ideal') && preflight.oneoff.includes('ideal')

        const firstPaymentPayload: Record<string, unknown> = {
          amount: { currency: 'EUR', value: amountValue },
          description,
          redirectUrl: returnUrl,
          webhookUrl,
          locale: 'nl_NL',
          customerId,
          sequenceType: 'first',
          method: recurringMethodHint,
          metadata: {
            ...checkoutMetadata,
            recurring_stage: 'first_payment',
            mollie_customer_id: customerId,
            recurring_methods: recurringMethodHint,
            ideal_blocked_without_sepa_dd: idealBlockedWithoutSepa,
          },
        }

        if (idealBlockedWithoutSepa) {
          console.warn(
            JSON.stringify({
              event: 'mollie_ideal_missing_for_first',
              first: recurringMethodHint,
              oneoff: preflight.oneoff,
              hint: 'Enable SEPA Direct Debit in Mollie profile for iDEAL mandates',
            }),
          )
        }

        let firstPayment = await mollieRequest('/v2/payments', mollieKey, {
          method: 'POST',
          body: JSON.stringify(firstPaymentPayload),
        })

        // Fallback: single preferred method if array form is rejected
        if (!firstPayment.ok && isNoSuitableMethodsError(firstPayment.data)) {
          const preferred = recurringMethodHint[0]
          console.warn(
            JSON.stringify({
              event: 'mollie_first_payment_retry_single_method',
              method: preferred,
              candidates: recurringMethodHint,
            }),
          )
          firstPayment = await mollieRequest('/v2/payments', mollieKey, {
            method: 'POST',
            body: JSON.stringify({
              ...firstPaymentPayload,
              method: preferred,
            }),
          })
        }

        const firstData = firstPayment.data
        const checkoutUrl = (firstData as { _links?: { checkout?: { href?: string } } })?._links
          ?.checkout?.href
        if (!firstPayment.ok || !checkoutUrl) {
          const noSuitable = isNoSuitableMethodsError(firstData)
          const methodsNote = ` Beschikbaar voor first: ${recurringMethodHint.join(', ') || '(geen)'}.`
          return json(502, {
            error: 'checkout_failed',
            message: noSuitable
              ? `Mollie first payment mislukt: ${detailFromMollie(firstData)}.${methodsNote} ${modeAdvice}`
              : `Mollie first payment mislukt: ${detailFromMollie(firstData)}.${methodsNote}`,
            detail: firstData,
            mollie_mode: mollieMode,
            advice: noSuitable ? modeAdvice : undefined,
            recurring_methods_hint: recurringMethodHint,
            oneoff_methods_hint: preflight.oneoff,
            preflight_empty: false,
            amount_eur: amountValue,
          })
        }

        return json(200, {
          url: checkoutUrl,
          checkoutUrl,
          plan: planSlug,
          amount_eur: amountValue,
          discount_applied: Boolean(discountMeta),
          mollie_mode: mollieMode,
          recurring_stage: 'first_payment',
          customer_id: customerId,
          recurring_methods: recurringMethodHint,
          oneoff_methods: preflight.oneoff,
          ideal_blocked_without_sepa_dd: idealBlockedWithoutSepa,
          payment_methods_note: idealBlockedWithoutSepa
            ? 'iDEAL staat aan voor eenmalige betalingen, maar niet voor het eerste abonnementsbetaling (mandate). Zet in Mollie ook SEPA Direct Debit aan. Wero kan niet voor abonnementen.'
            : undefined,
        })
      }

      const subscriptionRes = await mollieRequest(
        `/v2/customers/${customerId}/subscriptions`,
        mollieKey,
        {
          method: 'POST',
          body: JSON.stringify({
            amount: { currency: 'EUR', value: amountValue },
            interval: '1 month',
            description,
            webhookUrl,
            metadata: {
              ...checkoutMetadata,
              recurring_stage: 'subscription',
              mollie_customer_id: customerId,
            },
          }),
        },
      )
      if (!subscriptionRes.ok) {
        return json(502, {
          error: 'subscription_create_failed',
          message: `Mollie subscription aanmaken mislukte: ${detailFromMollie(subscriptionRes.data)}`,
          detail: subscriptionRes.data,
        })
      }

      const subscription = subscriptionRes.data as MollieSubscription
      await settingsClient
        .from('profiles')
        .update({
          mollie_customer_id: customerId,
          mollie_subscription_id: subscription.id,
          mollie_subscription_status: subscription.status ?? 'pending',
          mollie_subscription_next_payment_at: subscription.nextPaymentDate ?? null,
          subscription_plan_slug: planSlug,
          subscription_status: subscription.status === 'active' ? 'active' : 'pending',
          subscription_cancel_at: null,
        })
        .eq('id', userData.user.id)

      const checkoutUrl = subscription._links?.checkout?.href ?? null
      return json(200, {
        url: checkoutUrl,
        checkoutUrl,
        plan: planSlug,
        amount_eur: amountValue,
        discount_applied: Boolean(discountMeta),
        mollie_mode: mollieMode,
        recurring_stage: 'subscription',
        subscription_id: subscription.id,
        subscription_status: subscription.status ?? null,
        next_payment_date: subscription.nextPaymentDate ?? null,
      })
    }

    const oneTimeRes = await mollieRequest('/v2/payments', mollieKey, {
      method: 'POST',
      body: JSON.stringify({
        amount: { currency: 'EUR', value: amountValue },
        description,
        redirectUrl: returnUrl,
        webhookUrl,
        metadata: checkoutMetadata,
      }),
    })
    const checkoutUrl = (oneTimeRes.ok ? oneTimeRes.data : oneTimeRes.data) as {
      _links?: { checkout?: { href?: string } }
    }

    if (!oneTimeRes.ok || !checkoutUrl?._links?.checkout?.href) {
      return json(502, {
        error: 'checkout_failed',
        message: `Mollie weigerde de betaling: ${detailFromMollie(oneTimeRes.data)}`,
        detail: oneTimeRes.data,
      })
    }

    return json(200, {
      url: checkoutUrl._links.checkout?.href ?? null,
      checkoutUrl: checkoutUrl._links.checkout?.href ?? null,
      plan: planSlug,
      amount_eur: amountValue,
      discount_applied: Boolean(discountMeta),
      mollie_mode: mollieMode,
    })
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'exception',
        message: e instanceof Error ? e.message : 'Onbekende fout in create-checkout',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
