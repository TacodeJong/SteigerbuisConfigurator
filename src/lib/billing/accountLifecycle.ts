/** Cancel subscription + delete account (client). */

import { ApiError } from '../apiErrors'
import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'
import {
  stubDeleteAccount,
  stubListDeletedAccounts,
  type StubDeletedAccount,
} from '../auth/localStubStore'
import type { Profile } from '../auth/types'
import { planDisplayName, type SubscriptionPlan } from './plans'
import { EXPORT_PACK_LABEL } from './entitlements'
import {
  cancelMySubscription as cancelSubscriptionProfile,
  type CancelSubscriptionOptions,
} from './subscription'

export interface CancelSubscriptionResult {
  ok: boolean
  mode: 'end_of_period' | 'immediate'
  subscription_cancel_at: string | null
  paid_until: string | null
}

export interface DeletedAccountRow {
  id: string
  deleted_at: string
  had_paid: boolean
  plan_slug: string | null
  note: string | null
  anonymized_id: string | null
}

export async function cancelMySubscription(
  options: CancelSubscriptionOptions = {},
): Promise<CancelSubscriptionResult> {
  const endImmediately = Boolean(options.endImmediately)
  const profile = await cancelSubscriptionProfile({ endImmediately })
  return {
    ok: true,
    mode: endImmediately ? 'immediate' : 'end_of_period',
    subscription_cancel_at: profile.subscription_cancel_at ?? null,
    paid_until: profile.paid_until ?? null,
  }
}

/**
 * Permanently delete the signed-in account + data.
 * Uses Edge Function `delete-account` (service role wipes auth.users).
 */
export async function deleteMyAccount(options: {
  confirmText: string
  note?: string
}): Promise<void> {
  if (!isSupabaseConfigured()) {
    stubDeleteAccount(options.confirmText, options.note ?? null)
    return
  }

  const supabase = getSupabase()
  if (!supabase) throw new ApiError('not_configured', 'Supabase ontbreekt.')

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new ApiError('unauthorized', 'Log in om je account te verwijderen.')

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

  const res = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      confirm: options.confirmText,
      note: options.note?.trim() || null,
    }),
  })

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    message?: string
  }

  if (!res.ok) {
    throw new ApiError(
      res.status === 401 ? 'unauthorized' : 'validation',
      payload.message || payload.error || `Account verwijderen mislukt (HTTP ${res.status}).`,
    )
  }

  await supabase.auth.signOut()
}

export async function adminListDeletedAccounts(): Promise<DeletedAccountRow[]> {
  if (!isSupabaseConfigured()) {
    return stubListDeletedAccounts().map(fromStubDeleted)
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')
  const { data, error } = await supabase.rpc('admin_list_deleted_accounts')
  if (error) throw error
  return ((data ?? []) as DeletedAccountRow[]).map((r) => ({
    id: r.id,
    deleted_at: r.deleted_at,
    had_paid: Boolean(r.had_paid),
    plan_slug: r.plan_slug ?? null,
    note: r.note ?? null,
    anonymized_id: r.anonymized_id ?? null,
  }))
}

function fromStubDeleted(r: StubDeletedAccount): DeletedAccountRow {
  return {
    id: r.id,
    deleted_at: r.deleted_at,
    had_paid: r.had_paid,
    plan_slug: null,
    note: r.reason,
    anonymized_id: r.former_user_id,
  }
}

/** Human-readable subscription status for Account UI. Nooit Engels "Paid". */
export function subscriptionStatusLabel(
  profile: Profile | null | undefined,
  plans?: readonly SubscriptionPlan[] | null,
): string {
  if (!profile) return 'Geen abonnement'
  if (profile.subscription_status === 'canceled' || profile.subscription_cancel_at) {
    const until = profile.paid_until
      ? new Date(profile.paid_until).toLocaleDateString('nl-NL')
      : null
    if (until && profile.paid_until && new Date(profile.paid_until).getTime() > Date.now()) {
      return `Opgezegd — actief tot ${until}`
    }
    return 'Opgezegd'
  }
  if (profile.is_paid && (!profile.paid_until || new Date(profile.paid_until).getTime() > Date.now())) {
    const until = profile.paid_until
      ? new Date(profile.paid_until).toLocaleDateString('nl-NL')
      : null
    const name = planDisplayName(
      profile.subscription_plan_slug?.trim() || 'paid_monthly',
      plans,
    )
    return until ? `${name} tot ${until}` : name
  }
  if (profile.export_pack) {
    return `Geen abonnement · ${EXPORT_PACK_LABEL}`
  }
  const freeSlug = profile.subscription_plan_slug?.trim() || 'free'
  return planDisplayName(freeSlug, plans) || 'Gratis'
}
