import { ApiError } from '../apiErrors'
import { getSupabase, isSupabaseConfigured } from './supabaseClient'
import { stubDeleteAccount, stubDeletedAccountsCount, stubListDeletedAccounts } from './localStubStore'

export interface DeletedAccountRow {
  id: string
  deleted_at: string
  former_user_id: string
  email_hash: string
  display_name_redacted: string | null
  had_paid: boolean
  reason: string | null
}

export interface DeleteAccountOptions {
  /** Must match account email (case-insensitive) or the word VERWIJDER. */
  confirmEmail: string
  reason?: string | null
}

/**
 * Permanently deletes the current account and all user-owned app data.
 * Writes an anonymized audit row for admins. Content is not recoverable.
 */
export async function deleteMyAccount(options: DeleteAccountOptions): Promise<void> {
  const confirm = options.confirmEmail.trim()
  if (!confirm) {
    throw new ApiError('validation', 'Typ je e-mailadres of VERWIJDER om te bevestigen.')
  }

  if (!isSupabaseConfigured()) {
    stubDeleteAccount(confirm, options.reason ?? null)
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
      confirm_email: confirm,
      reason: options.reason?.trim() || null,
    }),
  })

  const payload = (await res.json().catch(() => ({}))) as {
    error?: string
    message?: string
  }

  if (!res.ok) {
    const msg = payload.message || payload.error || 'Account verwijderen mislukt.'
    if (res.status === 401) throw new ApiError('unauthorized', msg)
    if (payload.error === 'confirm_mismatch') throw new ApiError('validation', msg)
    throw new ApiError('validation', msg)
  }

  // User is already gone; signOut may fail — ignore.
  await supabase.auth.signOut().catch(() => undefined)
}

/** Admin: recent anonymized deletions (+ total count). */
export async function fetchDeletedAccounts(limit = 40): Promise<{
  count: number
  rows: DeletedAccountRow[]
}> {
  if (!isSupabaseConfigured()) {
    const rows = stubListDeletedAccounts(limit)
    return { count: stubDeletedAccountsCount(), rows }
  }

  const supabase = getSupabase()
  if (!supabase) throw new ApiError('not_configured', 'Supabase ontbreekt.')

  const [listRes, countRes] = await Promise.all([
    supabase.rpc('admin_list_deleted_accounts', { p_limit: limit }),
    supabase.rpc('admin_deleted_accounts_count'),
  ])

  if (listRes.error) {
    throw new ApiError('unauthorized', listRes.error.message)
  }
  if (countRes.error) {
    throw new ApiError('unauthorized', countRes.error.message)
  }

  return {
    count: typeof countRes.data === 'number' ? countRes.data : 0,
    rows: (listRes.data ?? []) as DeletedAccountRow[],
  }
}
