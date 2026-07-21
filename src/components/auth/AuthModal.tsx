import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../lib/auth/session'
import { isSupabaseConfigured } from '../../lib/auth/supabaseClient'
import { ApiError } from '../../lib/apiErrors'
import { useModalA11y } from '../../hooks/useModalA11y'
import { startCheckout } from '../../lib/billing/checkout'
import {
  buildUpgradeDisplayPlans,
  defaultPlanSlug,
  defaultSubscriptionPlans,
  fetchActivePlans,
  findPlanBySlug,
  isFreePlan,
  planDisplayName,
  type SubscriptionPlan,
} from '../../lib/billing/plans'
import { PlanCards } from './PlanCards'

/** Alleen Gratis + subscription-kaarten (geen one_time / export_once). */
function isSelectableRegisterPlan(
  slug: string,
  catalog: readonly SubscriptionPlan[],
): boolean {
  if (isFreePlan(slug)) return true
  const plan = findPlanBySlug([...catalog], slug)
  return Boolean(plan && plan.kind === 'subscription' && plan.is_active !== false)
}

interface AuthModalProps {
  open: boolean
  onClose: () => void
  /** Optional message explaining why login is required */
  reason?: string | null
  initialMode?: 'login' | 'register'
  /** Called after successful login/register, before onClose. */
  onSuccess?: () => void
  /** Prefill plan selection (register). */
  initialPlanSlug?: string | null
}

export function AuthModal({
  open,
  onClose,
  reason,
  initialMode = 'login',
  onSuccess,
  initialPlanSlug = null,
}: AuthModalProps) {
  const { signIn, signUp, isLocalStub, refreshProfile } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [activePlans, setActivePlans] = useState<SubscriptionPlan[]>(() =>
    defaultSubscriptionPlans(),
  )
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<string>(() =>
    initialPlanSlug?.trim() || defaultPlanSlug(),
  )
  const dialogRef = useRef<HTMLDivElement>(null)

  useModalA11y({
    open,
    onClose,
    containerRef: dialogRef,
    closeOnEscape: open && !busy,
  })

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setError(null)
  }, [open, initialMode])

  useEffect(() => {
    if (!open || mode !== 'register') return
    let cancelled = false
    void fetchActivePlans().then((rows) => {
      if (cancelled) return
      const catalog = rows.length > 0 ? rows : defaultSubscriptionPlans()
      setActivePlans(catalog)
      setSelectedPlanSlug((prev) => {
        if (initialPlanSlug?.trim()) {
          const wanted = initialPlanSlug.trim()
          if (isSelectableRegisterPlan(wanted, catalog)) return wanted
        }
        if (isSelectableRegisterPlan(prev, catalog)) return prev
        return defaultPlanSlug(catalog)
      })
    })
    return () => {
      cancelled = true
    }
  }, [open, mode, initialPlanSlug])

  if (!open) return null

  const configured = isSupabaseConfigured() || isLocalStub
  const displayPlans = buildUpgradeDisplayPlans(activePlans)
  const selectedPlan = findPlanBySlug(displayPlans, selectedPlanSlug)
  const selectedPlanName = planDisplayName(selectedPlanSlug, [
    ...displayPlans,
    ...activePlans,
  ])
  const selectedIsFree =
    isFreePlan(selectedPlanSlug) ||
    (selectedPlan != null && (selectedPlan.price_cents ?? 0) <= 0)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!configured) {
      setError(
        'Accounts zijn nog niet geconfigureerd. Zet VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in .env, of gebruik lokale demo (zonder Supabase).',
      )
      return
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password)
      } else {
        const preferredSlug = selectedIsFree
          ? defaultPlanSlug(activePlans)
          : selectedPlanSlug

        await signUp(email.trim(), password, displayName.trim(), {
          preferredPlanSlug: preferredSlug,
        })

        if (!selectedIsFree && selectedPlan && (selectedPlan.price_cents ?? 0) > 0) {
          const result = await startCheckout(selectedPlanSlug)
          if (result.stubActivated) {
            await refreshProfile()
          } else if (result.url) {
            onSuccess?.()
            window.location.href = result.url
            return
          } else if (result.recurring_stage === 'subscription') {
            await refreshProfile()
            onSuccess?.()
            onClose()
            return
          } else {
            setError(result.message ?? 'Checkout niet beschikbaar. Je account is wel aangemaakt.')
            onSuccess?.()
            return
          }
        } else {
          await refreshProfile()
        }
      }
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : mode === 'login'
              ? 'Inloggen mislukt'
              : 'Registreren mislukt',
      )
    } finally {
      setBusy(false)
    }
  }

  const registerCta = `Account aanmaken — ${selectedPlanName}`

  // Portal to body so overflow/stacking on drawers & sheets cannot clip the dialog.
  return createPortal(
    <div className="auth-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`auth-modal${mode === 'register' ? ' auth-modal--register' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        tabIndex={-1}
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="auth-modal-header">
          <h2 id="auth-modal-title">{mode === 'login' ? 'Inloggen' : 'Account aanmaken'}</h2>
          <button
            type="button"
            className="auth-modal-close"
            onClick={onClose}
            aria-label="Sluiten"
            data-modal-initial-skip
          >
            ✕
          </button>
        </header>

        {isLocalStub && (
          <p className="auth-modal-banner">
            Lokale demo-modus (geen Supabase). Accounts blijven in deze browser.
          </p>
        )}

        {reason && <p className="auth-modal-reason">{reason}</p>}

        <form className="auth-form" onSubmit={(e) => void submit(e)}>
          {mode === 'register' && (
            <label>
              Weergavenaam
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="nickname"
                required
              />
            </label>
          )}
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Wachtwoord
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
              minLength={6}
            />
          </label>

          {mode === 'register' && (
            <div className="auth-modal-plans-block">
              <p className="auth-modal-plans-label">Kies een abonnement</p>
              <PlanCards
                displayPlans={displayPlans}
                selectedSlug={selectedPlanSlug}
                onSelect={setSelectedPlanSlug}
                showCurrentBadge={false}
                className="auth-modal-plans"
                ariaLabel="Abonnement bij registratie"
              />
            </div>
          )}

          <button type="submit" className="auth-primary-btn" disabled={busy}>
            {busy
              ? 'Bezig…'
              : mode === 'register'
                ? registerCta
                : 'Inloggen'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? (
            <>
              Nog geen account?{' '}
              <button type="button" className="auth-link-btn" onClick={() => setMode('register')}>
                Registreren
              </button>
            </>
          ) : (
            <>
              Al een account?{' '}
              <button type="button" className="auth-link-btn" onClick={() => setMode('login')}>
                Inloggen
              </button>
            </>
          )}
        </p>

        {error && <p className="auth-error">{error}</p>}
      </div>
    </div>,
    document.body,
  )
}
