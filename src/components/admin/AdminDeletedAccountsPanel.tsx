import { useEffect, useState } from 'react'
import {
  fetchDeletedAccounts,
  type DeletedAccountRow,
} from '../../lib/auth/deleteAccount'
import { isSupabaseConfigured } from '../../lib/auth/supabaseClient'
import { useAuth } from '../../lib/auth/session'

/**
 * Admin-only card: count + recent anonymized account deletions.
 * Mount from AdminPage dashboard (or any is_admin surface).
 */
export function AdminDeletedAccountsPanel() {
  const { isLocalStub } = useAuth()
  const [count, setCount] = useState<number | null>(null)
  const [rows, setRows] = useState<DeletedAccountRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const configured = isSupabaseConfigured()

  useEffect(() => {
    void fetchDeletedAccounts(25)
      .then(({ count: n, rows: list }) => {
        setCount(n)
        setRows(list)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Laden mislukt'))
  }, [])

  return (
    <section className="admin-section admin-deleted-accounts">
      <h2>Verwijderde accounts</h2>
      <p className="muted">
        Anoniem auditspoor (geen plaintext e-mail, geen herstelbare inhoud)
        {isLocalStub || !configured ? ' · lokale demo' : ''}.
      </p>
      {error && <p className="auth-error">{error}</p>}
      <div className="admin-stat-grid">
        <article className="admin-stat-card">
          <p className="admin-stat-label">Verwijderingen</p>
          <p className="admin-stat-value">{count != null ? String(count) : '…'}</p>
        </article>
      </div>
      <ul className="admin-list">
        {rows.length === 0 && !error && (
          <li className="muted">Nog geen verwijderde accounts.</li>
        )}
        {rows.map((r) => (
          <li key={r.id} className="admin-list-item">
            <div>
              <strong>{r.display_name_redacted || '—'}</strong>
              {' · '}
              {new Date(r.deleted_at).toLocaleString('nl-NL')}
              {r.had_paid ? ' · had maandabonnement' : ''}
              {r.reason ? ` · ${r.reason}` : ''}
              <div className="muted admin-deleted-meta">
                id {r.former_user_id.slice(0, 8)}… · hash {r.email_hash.slice(0, 12)}…
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
