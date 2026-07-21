import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth/session'
import { ApiError } from '../../lib/apiErrors'
import {
  cancelMySubscription,
  currentOneTimeLabel,
  currentSubscriptionLabel,
  formatPeriodEnd,
  subscriptionStatusLabel,
} from '../../lib/billing/subscription'
import { isEntitledPaid } from '../../lib/billing/entitlements'
import {
  defaultSubscriptionPlans,
  fetchActivePlans,
  type SubscriptionPlan,
} from '../../lib/billing/plans'

interface SubscriptionManageSectionProps {
  busy: string | null
  onMessage: (info: string | null, error: string | null) => void
  /** Active plans from UpgradePanel; fetched locally if omitted. */
  plans?: SubscriptionPlan[]
}

/**
 * Jouw toegang — status en annuleren.
 * Plan kiezen / wijzigen gebeurt via de kaarten op de Upgrade-pagina.
 */
export function SubscriptionManageSection({
  busy,
  onMessage,
  plans: plansProp,
}: SubscriptionManageSectionProps) {
  const { user, profile, isPaid, refreshProfile } = useAuth()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [endImmediately, setEndImmediately] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [localPlans, setLocalPlans] = useState<SubscriptionPlan[]>(
    () => plansProp ?? defaultSubscriptionPlans(),
  )

  useEffect(() => {
    if (plansProp && plansProp.length > 0) {
      setLocalPlans(plansProp)
      return
    }
    let cancelled = false
    void fetchActivePlans().then((rows) => {
      if (!cancelled && rows.length) setLocalPlans(rows)
    })
    return () => {
      cancelled = true
    }
  }, [plansProp])

  if (!user || !profile) return null

  const plans = plansProp && plansProp.length > 0 ? plansProp : localPlans
  const hasPaidSubscription = isEntitledPaid(profile)
  const oneTimeLabel = currentOneTimeLabel(profile, plans)
  const subscriptionName = currentSubscriptionLabel(profile, plans)
  const hasSomething =
    hasPaidSubscription || Boolean(oneTimeLabel) || Boolean(profile.export_pack)
  if (!hasSomething) return null

  const status = hasPaidSubscription
    ? (profile.subscription_status ?? 'active')
    : null
  const periodEnd = formatPeriodEnd(profile.paid_until)
  const isCanceled = profile.subscription_status === 'canceled'
  const canCancel = hasPaidSubscription && !isCanceled
  const accessLabel = hasPaidSubscription
    ? subscriptionName
    : (oneTimeLabel ?? 'Actieve toegang')

  const confirmCancel = async () => {
    setCancelBusy(true)
    onMessage(null, null)
    try {
      await cancelMySubscription({ endImmediately })
      await refreshProfile()
      setCancelOpen(false)
      setEndImmediately(false)
      onMessage(
        endImmediately
          ? `${subscriptionName} is meteen beëindigd.`
          : periodEnd
            ? `${subscriptionName} wordt niet verlengd. Toegang blijft tot ${periodEnd}.`
            : `${subscriptionName} wordt niet verlengd.`,
        null,
      )
    } catch (e) {
      onMessage(
        null,
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Annuleren mislukt',
      )
    } finally {
      setCancelBusy(false)
    }
  }

  return (
    <section className="subscription-manage" aria-labelledby="subscription-heading">
      <h2 id="subscription-heading">Jouw toegang</h2>
      <dl className="subscription-manage-dl">
        <div>
          <dt>Huidig</dt>
          <dd>{accessLabel}</dd>
        </div>
        {hasPaidSubscription ? (
          <div>
            <dt>Status</dt>
            <dd>
              {subscriptionStatusLabel(status)}
              {isCanceled && periodEnd ? ` — toegang tot ${periodEnd}` : null}
            </dd>
          </div>
        ) : null}
        {hasPaidSubscription ? (
          <div>
            <dt>Einddatum</dt>
            <dd>{periodEnd ?? '—'}</dd>
          </div>
        ) : null}
      </dl>

      {canCancel && (
        <div className="subscription-manage-cancel">
          {!cancelOpen ? (
            <button
              type="button"
              className="linkish subscription-cancel-link"
              disabled={busy !== null}
              onClick={() => setCancelOpen(true)}
            >
              Abonnement annuleren
            </button>
          ) : (
            <div className="subscription-cancel-dialog" role="dialog" aria-labelledby="cancel-title">
              <p id="cancel-title" className="subscription-cancel-title">
                {subscriptionName} annuleren?
              </p>
              <p className="muted">
                Standaard: geen verlenging — je houdt toegang tot{' '}
                {periodEnd ?? 'het einde van je periode'}. Bij een actief Mollie-abonnement
                proberen we direct de subscription te stoppen en synchroniseren we daarna je
                accountstatus.
              </p>
              <label className="subscription-cancel-check">
                <input
                  type="checkbox"
                  checked={endImmediately}
                  onChange={(e) => setEndImmediately(e.target.checked)}
                />
                Toegang meteen beëindigen (nu geen maandabonnement meer)
              </label>
              <div className="subscription-cancel-btns">
                <button
                  type="button"
                  className="bom-action-btn"
                  disabled={cancelBusy}
                  onClick={() => void confirmCancel()}
                >
                  {cancelBusy ? 'Bezig…' : 'Bevestigen'}
                </button>
                <button
                  type="button"
                  className="bom-action-btn secondary"
                  disabled={cancelBusy}
                  onClick={() => {
                    setCancelOpen(false)
                    setEndImmediately(false)
                  }}
                >
                  Terug
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isCanceled && !isPaid && (
        <p className="muted">Je abonnement is geannuleerd.</p>
      )}
    </section>
  )
}
