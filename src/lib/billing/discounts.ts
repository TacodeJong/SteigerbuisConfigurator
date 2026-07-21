import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'

export interface DiscountCode {
  id: string
  code: string
  percent_off: number | null
  amount_off_cents: number | null
  valid_from: string
  valid_until: string | null
  max_redemptions: number | null
  redemption_count: number
  active: boolean
  created_at: string
}

export interface ValidatedDiscount {
  valid: boolean
  reason?: string
  code?: string
  percent_off?: number | null
  amount_off_cents?: number | null
  valid_until?: string | null
}

export interface ProfileDiscountRow {
  id: string
  profile_id: string
  percent_off: number
  valid_until: string | null
  note: string | null
  created_at: string
  email: string | null
  display_name: string | null
}

export async function validateDiscountCode(code: string): Promise<ValidatedDiscount> {
  if (!isSupabaseConfigured()) {
    return { valid: false, reason: 'not_configured' }
  }
  const supabase = getSupabase()
  if (!supabase) return { valid: false, reason: 'not_configured' }

  const { data, error } = await supabase.rpc('validate_discount_code', {
    p_code: code.trim(),
  })
  if (error) {
    console.warn('validate_discount_code', error.message)
    return { valid: false, reason: error.message }
  }
  return (data ?? { valid: false }) as ValidatedDiscount
}

export async function adminListDiscountCodes(): Promise<DiscountCode[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase.rpc('admin_list_discount_codes')
  if (error) throw error
  return (data ?? []) as DiscountCode[]
}

export async function adminUpsertDiscountCode(input: {
  id?: string | null
  code: string
  percent_off?: number | null
  amount_off_cents?: number | null
  valid_until?: string | null
  max_redemptions?: number | null
  active?: boolean
}): Promise<DiscountCode> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')
  const { data, error } = await supabase.rpc('admin_upsert_discount_code', {
    p_code: input.code,
    p_percent_off: input.percent_off ?? null,
    p_amount_off_cents: input.amount_off_cents ?? null,
    p_valid_until: input.valid_until ?? null,
    p_max_redemptions: input.max_redemptions ?? null,
    p_active: input.active ?? true,
    p_id: input.id ?? null,
  })
  if (error) throw error
  return data as DiscountCode
}

export async function adminDeleteDiscountCode(id: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')
  const { error } = await supabase.rpc('admin_delete_discount_code', { p_id: id })
  if (error) throw error
}

export async function adminListProfileDiscounts(): Promise<ProfileDiscountRow[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase.rpc('admin_list_profile_discounts')
  if (error) throw error
  return (data ?? []) as ProfileDiscountRow[]
}

export async function adminSetProfileDiscount(input: {
  email?: string | null
  profile_id?: string | null
  percent_off: number
  valid_until?: string | null
  note?: string | null
}): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')
  const { error } = await supabase.rpc('admin_set_profile_discount', {
    p_email: input.email ?? null,
    p_profile_id: input.profile_id ?? null,
    p_percent_off: input.percent_off,
    p_valid_until: input.valid_until ?? null,
    p_note: input.note ?? null,
  })
  if (error) throw error
}

export async function adminClearProfileDiscount(profileId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')
  const { error } = await supabase.rpc('admin_clear_profile_discount', {
    p_profile_id: profileId,
  })
  if (error) throw error
}

/** Apply percent or fixed amount off to a price in cents; min 1 cent. */
export function applyDiscountToCents(
  baseCents: number,
  discount: Pick<ValidatedDiscount, 'percent_off' | 'amount_off_cents'>,
): number {
  let next = baseCents
  if (discount.percent_off != null && Number.isFinite(discount.percent_off)) {
    next = Math.round(baseCents * (1 - Number(discount.percent_off) / 100))
  } else if (discount.amount_off_cents != null && Number.isFinite(discount.amount_off_cents)) {
    next = baseCents - Math.round(Number(discount.amount_off_cents))
  }
  return Math.max(1, next)
}
