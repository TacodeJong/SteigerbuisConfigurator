/**
 * Mollie webhook — updates profiles for paid_monthly or export_once.
 *
 * Deploy: `npx supabase functions deploy mollie-webhook`
 * Env: MOLLIE_API_KEY_TEST / MOLLIE_API_KEY_LIVE (of legacy MOLLIE_API_KEY),
 *      SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
 * Mode: payment metadata.mollie_mode, anders app_settings.mollie_mode
 *
 * Security:
 * - Validates paid amount against expected plan price (+ discount metadata)
 * - Idempotent via processed_mollie_payments (duplicate webhook does not re-extend paid_until)
 * - Increments discount_codes.redemption_count once on successful first processing
 *
 * Note: Paid is one-shot month access (paid_until), not a Mollie Subscription ID.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  fetchMollieModeFromSettings,
  parseMollieMode,
  resolveMollieApiKey,
  type MollieMode,
} from '../_shared/mollieApiKey.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

function eurToCents(value: string | undefined | null): number | null {
  if (value == null || value === '') return null
  const n = Number.parseFloat(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
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

async function mollieFetch(
  path: string,
  apiKey: string,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number }> {
  const res = await fetch(`https://api.mollie.com${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) return { ok: false, status: res.status }
  return { ok: true, data: (await res.json()) as Record<string, unknown> }
}

function plusMonths(from: Date, months: number): Date {
  const d = new Date(from.toISOString())
  d.setMonth(d.getMonth() + months)
  return d
}

function mapMollieStatusToSubscriptionStatus(
  status: string | null | undefined,
): 'active' | 'pending' | 'canceled' | 'expired' | 'suspended' | 'failed' {
  switch (status) {
    case 'active':
      return 'active'
    case 'pending':
      return 'pending'
    case 'suspended':
      return 'suspended'
    case 'canceled':
      return 'canceled'
    case 'failed':
      return 'failed'
    default:
      return 'expired'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('SB_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({
        error: 'not_configured',
        message: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as Edge Function secrets.',
      }),
      { status: 501, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  const contentType = req.headers.get('content-type') ?? ''
  let webhookId: string | null = null
  if (contentType.includes('application/json')) {
    const body = await req.json()
    webhookId = body.id ?? body.paymentId ?? body.subscriptionId ?? null
  } else {
    const form = await req.formData()
    webhookId = String(form.get('id') ?? '')
  }

  if (!webhookId) {
    return new Response(JSON.stringify({ error: 'validation', message: 'Missing payment id' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const settingsMode: MollieMode | null = await fetchMollieModeFromSettings(supabase)
  const modeOrder: MollieMode[] =
    settingsMode === 'live' ? ['live', 'test'] : settingsMode === 'test' ? ['test', 'live'] : ['test', 'live']
  let payment: Record<string, unknown> | null = null
  let modeUsed: MollieMode | null = null
  for (const mode of modeOrder) {
    const resolved = resolveMollieApiKey(mode)
    if (!resolved.ok) continue
    const fetched = await mollieFetch(`/v2/payments/${webhookId}`, resolved.apiKey)
    if (fetched.ok) {
      payment = fetched.data
      modeUsed = mode
      break
    }
  }

  if (!payment) {
    return new Response('OK', { status: 200, headers: cors })
  }

  const metadata = (payment.metadata ?? {}) as Record<string, unknown>
  const userId = metadata.user_id as string | undefined
  const plan = (metadata.plan as string | undefined) ?? 'paid_monthly'
  const status = payment.status as string
  const usedMode = parseMollieMode(metadata.mollie_mode) ?? modeUsed ?? settingsMode ?? 'test'
  const paymentId = String(payment.id ?? webhookId)

  if (!userId) {
    return new Response(JSON.stringify({ error: 'validation', message: 'No user_id in metadata' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (status !== 'paid' && status !== 'authorized') {
    const subscriptionId = String(payment.subscriptionId ?? metadata.mollie_subscription_id ?? '')
    if (subscriptionId) {
      const mapped = mapMollieStatusToSubscriptionStatus(status)
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, paid_until')
        .eq('id', userId)
        .maybeSingle()
      const now = new Date()
      const paidUntil = profile?.paid_until ? new Date(String(profile.paid_until)) : null
      const stillActive = paidUntil != null && paidUntil.getTime() > now.getTime()
      await supabase
        .from('profiles')
        .update({
          subscription_status: mapped,
          mollie_subscription_status: mapped,
          is_paid: mapped === 'active' && stillActive,
          updated_at: now.toISOString(),
        })
        .eq('id', userId)
    }
    return new Response('OK', { status: 200, headers: cors })
  }

  // Resolve expected amount from plan pricing + discount metadata
  let baseCents: number | null = null
  // Pay-per-use only. open_from_disk / publish / fork are subscription plan features.
  const featureKey =
    typeof metadata.feature === 'string' &&
    ['full_print', 'copy_order_list', 'bom_print', 'viewport_print', 'download_model', 'full_pdf'].includes(
      metadata.feature,
    )
      ? String(metadata.feature)
      : null
  const modelId =
    typeof metadata.model_id === 'string' && metadata.model_id.trim()
      ? String(metadata.model_id).trim()
      : null
  const grantScope =
    metadata.grant_scope === 'account'
      ? 'account'
      : metadata.grant_scope === 'model'
        ? 'model'
        : featureKey === 'download_model' && !modelId
          ? 'account'
          : featureKey && modelId
            ? 'model'
            : null
  const isFeatureUnlock =
    plan === 'feature_unlock' || (featureKey != null && (modelId != null || grantScope === 'account'))

  if (isFeatureUnlock && featureKey) {
    const { data: fpRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'feature_prices')
      .maybeSingle()
    const fpVal = fpRow?.value
    if (fpVal && typeof fpVal === 'object' && !Array.isArray(fpVal)) {
      baseCents = parseSettingCents((fpVal as Record<string, unknown>)[featureKey])
    }
  }

  const { data: planRow } = await supabase
    .from('subscription_plans')
    .select('kind, features, price_cents')
    .eq('slug', isFeatureUnlock ? 'export_once' : plan)
    .maybeSingle()

  if (baseCents == null && planRow && typeof planRow.price_cents === 'number' && planRow.price_cents >= 1) {
    baseCents = Math.round(planRow.price_cents)
  }

  if (baseCents == null) {
    const priceKey =
      plan === 'export_once' || isFeatureUnlock
        ? 'price_export_once_cents'
        : 'price_paid_monthly_cents'
    const { data: settingRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', priceKey)
      .maybeSingle()
    baseCents = parseSettingCents(settingRow?.value)
  }

  if (baseCents == null) {
    const metaBase = (metadata.discount as { base_cents?: number } | undefined)?.base_cents
    if (typeof metaBase === 'number' && metaBase >= 1) {
      baseCents = Math.round(metaBase)
    }
    // Do not use metadata.amount_cents as base (that is already the final charged amount)
  }

  const discountMeta = (metadata.discount ?? null) as {
    source?: string
    code?: string | null
    percent_off?: number | null
    amount_off_cents?: number | null
    base_cents?: number
  } | null

  // Prefer recomputed plan price + discount; fall back to checkout metadata final amount
  const recomputedCents =
    baseCents != null
      ? applyDiscount(baseCents, discountMeta?.source ? discountMeta : null)
      : null

  const metaFinalCents =
    typeof metadata.amount_cents === 'number' && metadata.amount_cents >= 1
      ? Math.round(metadata.amount_cents)
      : eurToCents(metadata.amount_eur as string | undefined)

  const expectedCents = recomputedCents ?? metaFinalCents

  const amount = payment.amount as { value?: string } | undefined
  const paidCents = eurToCents(amount?.value)
  if (expectedCents != null && paidCents != null && paidCents !== expectedCents) {
    console.error('mollie amount mismatch', {
      paymentId,
      paidCents,
      expectedCents,
      plan,
      mollie_mode: usedMode,
    })
    return new Response(
      JSON.stringify({
        error: 'amount_mismatch',
        message: 'Betaald bedrag komt niet overeen met verwachte planprijs.',
        paid_cents: paidCents,
        expected_cents: expectedCents,
      }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  const discountCode =
    discountMeta?.source === 'code' && discountMeta.code
      ? String(discountMeta.code)
      : null

  // Claim payment_id first (unique PK) so concurrent webhooks cannot double-extend
  const metadataCustomerId =
    (payment.customerId as string | undefined) ||
    (metadata.mollie_customer_id as string | undefined) ||
    null
  const metadataSubscriptionId =
    (payment.subscriptionId as string | undefined) ||
    (metadata.mollie_subscription_id as string | undefined) ||
    null
  const { error: ledgerErr } = await supabase.from('processed_mollie_payments').insert({
    payment_id: paymentId,
    user_id: userId,
    plan,
    amount_cents: paidCents ?? expectedCents,
    status,
    discount_code: discountCode,
    mollie_customer_id: metadataCustomerId,
    mollie_subscription_id: metadataSubscriptionId,
    metadata: { ...metadata, mollie_mode: usedMode },
  })

  if (ledgerErr) {
    // Unique violation = already processed / concurrent duplicate → no-op
    if (ledgerErr.code === '23505') {
      return new Response('OK', { status: 200, headers: cors })
    }
    return new Response(JSON.stringify({ error: 'db', message: ledgerErr.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const releaseClaim = async () => {
    await supabase.from('processed_mollie_payments').delete().eq('payment_id', paymentId)
  }

  // Prefer plan kind from subscription_plans when available
  let treatAsExport = plan === 'export_once'
  if (planRow?.kind === 'one_time') treatAsExport = true
  if (planRow?.kind === 'subscription') treatAsExport = false

  // Per-model or account feature grant: durable across subscription upgrade/downgrade
  if (isFeatureUnlock && featureKey && grantScope === 'model' && modelId) {
    const { error: grantErr } = await supabase.from('model_feature_grants').upsert(
      {
        user_id: userId,
        model_id: modelId,
        feature_key: featureKey,
        payment_id: paymentId,
        amount_cents: paidCents ?? expectedCents,
      },
      { onConflict: 'user_id,model_id,feature_key' },
    )
    if (grantErr) {
      await releaseClaim()
      return new Response(JSON.stringify({ error: 'db', message: grantErr.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
  } else if (
    isFeatureUnlock &&
    featureKey === 'download_model' &&
    grantScope === 'account'
  ) {
    const { error: grantErr } = await supabase.from('account_feature_grants').upsert(
      {
        user_id: userId,
        feature_key: 'download_model',
        payment_id: paymentId,
        amount_cents: paidCents ?? expectedCents,
      },
      { onConflict: 'user_id,feature_key' },
    )
    if (grantErr) {
      await releaseClaim()
      return new Response(JSON.stringify({ error: 'db', message: grantErr.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
  } else if (treatAsExport) {
    const { error } = await supabase
      .from('profiles')
      .update({
        export_pack: true,
        subscription_plan_slug: plan,
        subscription_status: 'active',
        mollie_subscription_status: 'active',
        subscription_cancel_at: null,
      })
      .eq('id', userId)
    if (error) {
      await releaseClaim()
      return new Response(JSON.stringify({ error: 'db', message: error.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
  } else {
    const periodMonths = Number(metadata.period_months ?? '1') || 1
    const { data: existing } = await supabase
      .from('profiles')
      .select(
        'paid_until,mollie_customer_id,mollie_subscription_id,mollie_subscription_status,mollie_subscription_next_payment_at',
      )
      .eq('id', userId)
      .maybeSingle()

    const base = new Date()
    if (existing?.paid_until) {
      const prev = new Date(existing.paid_until)
      if (prev.getTime() > base.getTime()) {
        base.setTime(prev.getTime())
      }
    }
    base.setMonth(base.getMonth() + periodMonths)

    const customerId =
      (payment.customerId as string | undefined) ||
      (metadata.mollie_customer_id as string | undefined) ||
      existing?.mollie_customer_id ||
      null
    let subscriptionId =
      (payment.subscriptionId as string | undefined) ||
      (metadata.mollie_subscription_id as string | undefined) ||
      existing?.mollie_subscription_id ||
      null
    let subscriptionStatus = 'active'
    let nextPaymentDate: string | null = null

    if (
      !subscriptionId &&
      customerId &&
      (metadata.recurring_stage === 'first_payment' || payment.sequenceType === 'first')
    ) {
      const key = resolveMollieApiKey(usedMode)
      if (key.ok) {
        const amountValue =
          typeof (payment.amount as { value?: string })?.value === 'string'
            ? String((payment.amount as { value?: string }).value)
            : ((metadata.amount_eur as string | undefined) ?? '7.00')
        const subCreate = await fetch(`https://api.mollie.com/v2/customers/${customerId}/subscriptions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: { currency: 'EUR', value: amountValue },
            interval: '1 month',
            description: `Steigerbuisontwerpen — ${plan}`,
            webhookUrl: `${supabaseUrl}/functions/v1/mollie-webhook`,
            metadata: {
              user_id: userId,
              plan,
              mollie_mode: usedMode,
              recurring_flow: true,
              recurring_stage: 'subscription',
              mollie_customer_id: customerId,
            },
          }),
        })
        const subJson = (await subCreate.json().catch(() => ({}))) as Record<string, unknown>
        if (subCreate.ok) {
          subscriptionId = String(subJson.id ?? '')
          subscriptionStatus = String(subJson.status ?? 'active')
          nextPaymentDate = (subJson.nextPaymentDate as string | undefined) ?? null
        }
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        is_paid: true,
        paid_until: base.toISOString(),
        subscription_plan_slug: plan,
        subscription_status: 'active',
        mollie_customer_id: customerId ?? existing?.mollie_customer_id ?? null,
        mollie_subscription_id: subscriptionId ?? existing?.mollie_subscription_id ?? null,
        mollie_subscription_status: subscriptionStatus,
        mollie_subscription_next_payment_at:
          nextPaymentDate ?? existing?.mollie_subscription_next_payment_at ?? null,
        subscription_cancel_at: null,
      })
      .eq('id', userId)
    if (error) {
      await releaseClaim()
      return new Response(JSON.stringify({ error: 'db', message: error.message }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
  }

  if (discountCode) {
    const { error: redeemErr } = await supabase.rpc('increment_discount_redemption', {
      p_code: discountCode,
    })
    if (redeemErr) {
      console.warn('increment_discount_redemption', redeemErr.message)
    }
  }

  await supabase.from('mollie_subscription_events').insert({
    user_id: userId,
    mollie_customer_id: metadataCustomerId,
    mollie_subscription_id: metadataSubscriptionId,
    mollie_payment_id: paymentId,
    event_type: 'payment.paid',
    status,
    payload: { payment, metadata, mode: usedMode },
  })

  return new Response('OK', { status: 200, headers: cors })
})
