/** Admin: handmatig plan/abonnement toewijzen. */

import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'
import {
  stubAdminAssignPlan,
  stubAdminListPlanAssignmentEvents,
  stubAdminListUsersForAssign,
  stubAdminLookupUserSubscription,
} from '../auth/localStubStore'

export interface AdminUserSubscriptionLookup {
  found: boolean
  profile_id?: string
  email?: string | null
  display_name?: string | null
  subscription_plan_slug?: string | null
  is_paid?: boolean
  paid_until?: string | null
  export_pack?: boolean
  subscription_status?: string | null
  mollie_subscription_id?: string | null
  mollie_subscription_status?: string | null
  mollie_customer_id?: string | null
}

export interface AdminUserForAssign {
  profile_id: string
  email: string | null
  display_name: string | null
  subscription_plan_slug: string | null
  is_paid: boolean
  paid_until: string | null
  export_pack: boolean
  subscription_status: string | null
  mollie_subscription_id: string | null
}

export interface AdminAssignPlanResult {
  ok: boolean
  profile_id: string
  email: string | null
  from_plan_slug: string | null
  to_plan_slug: string
  plan_kind: string
  is_paid: boolean
  paid_until: string | null
  export_pack: boolean
  subscription_status: string | null
  had_mollie_subscription: boolean
  mollie_local_cleared: boolean
}

export interface AdminPlanAssignmentEvent {
  id: number
  created_at: string
  admin_id: string | null
  admin_email: string | null
  target_user_id: string
  target_email: string | null
  from_plan_slug: string | null
  to_plan_slug: string
  paid_until: string | null
  note: string | null
  had_mollie_subscription: boolean
}

export async function adminLookupUserSubscription(input: {
  email?: string | null
  profile_id?: string | null
}): Promise<AdminUserSubscriptionLookup> {
  if (!isSupabaseConfigured()) {
    return stubAdminLookupUserSubscription(input)
  }
  const supabase = getSupabase()
  if (!supabase) return { found: false }
  const { data, error } = await supabase.rpc('admin_lookup_user_subscription', {
    p_email: input.email ?? null,
    p_profile_id: input.profile_id ?? null,
  })
  if (error) throw error
  return (data ?? { found: false }) as AdminUserSubscriptionLookup
}

export async function adminListUsersForAssign(input?: {
  query?: string | null
  limit?: number
}): Promise<AdminUserForAssign[]> {
  if (!isSupabaseConfigured()) {
    return stubAdminListUsersForAssign(input)
  }
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase.rpc('admin_list_users_for_assign', {
    p_query: input?.query ?? null,
    p_limit: input?.limit ?? 40,
  })
  if (error) throw error
  return (data ?? []) as AdminUserForAssign[]
}

export async function adminAssignSubscriptionPlan(input: {
  plan_slug: string
  email?: string | null
  profile_id?: string | null
  paid_until?: string | null
  note?: string | null
  clear_mollie_local?: boolean
}): Promise<AdminAssignPlanResult> {
  if (!isSupabaseConfigured()) {
    return stubAdminAssignPlan(input)
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')
  const { data, error } = await supabase.rpc('admin_assign_subscription_plan', {
    p_plan_slug: input.plan_slug,
    p_email: input.email ?? null,
    p_profile_id: input.profile_id ?? null,
    p_paid_until: input.paid_until ?? null,
    p_note: input.note ?? null,
    p_clear_mollie_local: input.clear_mollie_local ?? true,
  })
  if (error) throw error
  return data as AdminAssignPlanResult
}

export async function adminListPlanAssignmentEvents(
  limit = 50,
): Promise<AdminPlanAssignmentEvent[]> {
  if (!isSupabaseConfigured()) {
    return stubAdminListPlanAssignmentEvents(limit)
  }
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase.rpc('admin_list_plan_assignment_events', {
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []) as AdminPlanAssignmentEvent[]
}

/** Extract PostgREST / Postgres message (+ details/hint) from thrown RPC errors. */
export function extractAssignErrorMessage(err: unknown, fallback = 'Toewijzen mislukt'): string {
  if (err == null) return fallback
  if (typeof err === 'string' && err.trim()) return err.trim()

  if (typeof err === 'object') {
    const o = err as {
      message?: unknown
      details?: unknown
      hint?: unknown
      code?: unknown
      error_description?: unknown
    }
    const parts = [o.message, o.details, o.hint]
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim())
    if (parts.length > 0) {
      const joined = parts.join(' — ')
      const code = typeof o.code === 'string' && o.code ? ` [${o.code}]` : ''
      return `${joined}${code}`
    }
    if (typeof o.error_description === 'string' && o.error_description.trim()) {
      return o.error_description.trim()
    }
  }

  if (err instanceof Error && err.message.trim()) return err.message.trim()
  return fallback
}

export function mapAssignRpcError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('admin_required')) return 'Geen beheerdersrechten.'
  if (m.includes('user_not_found')) return 'Gebruiker niet gevonden.'
  if (m.includes('plan_not_found') || m.includes('invalid_plan')) {
    return 'Ongeldig of onbekend plan.'
  }
  if (m.includes('paid_fields_immutable')) {
    return 'Profielvelden geblokkeerd door beveiligingstrigger (paid_fields_immutable). Probeer opnieuw na de laatste database-migratie.'
  }
  if (m.includes('admin_field_immutable')) {
    return 'Admin-vlag mag niet via de client worden gewijzigd.'
  }
  return message || 'Toewijzen mislukt'
}

/** NL mapping of assign/lookup RPC failures for admin UI. */
export function formatAssignError(err: unknown, fallback = 'Toewijzen mislukt'): string {
  return mapAssignRpcError(extractAssignErrorMessage(err, fallback))
}
