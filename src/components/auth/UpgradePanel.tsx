import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth/session'
import { startCheckout } from '../../lib/billing/checkout'
import { ApiError } from '../../lib/apiErrors'
import { hasExportPack } from '../../lib/billing/entitlements'
import {
  defaultPlanPrices,
  formatEuroFromCents,
  type PlanPrices,
} from '../../lib/billing/appPricing'
import {
  applyDiscountToCents,
  validateDiscountCode,
  type ValidatedDiscount,
} from '../../lib/billing/discounts'
import {
  buildUpgradeDisplayPlans,
  defaultPlanSlug,
  defaultSubscriptionPlans,
  fetchActivePlans,
  findPlanBySlug,
  isFreePlan,
  type SubscriptionPlan,
} from '../../lib/billing/plans'
import {
  activeUpgradeCardSlug,
  isSubscriptionPlan,
} from '../../lib/billing/subscription'
import { navigate } from '../../lib/routing'
import { AuthModal } from './AuthModal'
import { PlanCards } from './PlanCards'
import { SubscriptionManageSection } from './SubscriptionManageSection'

function pricesFromPlans(plans: SubscriptionPlan[]): PlanPrices {
  const defaults = defaultPlanPrices()
  const paid = findPlanBySlug(plans, 'paid_monthly')
  const exportOnce = findPlanBySlug(plans, 'export_once')
  return {
    paidMonthlyCents: paid?.price_cents ?? defaults.paidMonthlyCents,
    exportOnceCents: exportOnce?.price_cents ?? defaults.exportOnceCents,
  }
}

export function UpgradePanel() {
  const {
    user,
    isPaid,
    isAdmin,
    profile,
    isLocalStub,
    refreshProfile,
    demoSetPaid,
    demoSetExportPack,
    demoSetAdmin,
  } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [prices, setPrices] = useState<PlanPrices>(defaultPlanPrices)
  const [activePlans, setActivePlans] = useState<SubscriptionPlan[]>(() =>
    defaultSubscriptionPlans(),
  )
  const [discountInput, setDiscountInput] = useState('')
  const [discount, setDiscount] = useState<ValidatedDiscount | null>(null)
  const [discountBusy, setDiscountBusy] = useState(false)
  /** Geselecteerde kaart (kan anders zijn dan actief plan). */
  const [selectedSlug, setSelectedSlug] = useState<string>(() => defaultPlanSlug())

  const exportOk = hasExportPack(profile)
  const currentCardSlug = activeUpgradeCardSlug(profile, activePlans)
  /** Gratis + actieve subscriptions (geen one_time-kaart). */
  const displayPlans = buildUpgradeDisplayPlans(activePlans)
  const hasPaidSubscription = Boolean(
    user && currentCardSlug && isSubscriptionPlan(currentCardSlug, activePlans),
  )

  useEffect(() => {
    void fetchActivePlans().then((rows) => {
      const catalog = rows.length > 0 ? rows : defaultSubscriptionPlans()
      setActivePlans(catalog)
      setPrices(pricesFromPlans(catalog))
    })
  }, [])

  // Sync selectie met actief plan wanneer profiel/catalogus wijzigt (niet bij elke klik).
  useEffect(() => {
    if (currentCardSlug) {
      setSelectedSlug(currentCardSlug)
    } else if (!user) {
      setSelectedSlug(defaultPlanSlug(activePlans))
    }
  }, [currentCardSlug, user, activePlans])

  const applyCode = async () => {
    setError(null)
    setInfo(null)
    if (!discountInput.trim()) {
      setDiscount(null)
      return
    }
    setDiscountBusy(true)
    try {
      const result = await validateDiscountCode(discountInput)
      setDiscount(result)
      if (!result.valid) {
        setError('Kortingscode is ongeldig of verlopen.')
      } else {
        setInfo(
          result.percent_off != null
            ? `Code ${result.code}: ${result.percent_off}% korting`
            : `Code ${result.code}: ${formatEuroFromCents(result.amount_off_cents ?? 0)} korting`,
        )
      }
    } catch (e) {
      setDiscount(null)
      setError(e instanceof Error ? e.message : 'Code controleren mislukt')
    } finally {
      setDiscountBusy(false)
    }
  }

  const effectiveCents = (plan: SubscriptionPlan) => {
    const base =
      plan.slug === 'paid_monthly' ? prices.paidMonthlyCents : plan.price_cents
    if (discount?.valid) return applyDiscountToCents(base, discount)
    return base
  }

  const start = async (plan: string) => {
    setError(null)
    setInfo(null)
    if (!user) {
      setAuthOpen(true)
      return
    }
    if (isFreePlan(plan)) {
      setError('Gratis plan heeft geen checkout.')
      return
    }
    const target = findPlanBySlug(activePlans, plan)
    if (!target || target.kind !== 'subscription') {
      setError('Kies een abonnement. Eenmalige ontgrendelingen koop je bij de functie in de editor.')
      return
    }
    setBusy(plan)
    try {
      const code =
        discount?.valid && discountInput.trim() ? discountInput.trim() : undefined
      const result = await startCheckout(plan, { discountCode: code })
      if (result.stubActivated) {
        await refreshProfile()
        setInfo(result.message ?? 'Geactiveerd (demo).')
        return
      }
      if (result.url) {
        window.location.href = result.url
        return
      }
      if (result.recurring_stage === 'subscription') {
        await refreshProfile()
        setInfo(
          result.message ??
            'Abonnement is gestart. De volgende incasso loopt automatisch via Mollie.',
        )
        return
      }
      setError(result.message ?? 'Checkout niet beschikbaar.')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Checkout mislukt')
    } finally {
      setBusy(null)
    }
  }

  const selectCard = (slug: string) => {
    setError(null)
    setSelectedSlug(slug)
  }

  const ctaForSelected = (): {
    label: string
    disabled: boolean
    action: (() => void) | null
    hint?: string
    secondary?: { label: string; action: () => void }
  } => {
    if (!user) {
      return {
        label: 'Log in om te selecteren',
        disabled: false,
        action: () => setAuthOpen(true),
      }
    }

    const isCurrent = currentCardSlug === selectedSlug
    const isCanceled = profile?.subscription_status === 'canceled'

    if (isFreePlan(selectedSlug)) {
      if (isCurrent) {
        return { label: 'Huidig plan', disabled: true, action: null }
      }
      return {
        label: 'Niet beschikbaar',
        disabled: true,
        action: null,
        hint: 'Om naar gratis te gaan: annuleer je abonnement bij “Jouw toegang”.',
      }
    }

    const selectedPlan = findPlanBySlug(displayPlans, selectedSlug)

    if (!selectedPlan || selectedPlan.kind !== 'subscription') {
      return { label: 'Kies dit abonnement', disabled: true, action: null }
    }

    if (isCurrent) {
      const cents = effectiveCents(selectedPlan)
      if (isCanceled) {
        return { label: 'Huidig plan', disabled: true, action: null }
      }
      return {
        label: 'Huidig plan',
        disabled: true,
        action: null,
        secondary: {
          label: `Verlengen (${formatEuroFromCents(cents)})`,
          action: () => void start(selectedPlan.slug),
        },
      }
    }

    const cents = effectiveCents(selectedPlan)
    const name = selectedPlan.name
    if (hasPaidSubscription && isSubscriptionPlan(currentCardSlug, activePlans)) {
      return {
        label: `Wijzig naar ${name}`,
        disabled: busy !== null,
        action: () => void start(selectedPlan.slug),
        hint: discount?.valid
          ? `Met code: ${formatEuroFromCents(cents)}`
          : undefined,
      }
    }

    const payLabel =
      selectedPlan.interval === 'month'
        ? `Kies dit abonnement — ${formatEuroFromCents(cents)} / maand`
        : `Kies dit abonnement — ${formatEuroFromCents(cents)}`

    return {
      label: payLabel,
      disabled: busy !== null,
      action: () => void start(selectedPlan.slug),
      hint: discount?.valid
        ? `Met code: ${formatEuroFromCents(cents)}`
        : undefined,
    }
  }

  const cta = ctaForSelected()

  return (
    <main className="app-page upgrade-page">
      <button type="button" className="linkish" onClick={() => navigate({ name: 'app' })}>
        ← Terug naar ontwerpen
      </button>
      <h1>Abonnement & aankopen</h1>
      <p className="upgrade-lead">
        Selecteer een abonnement en bevestig daaronder. Ontwerpen en een eenvoudige stuklijst
        blijven gratis. Een abonnement voegt cloud, publiceren en meer toe. Individuele functies
        (plattegrond, bestellijst, …) ontgrendel je per model wanneer je die in de editor tegenkomt.
      </p>

      <SubscriptionManageSection
        plans={activePlans}
        busy={busy}
        onMessage={(nextInfo, nextError) => {
          setInfo(nextInfo)
          setError(nextError)
        }}
      />

      <div className="upgrade-discount">
        <label>
          Kortingscode
          <span className="upgrade-discount-row">
            <input
              value={discountInput}
              onChange={(e) => {
                setDiscountInput(e.target.value)
                setDiscount(null)
              }}
              placeholder="Optioneel"
              autoComplete="off"
            />
            <button
              type="button"
              className="bom-action-btn secondary"
              disabled={discountBusy || !discountInput.trim()}
              onClick={() => void applyCode()}
            >
              {discountBusy ? '…' : 'Toepassen'}
            </button>
          </span>
        </label>
      </div>

      <PlanCards
        displayPlans={displayPlans}
        selectedSlug={selectedSlug}
        onSelect={selectCard}
        currentSlug={user ? currentCardSlug : null}
        effectiveCents={effectiveCents}
        discountValid={Boolean(discount?.valid)}
        subscriptionCanceled={profile?.subscription_status === 'canceled'}
      />

      <div className="upgrade-plan-cta">
        {cta.hint ? <p className="muted upgrade-plan-cta-hint">{cta.hint}</p> : null}
        <button
          type="button"
          className="bom-action-btn"
          disabled={cta.disabled || busy !== null}
          onClick={() => cta.action?.()}
        >
          {busy !== null ? 'Bezig…' : cta.label}
        </button>
        {cta.secondary ? (
          <button
            type="button"
            className="bom-action-btn secondary"
            disabled={busy !== null}
            onClick={() => cta.secondary?.action()}
          >
            {busy !== null ? 'Bezig…' : cta.secondary.label}
          </button>
        ) : null}
      </div>

      {isLocalStub && user && (
        <p className="muted">
          Demo:{' '}
          <button
            type="button"
            className="linkish"
            onClick={() => void demoSetExportPack(!exportOk).then(() => refreshProfile())}
          >
            {exportOk ? 'Printtoegang uit' : 'Printtoegang aan'}
          </button>
          {' · '}
          <button
            type="button"
            className="linkish"
            onClick={() => void demoSetPaid(!isPaid).then(() => refreshProfile())}
          >
            {isPaid ? 'Abonnement uitzetten' : 'Abonnement aanzetten'}
          </button>
          {' · '}
          <button
            type="button"
            className="linkish"
            onClick={() => void demoSetAdmin(!isAdmin).then(() => refreshProfile())}
          >
            {isAdmin ? 'Admin uitzetten' : 'Admin aanzetten'}
          </button>
        </p>
      )}
      {error && <p className="auth-error">{error}</p>}
      {info && <p className="auth-info">{info}</p>}
      <button type="button" className="linkish" onClick={() => void refreshProfile()}>
        Status vernieuwen
      </button>
      <p className="muted upgrade-methods-note">
        Maandabonnement: bij de eerste betaling vraagt Mollie toestemming voor automatische
        verlenging (mandate). Je ziet dan doorgaans creditcard en — als in Mollie ook{' '}
        <strong>SEPA Direct Debit</strong> aanstaat — iDEAL. Wero is (nog) niet beschikbaar voor
        abonnementen. Eenmalige functie-ontgrendelingen (in de editor) kunnen wél via iDEAL.
      </p>
      <p className="muted upgrade-legal">
        Door te betalen ga je akkoord met onze voorwaarden en privacyverklaring. Betaling via
        Mollie.
      </p>
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        initialMode="register"
        reason="Log in of maak een account om te selecteren (zodat we de aankoop aan je account kunnen koppelen)."
      />
    </main>
  )
}
