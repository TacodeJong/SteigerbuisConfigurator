import { FREE_PRIVATE_MODEL_LIMIT } from '../../lib/apiErrors'
import { formatEuroFromCents } from '../../lib/billing/appPricing'
import {
  isFreePlan,
  planFeatureLabelsForDisplay,
  planPriceHint,
  type SubscriptionPlan,
} from '../../lib/billing/plans'

function freeFeatureLabels(plan: SubscriptionPlan): string[] {
  const fromPlan = planFeatureLabelsForDisplay(plan)
  if (fromPlan.length > 0) return fromPlan
  const limit = plan.max_private_models ?? FREE_PRIVATE_MODEL_LIMIT
  return [
    'Ontwerpen maken in de editor',
    'Eenvoudige stuklijst',
    `Tot ${limit} privé cloud-modellen`,
  ]
}

export interface PlanCardsProps {
  /** Gratis + subscription-kaarten (via buildUpgradeDisplayPlans; geen one_time). */
  displayPlans: SubscriptionPlan[]
  selectedSlug: string
  onSelect: (slug: string) => void
  /** Huidig actief plan (upgrade); weglaten bij registratie. */
  currentSlug?: string | null
  /** Effectieve prijs (na korting); default plan.price_cents. */
  effectiveCents?: (plan: SubscriptionPlan) => number
  discountValid?: boolean
  /** Extra class op grid (bijv. auth-modal-plans). */
  className?: string
  /** Aria-label radiogroup. */
  ariaLabel?: string
  /** Toon “Huidig”-badge / statusregels (upgrade). */
  showCurrentBadge?: boolean
  subscriptionCanceled?: boolean
}

/**
 * Gedeelde abonnement-kaarten voor Upgrade en registratie.
 * Alleen Gratis + subscriptions — geen “Betaal per keer”-kaart.
 */
export function PlanCards({
  displayPlans,
  selectedSlug,
  onSelect,
  currentSlug = null,
  effectiveCents,
  discountValid = false,
  className,
  ariaLabel = 'Abonnementen',
  showCurrentBadge = true,
  subscriptionCanceled = false,
}: PlanCardsProps) {
  const centsOf = (plan: SubscriptionPlan) =>
    effectiveCents ? effectiveCents(plan) : plan.price_cents

  return (
    <div
      className={['upgrade-plans', className].filter(Boolean).join(' ')}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {displayPlans.map((plan) => {
        const free = isFreePlan(plan)
        const isCurrent = Boolean(currentSlug && currentSlug === plan.slug)
        const isSelected = selectedSlug === plan.slug
        const cents = free ? 0 : centsOf(plan)
        const featureLabels = free
          ? freeFeatureLabels(plan)
          : planFeatureLabelsForDisplay(plan)
        const cardClass = [
          'upgrade-plan-card',
          isCurrent ? 'upgrade-plan-card--current' : '',
          isSelected ? 'upgrade-plan-card--selected' : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <article
            key={plan.id || plan.slug}
            role="radio"
            aria-checked={isSelected}
            aria-current={isCurrent ? 'true' : undefined}
            tabIndex={0}
            className={cardClass}
            onClick={() => onSelect(plan.slug)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(plan.slug)
              }
            }}
          >
            {showCurrentBadge && isCurrent ? (
              <p className="upgrade-plan-badge">Huidig</p>
            ) : null}
            <h2>{plan.name}</h2>
            <p className="muted">{free ? '€0' : planPriceHint(plan)}</p>
            {discountValid && !free && !isCurrent ? (
              <p className="upgrade-discount-applied">
                Met code: {formatEuroFromCents(cents)}
              </p>
            ) : null}
            {plan.description ? (
              <p className="upgrade-plan-desc muted">{plan.description}</p>
            ) : null}
            {featureLabels.length > 0 ? (
              <ul className="upgrade-list">
                {featureLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            ) : null}
            {!free && plan.interval === 'month' ? (
              <p className="muted upgrade-period-note">
                1 maand toegang. Verlengd per maand. Maandelijks opzegbaar.
              </p>
            ) : null}

            {free && showCurrentBadge && isCurrent ? (
              <p className="upgrade-paid-ok">Geen abonnement — gratis account.</p>
            ) : null}

            {showCurrentBadge && isCurrent && !free ? (
              <p className="upgrade-paid-ok">
                {subscriptionCanceled
                  ? 'Abonnement actief tot einddatum — niet verlengen.'
                  : 'Dit is je huidige abonnement.'}
              </p>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
