/** Plan prices: prefer subscription_plans, fall back to app_settings / hardcoded. */

import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'
import {
  EXPORT_PACK_AMOUNT_EUR,
  PAID_PLAN_AMOUNT_EUR,
  type CheckoutPlan,
} from './planPricing'

export const PRICE_PAID_MONTHLY_CENTS_KEY = 'price_paid_monthly_cents'
export const PRICE_EXPORT_ONCE_CENTS_KEY = 'price_export_once_cents'

export interface PlanPrices {
  paidMonthlyCents: number
  exportOnceCents: number
}

const DEFAULT_PRICES: PlanPrices = {
  paidMonthlyCents: eurToCents(PAID_PLAN_AMOUNT_EUR),
  exportOnceCents: eurToCents(EXPORT_PACK_AMOUNT_EUR),
}

export function eurToCents(eur: string): number {
  const n = Number.parseFloat(eur)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

export function centsToEurString(cents: number): string {
  const safe = Math.max(0, Math.round(cents))
  return (safe / 100).toFixed(2)
}

export function formatEuroFromCents(cents: number): string {
  const eur = centsToEurString(cents)
  return eur.endsWith('.00') ? `€${eur.slice(0, -3)}` : `€${eur.replace('.', ',')}`
}

function parseCents(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.round(value)
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number.parseInt(value, 10)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return fallback
}

/** Local stub / offline defaults. */
export function defaultPlanPrices(): PlanPrices {
  return { ...DEFAULT_PRICES }
}

export async function fetchPlanPrices(): Promise<PlanPrices> {
  if (!isSupabaseConfigured()) return defaultPlanPrices()
  const supabase = getSupabase()
  if (!supabase) return defaultPlanPrices()

  // Prefer active subscription_plans for known slugs
  const { data: plans } = await supabase
    .from('subscription_plans')
    .select('slug, price_cents, is_active')
    .in('slug', ['paid_monthly', 'export_once'])
    .eq('is_active', true)

  let paid = DEFAULT_PRICES.paidMonthlyCents
  let exportOnce = DEFAULT_PRICES.exportOnceCents
  let fromPlans = false
  for (const row of plans ?? []) {
    if (row.slug === 'paid_monthly' && typeof row.price_cents === 'number') {
      paid = Math.round(row.price_cents)
      fromPlans = true
    } else if (row.slug === 'export_once' && typeof row.price_cents === 'number') {
      exportOnce = Math.round(row.price_cents)
      fromPlans = true
    }
  }
  if (fromPlans) return { paidMonthlyCents: paid, exportOnceCents: exportOnce }

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [PRICE_PAID_MONTHLY_CENTS_KEY, PRICE_EXPORT_ONCE_CENTS_KEY])

  if (error) {
    console.warn('plan prices fetch', error.message)
    return defaultPlanPrices()
  }

  for (const row of data ?? []) {
    if (row.key === PRICE_PAID_MONTHLY_CENTS_KEY) {
      paid = parseCents(row.value, paid)
    } else if (row.key === PRICE_EXPORT_ONCE_CENTS_KEY) {
      exportOnce = parseCents(row.value, exportOnce)
    }
  }
  return { paidMonthlyCents: paid, exportOnceCents: exportOnce }
}

/**
 * Updates `paid_monthly` / `export_once` via admin_update_subscription_plan.
 * That RPC syncs price to app_settings for legacy checkout fallbacks.
 */
export async function savePlanPrices(prices: PlanPrices): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Prijzen opslaan vereist Supabase (lokale demo heeft vaste defaults).')
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')

  const paid = Math.max(1, Math.round(prices.paidMonthlyCents))
  const exportOnce = Math.max(1, Math.round(prices.exportOnceCents))

  const { data: rows, error: listErr } = await supabase.rpc('admin_list_subscription_plans')
  if (listErr) throw listErr

  const list = (rows ?? []) as Array<{ id: string; slug: string }>
  const paidPlan = list.find((p) => p.slug === 'paid_monthly')
  const exportPlan = list.find((p) => p.slug === 'export_once')
  if (!paidPlan?.id || !exportPlan?.id) {
    throw new Error(
      'Plannen paid_monthly / export_once ontbreken. Maak ze aan onder Abonnementen.',
    )
  }

  const { error: e1 } = await supabase.rpc('admin_update_subscription_plan', {
    p_id: paidPlan.id,
    p_price_cents: paid,
  })
  if (e1) throw e1

  const { error: e2 } = await supabase.rpc('admin_update_subscription_plan', {
    p_id: exportPlan.id,
    p_price_cents: exportOnce,
  })
  if (e2) throw e2
}

export function priceCentsForPlan(plan: CheckoutPlan, prices: PlanPrices): number {
  return plan === 'export_once' ? prices.exportOnceCents : prices.paidMonthlyCents
}

export function paidPriceHint(prices: PlanPrices): string {
  return `${formatEuroFromCents(prices.paidMonthlyCents)} / maand · via Mollie (iDEAL/creditcard)`
}

export function exportPriceHint(prices: PlanPrices): string {
  return `Per keer ${formatEuroFromCents(prices.exportOnceCents)} · blijvende toegang (geen abonnement)`
}
