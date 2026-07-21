import { navigate } from '../lib/routing'

/** Compact header entry to the full admin page (is_admin only). */
export function AdminStylePanel() {
  return (
    <button
      type="button"
      className="admin-style-summary admin-beheer-btn"
      onClick={() => navigate({ name: 'admin' })}
      title="Beheerpagina"
    >
      Beheer
    </button>
  )
}
