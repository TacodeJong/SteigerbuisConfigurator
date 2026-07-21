import { useEffect, useState } from 'react'
import {
  adminAssignSubscriptionPlan,
  adminListPlanAssignmentEvents,
  adminListUsersForAssign,
  adminLookupUserSubscription,
  mapAssignRpcError,
  type AdminPlanAssignmentEvent,
  type AdminUserForAssign,
  type AdminUserSubscriptionLookup,
} from '../../lib/billing/adminAssignPlan'
import {
  adminListSubscriptionPlans,
  type SubscriptionPlan,
} from '../../lib/billing/plans'
import { isSupabaseConfigured } from '../../lib/auth/supabaseClient'

export function AdminUsersPanel() {
  const configured = isSupabaseConfigured()
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [users, setUsers] = useState<AdminUserForAssign[]>([])
  const [events, setEvents] = useState<AdminPlanAssignmentEvent[]>([])
  const [query, setQuery] = useState('')
  const [email, setEmail] = useState('')
  const [planSlug, setPlanSlug] = useState('')
  const [paidUntil, setPaidUntil] = useState('')
  const [note, setNote] = useState('')
  const [lookup, setLookup] = useState<AdminUserSubscriptionLookup | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const selectedPlan = plans.find((p) => p.slug === planSlug) ?? null
  const showPaidUntil = selectedPlan?.kind === 'subscription'
  const hasMollie = Boolean(lookup?.found && lookup.mollie_subscription_id)

  const reload = async (search = query) => {
    const [p, u, e] = await Promise.all([
      adminListSubscriptionPlans(),
      adminListUsersForAssign({ query: search.trim() || null, limit: 40 }),
      adminListPlanAssignmentEvents(30),
    ])
    setPlans(p)
    setUsers(u)
    setEvents(e)
    if (!planSlug && p.length > 0) {
      const preferred =
        p.find((x) => x.slug === 'free') ||
        p.find((x) => x.is_default) ||
        p[0]
      setPlanSlug(preferred.slug)
    }
  }

  useEffect(() => {
    void reload().catch((err) =>
      setError(err instanceof Error ? mapAssignRpcError(err.message) : 'Laden mislukt'),
    )
  }, [])

  const runLookup = async (nextEmail = email) => {
    setError(null)
    setInfo(null)
    if (!nextEmail.trim()) {
      setLookup(null)
      return
    }
    setBusy(true)
    try {
      const row = await adminLookupUserSubscription({ email: nextEmail.trim() })
      setLookup(row)
      if (!row.found) setError('Gebruiker niet gevonden.')
    } catch (err) {
      setLookup(null)
      setError(err instanceof Error ? mapAssignRpcError(err.message) : 'Opzoeken mislukt')
    } finally {
      setBusy(false)
    }
  }

  const selectUser = (u: AdminUserForAssign) => {
    setEmail(u.email || '')
    setLookup({
      found: true,
      profile_id: u.profile_id,
      email: u.email,
      display_name: u.display_name,
      subscription_plan_slug: u.subscription_plan_slug,
      is_paid: u.is_paid,
      paid_until: u.paid_until,
      export_pack: u.export_pack,
      subscription_status: u.subscription_status,
      mollie_subscription_id: u.mollie_subscription_id,
    })
    setError(null)
    setInfo(null)
  }

  const assign = async () => {
    setError(null)
    setInfo(null)
    if (!email.trim() && !lookup?.profile_id) {
      setError('Kies een gebruiker of vul een e-mailadres in.')
      return
    }
    if (!planSlug) {
      setError('Kies een plan.')
      return
    }
    setBusy(true)
    try {
      const result = await adminAssignSubscriptionPlan({
        plan_slug: planSlug,
        email: email.trim() || null,
        profile_id: lookup?.profile_id ?? null,
        paid_until:
          showPaidUntil && paidUntil ? new Date(paidUntil).toISOString() : null,
        note: note.trim() || null,
        clear_mollie_local: true,
      })
      let msg = `Plan “${result.to_plan_slug}” toegewezen aan ${result.email || result.profile_id}.`
      if (result.had_mollie_subscription) {
        msg +=
          ' Lokale Mollie-status op canceled gezet (handmatige toewijzing overschrijft lokale entitlements). Annuleer zo nodig het Mollie-abonnement apart in het Mollie-dashboard als incasso nog doorloopt.'
      }
      setInfo(msg)
      setNote('')
      await reload()
      if (result.email) await runLookup(result.email)
    } catch (err) {
      setError(err instanceof Error ? mapAssignRpcError(err.message) : 'Toewijzen mislukt')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-section">
      <h2>Abonnement toewijzen</h2>
      <p className="muted">
        Wijs handmatig een plan uit <code>subscription_plans</code> toe. Dit zet lokale
        entitlements (<code>subscription_plan_slug</code>, <code>is_paid</code>,{' '}
        <code>paid_until</code>, <code>export_pack</code>, status) zonder Mollie-betaling.
        Handmatige toewijzing overschrijft lokale entitlements.
      </p>
      {!configured && (
        <p className="muted">Lokale demo: werkt tegen de stub-store.</p>
      )}

      <div className="admin-form-grid">
        <label>
          Zoek gebruikers
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e-mail of naam"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void reload(query).catch((err) =>
                  setError(
                    err instanceof Error ? mapAssignRpcError(err.message) : 'Zoeken mislukt',
                  ),
                )
              }
            }}
          />
        </label>
        <div className="admin-form-actions">
          <button
            type="button"
            className="bom-action-btn secondary"
            disabled={busy}
            onClick={() =>
              void reload(query).catch((err) =>
                setError(
                  err instanceof Error ? mapAssignRpcError(err.message) : 'Zoeken mislukt',
                ),
              )
            }
          >
            Zoeken
          </button>
        </div>
      </div>

      <ul className="admin-list">
        {users.length === 0 && <li className="muted">Geen gebruikers gevonden.</li>}
        {users.map((u) => (
          <li key={u.profile_id} className="admin-list-item">
            <div>
              <strong>{u.email || u.profile_id}</strong>
              {u.display_name ? ` (${u.display_name})` : ''}
              {' · '}
              {u.subscription_plan_slug || 'geen plan'}
              {u.is_paid ? ' · paid' : ''}
              {u.export_pack ? ' · export' : ''}
              {u.mollie_subscription_id ? ' · Mollie' : ''}
            </div>
            <button type="button" className="linkish" onClick={() => selectUser(u)}>
              Selecteren
            </button>
          </li>
        ))}
      </ul>

      <h3>Toewijzing</h3>
      <div className="admin-form-grid">
        <label>
          E-mail
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="gebruiker@voorbeeld.nl"
          />
        </label>
        <div className="admin-form-actions">
          <button
            type="button"
            className="bom-action-btn secondary"
            disabled={busy}
            onClick={() => void runLookup()}
          >
            Opzoeken
          </button>
        </div>
        <label>
          Plan
          <select value={planSlug} onChange={(e) => setPlanSlug(e.target.value)}>
            {plans.length === 0 && <option value="">Geen plannen</option>}
            {plans.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name} ({p.slug}
                {p.kind === 'free' ? ', gratis' : p.kind === 'one_time' ? ', eenmalig' : ', abo'}
                {!p.is_active ? ', inactief' : ''})
              </option>
            ))}
          </select>
        </label>
        {showPaidUntil && (
          <label>
            Geldig tot (optioneel)
            <input
              type="datetime-local"
              value={paidUntil}
              onChange={(e) => setPaidUntil(e.target.value)}
            />
          </label>
        )}
        <label>
          Notitie (audit)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="bijv. support ticket #…"
          />
        </label>
      </div>

      {lookup?.found && (
        <p className="muted">
          Huidig: {lookup.email}
          {lookup.display_name ? ` (${lookup.display_name})` : ''} · plan{' '}
          <code>{lookup.subscription_plan_slug || '—'}</code>
          {lookup.is_paid ? ' · is_paid' : ''}
          {lookup.paid_until
            ? ` · tot ${new Date(lookup.paid_until).toLocaleString('nl-NL')}`
            : ''}
          {lookup.export_pack ? ' · export_pack' : ''}
          {lookup.subscription_status ? ` · ${lookup.subscription_status}` : ''}
        </p>
      )}

      {hasMollie && (
        <p className="auth-error" role="status">
          Let op: deze gebruiker heeft een Mollie-abonnement-id. Handmatige toewijzing
          overschrijft lokale entitlements en zet de lokale Mollie-status op canceled. Dit
          annuleert niet automatisch de incasso bij Mollie — controleer/annuleer daar indien
          nodig.
        </p>
      )}

      <button
        type="button"
        className="bom-action-btn"
        disabled={busy || !planSlug}
        onClick={() => void assign()}
      >
        Plan toewijzen
      </button>

      <h3>Recente toewijzingen</h3>
      <ul className="admin-list">
        {events.length === 0 && <li className="muted">Nog geen auditregels.</li>}
        {events.map((ev) => (
          <li key={ev.id} className="admin-list-item">
            <div>
              <strong>{ev.target_email || ev.target_user_id}</strong>
              {' · '}
              {ev.from_plan_slug || '—'} → {ev.to_plan_slug}
              {ev.paid_until
                ? ` · tot ${new Date(ev.paid_until).toLocaleString('nl-NL')}`
                : ''}
              {ev.had_mollie_subscription ? ' · had Mollie' : ''}
              {ev.note ? ` · ${ev.note}` : ''}
              <div className="muted">
                {new Date(ev.created_at).toLocaleString('nl-NL')}
                {ev.admin_email ? ` · door ${ev.admin_email}` : ''}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="auth-error">{error}</p>}
      {info && <p className="auth-info">{info}</p>}
    </section>
  )
}
