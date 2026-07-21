/** Billing plan amounts — no Vite/env side effects (safe for Node tests). */

export type CheckoutPlan = 'paid_monthly' | 'export_once'

/** Monthly Paid — unlimited save, publish, fork, footprint. */
export const PAID_PLAN_AMOUNT_EUR = '7.00'
export const PAID_PLAN_PERIOD_MONTHS = 1

/** One-time export — footprint + BOM print only; no Paid cloud features. */
export const EXPORT_PACK_AMOUNT_EUR = '5.00'
