import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../lib/auth/session'
import { fetchAdminDashboardStats, type AdminDashboardStats } from '../../lib/admin/stats'
import {
  fetchAdminVisitAnalytics,
  formatVisitRouteLabel,
  type AdminVisitAnalytics,
  type AdminVisitBreakdownRow,
  type AdminVisitLocationRow,
  type AdminVisitRange,
  type AdminVisitUtmRow,
} from '../../lib/analytics/visits'
import { AdminDeletedAccountsPanel } from './AdminDeletedAccountsPanel'
import { AdminTutorialsPanel } from './AdminTutorialsPanel'
import { AdminUsersPanel } from './AdminUsersPanel'
import { useModalA11y } from '../../hooks/useModalA11y'
import {
  defaultPlanPrices,
  fetchPlanPrices,
  formatEuroFromCents,
  savePlanPrices,
  type PlanPrices,
} from '../../lib/billing/appPricing'
import {
  adminClearProfileDiscount,
  adminDeleteDiscountCode,
  adminListDiscountCodes,
  adminListProfileDiscounts,
  adminSetProfileDiscount,
  adminUpsertDiscountCode,
  type DiscountCode,
  type ProfileDiscountRow,
} from '../../lib/billing/discounts'
import {
  adminCreateSubscriptionPlan,
  adminListSubscriptionPlans,
  adminUpdateSubscriptionPlan,
  DEFAULT_PLAN_FEATURES,
  FEATURE_FLAG_LABELS,
  syncUnlimitedSavesFeature,
  type PlanFeatureFlag,
  type PlanKind,
  type SubscriptionPlan,
} from '../../lib/billing/plans'
import {
  fetchMollieMode,
  saveMollieMode,
  type MollieMode,
} from '../../lib/billing/mollieMode'
import {
  defaultFeatureGates,
  fetchFeatureGates,
  GATED_FEATURE_DESCRIPTIONS,
  GATED_FEATURE_IDS,
  GATED_FEATURE_LABELS,
  saveFeatureGates,
  type FeatureGates,
  type GatedFeatureId,
} from '../../lib/billing/featureGates'
import {
  defaultFeaturePrices,
  fetchFeaturePrices,
  saveFeaturePrices,
  type FeaturePrices,
} from '../../lib/billing/featurePrices'
import { isSupabaseConfigured } from '../../lib/auth/supabaseClient'
import { navigate } from '../../lib/routing'
import { THEMES, THEME_IDS, type ThemeId } from '../../theme/themes'

type AdminTab =
  | 'dashboard'
  | 'users'
  | 'plans'
  | 'discounts'
  | 'payments'
  | 'paidFeatures'
  | 'features'
  | 'tutorials'

const ALL_FEATURE_FLAGS: PlanFeatureFlag[] = [
  'cloud_save',
  'open_from_disk',
  'publish',
  'fork',
  'full_print',
  'copy_order_list',
  'download_model',
  'full_pdf',
  'unlimited_saves',
]

interface AdminPageProps {
  theme: ThemeId
  onThemeChange: (theme: ThemeId) => void
  planksEnabled: boolean
  onPlanksEnabledChange: (enabled: boolean) => void | Promise<void>
}

export function AdminPage({
  theme,
  onThemeChange,
  planksEnabled,
  onPlanksEnabledChange,
}: AdminPageProps) {
  const { isAdmin, loading: authLoading, isLocalStub } = useAuth()
  const [tab, setTab] = useState<AdminTab>('dashboard')
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!isAdmin) {
      setDenied(true)
      const t = window.setTimeout(() => navigate({ name: 'app' }), 1800)
      return () => window.clearTimeout(t)
    }
    setDenied(false)
  }, [authLoading, isAdmin])

  if (authLoading) {
    return (
      <main className="app-page admin-page">
        <p className="muted">Laden…</p>
      </main>
    )
  }

  if (denied || !isAdmin) {
    return (
      <main className="app-page admin-page">
        <p className="auth-error">Geen toegang tot het beheerdersgedeelte. Je wordt teruggestuurd…</p>
        <button type="button" className="linkish" onClick={() => navigate({ name: 'app' })}>
          ← Terug naar ontwerpen
        </button>
      </main>
    )
  }

  return (
    <main className="app-page admin-page">
      <button type="button" className="linkish" onClick={() => navigate({ name: 'app' })}>
        ← Terug naar ontwerpen
      </button>
      <h1>Beheer</h1>
      <p className="muted admin-lead">
        Alleen voor accounts met <code>is_admin</code>
        {isLocalStub ? ' · lokale demo' : ''}.
      </p>

      <nav className="admin-tabs" aria-label="Beheersecties">
        {(
          [
            ['dashboard', 'Dashboard'],
            ['users', 'Gebruikers'],
            ['plans', 'Abonnementen'],
            ['discounts', 'Kortingen'],
            ['payments', 'Betalingen'],
            ['paidFeatures', 'Betaalde functies'],
            ['features', 'Functies & stijl'],
            ['tutorials', 'Tutorials'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'active' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'dashboard' && <AdminDashboard />}
      {tab === 'users' && <AdminUsersPanel />}
      {tab === 'plans' && <AdminPlans />}
      {tab === 'discounts' && <AdminDiscounts />}
      {tab === 'payments' && <AdminPayments />}
      {tab === 'paidFeatures' && <AdminPaidFeatures />}
      {tab === 'features' && (
        <AdminFeatures
          theme={theme}
          onThemeChange={onThemeChange}
          planksEnabled={planksEnabled}
          onPlanksEnabledChange={onPlanksEnabledChange}
        />
      )}
      {tab === 'tutorials' && <AdminTutorialsPanel />}
    </main>
  )
}

function AdminDashboard() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [visitRange, setVisitRange] = useState<AdminVisitRange>(30)
  const [visitStats, setVisitStats] = useState<AdminVisitAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const configured = isSupabaseConfigured()

  useEffect(() => {
    if (!configured) return
    void fetchAdminDashboardStats()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : 'Stats laden mislukt'))
  }, [configured])

  useEffect(() => {
    if (!configured) return
    void fetchAdminVisitAnalytics(visitRange)
      .then(setVisitStats)
      .catch((e) => setError(e instanceof Error ? e.message : 'Bezoekersstatistieken laden mislukt'))
  }, [configured, visitRange])

  if (!configured) {
    return (
      <>
        <section className="admin-section">
          <h2>Dashboard</h2>
          <p className="muted">
            Statistieken vereisen Supabase. Lokaal zie je hier placeholder-kaarten.
          </p>
          <div className="admin-stat-grid">
            <StatCard label="Accounts" value="—" hint="Komt later / stub" />
            <StatCard label="Abonnees (maand)" value="—" hint="Komt later / stub" />
            <StatCard label="Gepubliceerde modellen" value="—" hint="Komt later / stub" />
            <StatCard label="Bezoeken" value="—" hint="Vereist Supabase + migratie" />
            <StatCard label="Unieke bezoekers" value="—" hint="Vereist Supabase + migratie" />
          </div>
        </section>
        <AdminDeletedAccountsPanel />
      </>
    )
  }

  return (
    <>
      <section className="admin-section">
        <h2>Dashboard</h2>
        {error && <p className="auth-error">{error}</p>}
        <div className="admin-stat-grid">
          <StatCard
            label="Accounts"
            value={stats?.profiles != null ? String(stats.profiles) : '…'}
          />
          <StatCard
            label="Abonnees (maand)"
            value={stats?.paid_users != null ? String(stats.paid_users) : '…'}
            hint="Actief (niet verlopen)"
          />
          <StatCard
            label="Gepubliceerde modellen"
            value={
              stats?.published_models != null ? String(stats.published_models) : '…'
            }
          />
          <StatCard
            label="Bezoeken"
            value={visitStats != null ? String(visitStats.totalVisits) : '…'}
            hint={`${visitRange} dagen`}
          />
          <StatCard
            label="Unieke bezoekers"
            value={visitStats != null ? String(visitStats.uniqueVisitors) : '…'}
            hint={`${visitRange} dagen`}
          />
        </div>
        <section style={{ marginTop: '1.1rem' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              marginBottom: '0.65rem',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '0.98rem' }}>Bezoekersverloop</h3>
            <AnalyticsRangeSelector value={visitRange} onChange={setVisitRange} />
          </div>
          <AdminVisitsChart data={visitStats} />
        </section>
        <AdminVisitBreakdowns data={visitStats} />
      </section>
      <AdminDeletedAccountsPanel />
    </>
  )
}

function AdminVisitBreakdowns({ data }: { data: AdminVisitAnalytics | null }) {
  if (!data) return null

  return (
    <>
      <section style={{ marginTop: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.65rem', fontSize: '0.98rem' }}>{'Populaire pagina\'s'}</h3>
        <div className="admin-analytics-breakdowns">
          <AdminBreakdownTable
            title="Populaire routes"
            rows={data.topRoutes}
            formatLabel={formatVisitRouteLabel}
            empty="Nog geen route-data in deze periode."
          />
          <AdminBreakdownTable
            title="Populaire paden"
            rows={data.topPaths}
            empty="Nog geen pad-data in deze periode."
            mono
          />
        </div>
      </section>
      <section style={{ marginTop: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.98rem' }}>Herkomst & apparaat</h3>
        <p className="muted" style={{ margin: '0 0 0.85rem', fontSize: '0.82rem' }}>
          Locatie is grof (browser-timezone / taalregio), geen IP. Oude bezoeken zonder dimensies
          vallen onder Onbekend.
        </p>
        <div className="admin-analytics-breakdowns">
          <AdminBreakdownTable title="Browsers" rows={data.browsers} />
          <AdminBreakdownTable title="Besturingssystemen" rows={data.oses} />
          <AdminBreakdownTable title="Referrers" rows={data.referrers} empty="Nog geen referrer-data." />
          <AdminLocationTable rows={data.locations} />
          <AdminUtmTable rows={data.utm} />
        </div>
      </section>
    </>
  )
}

function AdminBreakdownTable({
  title,
  rows,
  empty = 'Nog geen data in deze periode.',
  formatLabel,
  mono = false,
}: {
  title: string
  rows: AdminVisitBreakdownRow[]
  empty?: string
  formatLabel?: (key: string) => string
  mono?: boolean
}) {
  const maxVisits = Math.max(1, ...rows.map((r) => r.visits))
  return (
    <article className="admin-analytics-panel">
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <table className="admin-analytics-table">
          <thead>
            <tr>
              <th scope="col">Label</th>
              <th scope="col">Visits</th>
              <th scope="col">Uniek</th>
              <th scope="col" className="admin-analytics-bar-col">
                Verdeling
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const label = formatLabel ? formatLabel(row.key) : row.key
              return (
                <tr key={row.key}>
                  <td
                    title={row.key !== label ? row.key : undefined}
                    style={mono ? { fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' } : undefined}
                  >
                    {label}
                  </td>
                  <td>{row.visits}</td>
                  <td>{row.uniques}</td>
                  <td className="admin-analytics-bar-col">
                    <span
                      className="admin-analytics-bar"
                      style={{ width: `${Math.round((row.visits / maxVisits) * 100)}%` }}
                      title={`${row.visits} visits`}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </article>
  )
}

function AdminLocationTable({ rows }: { rows: AdminVisitLocationRow[] }) {
  const maxVisits = Math.max(1, ...rows.map((r) => r.visits))
  return (
    <article className="admin-analytics-panel">
      <h4>Locatie</h4>
      {rows.length === 0 ? (
        <p className="muted">Nog geen locatie-data.</p>
      ) : (
        <table className="admin-analytics-table">
          <thead>
            <tr>
              <th scope="col">Land / zone</th>
              <th scope="col">Visits</th>
              <th scope="col">Uniek</th>
              <th scope="col" className="admin-analytics-bar-col">
                Verdeling
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const label =
                row.countryCode && row.timezone
                  ? `${row.countryCode} · ${row.timezone}`
                  : row.key
              return (
                <tr key={`${row.key}:${row.timezone ?? ''}`}>
                  <td title={row.timezone ?? undefined}>{label}</td>
                  <td>{row.visits}</td>
                  <td>{row.uniques}</td>
                  <td className="admin-analytics-bar-col">
                    <span
                      className="admin-analytics-bar"
                      style={{ width: `${Math.round((row.visits / maxVisits) * 100)}%` }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </article>
  )
}

function AdminUtmTable({ rows }: { rows: AdminVisitUtmRow[] }) {
  return (
    <article className="admin-analytics-panel admin-analytics-panel-wide">
      <h4>UTM-campagnes</h4>
      {rows.length === 0 ? (
        <p className="muted">Geen UTM-parameters in deze periode.</p>
      ) : (
        <table className="admin-analytics-table">
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Medium</th>
              <th scope="col">Campaign</th>
              <th scope="col">Visits</th>
              <th scope="col">Uniek</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.source}|${row.medium}|${row.campaign}`}>
                <td>{row.source}</td>
                <td>{row.medium}</td>
                <td>{row.campaign}</td>
                <td>{row.visits}</td>
                <td>{row.uniques}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  )
}

function AnalyticsRangeSelector({
  value,
  onChange,
}: {
  value: AdminVisitRange
  onChange: (value: AdminVisitRange) => void
}) {
  const options: AdminVisitRange[] = [7, 30, 90]
  return (
    <div
      role="group"
      aria-label="Periode"
      style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8 }}
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          style={{
            border: 0,
            borderRight: option === options[options.length - 1] ? 0 : '1px solid var(--border)',
            background: value === option ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface)',
            color: value === option ? 'var(--accent)' : 'var(--text)',
            font: 'inherit',
            fontSize: '0.82rem',
            fontWeight: value === option ? 700 : 400,
            padding: '0.3rem 0.55rem',
            cursor: 'pointer',
          }}
          onClick={() => onChange(option)}
        >
          {option}d
        </button>
      ))}
    </div>
  )
}

function niceYTicks(maxValue: number): number[] {
  if (maxValue <= 0) return [0]
  if (maxValue <= 4) {
    return Array.from({ length: maxValue + 1 }, (_, i) => i)
  }
  const rough = maxValue / 3
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  const stepBase =
    normalized <= 1.5 ? 1 : normalized <= 3 ? 2 : normalized <= 7 ? 5 : 10
  const step = stepBase * magnitude
  const ticks: number[] = [0]
  for (let v = step; v < maxValue; v += step) ticks.push(v)
  if (ticks[ticks.length - 1] !== maxValue) ticks.push(maxValue)
  return ticks
}

function chartLabelStep(count: number, granularity: 'hour' | 'day'): number {
  if (granularity === 'hour') {
    if (count <= 24) return 4
    if (count <= 48) return 6
    return 12
  }
  // 7d: every day; 30d / 90d: spaced ticks still under the axis
  if (count <= 7) return 1
  if (count <= 14) return 2
  if (count <= 31) return 5
  return Math.ceil(count / 10)
}

function formatChartLabel(bucket: string, granularity: 'hour' | 'day'): string {
  const date = new Date(bucket)
  if (Number.isNaN(date.getTime())) return bucket.slice(0, 10)
  if (granularity === 'hour') {
    return date.toLocaleString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
    })
  }
  return date.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' })
}

function barHeightPct(value: number, maxValue: number): number {
  if (value <= 0 || maxValue <= 0) return 0
  // Keep tiny non-zero days visible next to a spike (linear scale).
  return Math.max((value / maxValue) * 100, 4)
}

function AdminVisitsChart({ data }: { data: AdminVisitAnalytics | null }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  if (!data) {
    return <p className="muted">Bezoekersdata laden…</p>
  }
  if (data.series.length === 0) {
    return <p className="muted">Nog geen bezoekersdata in deze periode.</p>
  }

  const maxValue = Math.max(
    1,
    ...data.series.flatMap((point) => [point.visits, point.uniques]),
  )
  const yTicks = niceYTicks(maxValue)
  const labelEvery = chartLabelStep(data.series.length, data.granularity)
  const hoverPoint = hoverIndex != null ? data.series[hoverIndex] : null
  const hoverLabel =
    hoverPoint != null ? formatChartLabel(hoverPoint.bucket, data.granularity) : ''

  return (
    <div
      className="admin-visits-chart"
      role="img"
      aria-label="Tijdsverloop bezoekers en unieke bezoekers"
    >
      <div className="admin-visits-chart-body">
        <div className="admin-visits-chart-y" aria-hidden>
          {yTicks
            .slice()
            .reverse()
            .map((tick) => (
              <span key={tick} className="admin-visits-chart-y-tick">
                {tick}
              </span>
            ))}
        </div>
        <div className="admin-visits-chart-plot-area">
          <div className="admin-visits-chart-grid" aria-hidden>
            {yTicks.map((tick) => (
              <span
                key={tick}
                className="admin-visits-chart-gridline"
                style={{ bottom: `${(tick / maxValue) * 100}%` }}
              />
            ))}
          </div>
          <div className="admin-visits-chart-bars">
            {data.series.map((point, index) => {
              const label = formatChartLabel(point.bucket, data.granularity)
              const visitsPct = barHeightPct(point.visits, maxValue)
              const uniquesPct = barHeightPct(point.uniques, maxValue)
              return (
                <div
                  key={`${point.bucket}:${index}`}
                  className={`admin-visits-chart-col${hoverIndex === index ? ' is-hover' : ''}`}
                  onMouseEnter={() => setHoverIndex(index)}
                  onMouseLeave={() => setHoverIndex(null)}
                  onFocus={() => setHoverIndex(index)}
                  onBlur={() => setHoverIndex(null)}
                  tabIndex={0}
                  aria-label={`${label}: ${point.visits} visits, ${point.uniques} uniek`}
                >
                  <div className="admin-visits-chart-pair">
                    <span
                      className="admin-visits-chart-bar visits"
                      style={{ height: `${visitsPct}%` }}
                    />
                    <span
                      className="admin-visits-chart-bar uniques"
                      style={{ height: `${uniquesPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          {hoverPoint && (
            <div className="admin-visits-chart-tooltip" role="tooltip">
              <strong>{hoverLabel}</strong>
              <span>Visits: {hoverPoint.visits}</span>
              <span>Uniek: {hoverPoint.uniques}</span>
            </div>
          )}
        </div>
        <div className="admin-visits-chart-x" aria-hidden>
          {data.series.map((point, index) => {
            const showLabel =
              index === 0 ||
              index === data.series.length - 1 ||
              index % labelEvery === 0
            const label = formatChartLabel(point.bucket, data.granularity)
            return (
              <span
                key={`x:${point.bucket}:${index}`}
                className={`admin-visits-chart-xlabel${showLabel ? '' : ' is-hidden'}`}
              >
                {showLabel ? label : '\u00a0'}
              </span>
            )
          })}
        </div>
      </div>
      <div className="admin-visits-chart-legend">
        <span>
          <i className="admin-visits-chart-swatch visits" aria-hidden /> Visits
        </span>
        <span>
          <i className="admin-visits-chart-swatch uniques" aria-hidden /> Uniek
        </span>
        <span className="admin-visits-chart-ymax">Max {maxValue}</span>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <article className="admin-stat-card">
      <p className="admin-stat-label">{label}</p>
      <p className="admin-stat-value">{value}</p>
      {hint && <p className="muted admin-stat-hint">{hint}</p>}
    </article>
  )
}

function AdminPlans() {
  const configured = isSupabaseConfigured()
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<PlanKind>('subscription')
  const [priceEuro, setPriceEuro] = useState('7.00')
  const [features, setFeatures] = useState<PlanFeatureFlag[]>([
    ...DEFAULT_PLAN_FEATURES.paid_monthly,
  ])
  const [isActive, setIsActive] = useState(true)
  const [isDefault, setIsDefault] = useState(false)
  const [sortOrder, setSortOrder] = useState('100')
  const [maxPrivateModels, setMaxPrivateModels] = useState('3')

  const reload = async () => {
    const rows = await adminListSubscriptionPlans()
    setPlans(rows)
  }

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : 'Plannen laden mislukt'),
    )
  }, [configured])

  const resetForm = () => {
    setEditingId(null)
    setSlug('')
    setName('')
    setDescription('')
    setKind('subscription')
    setPriceEuro('7.00')
    setFeatures([...DEFAULT_PLAN_FEATURES.paid_monthly])
    setIsActive(true)
    setIsDefault(false)
    setSortOrder('100')
    setMaxPrivateModels('3')
  }

  const closeModal = () => {
    if (busy) return
    setModalOpen(false)
    resetForm()
    setError(null)
  }

  useModalA11y({
    open: modalOpen,
    onClose: closeModal,
    containerRef: dialogRef,
    closeOnEscape: modalOpen && !busy,
  })

  const startCreate = () => {
    resetForm()
    setError(null)
    setInfo(null)
    setModalOpen(true)
  }

  const startEdit = (plan: SubscriptionPlan) => {
    setEditingId(plan.id)
    setSlug(plan.slug)
    setName(plan.name)
    setDescription(plan.description)
    setKind(plan.kind)
    setPriceEuro((plan.price_cents / 100).toFixed(2))
    setFeatures([...plan.features])
    setIsActive(plan.is_active)
    setIsDefault(Boolean(plan.is_default))
    setSortOrder(String(plan.sort_order))
    setMaxPrivateModels(
      plan.max_private_models == null ? '' : String(plan.max_private_models),
    )
    setError(null)
    setInfo(null)
    setModalOpen(true)
  }

  const toggleFeature = (flag: PlanFeatureFlag) => {
    setFeatures((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag],
    )
  }

  const save = async () => {
    setError(null)
    setInfo(null)
    const cents = Math.round(Number.parseFloat(priceEuro.replace(',', '.')) * 100)
    const order = Number.parseInt(sortOrder, 10)
    const maxTrim = maxPrivateModels.trim()
    let maxModels: number | null = null
    if (maxTrim !== '') {
      const parsed = Number.parseInt(maxTrim, 10)
      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('Max. privémodellen moet leeg (onbeperkt) of ≥ 0 zijn.')
        return
      }
      maxModels = parsed
    }
    const syncedFeatures = syncUnlimitedSavesFeature(features, maxModels)
    if (!editingId && !slug.trim()) {
      setError('Slug is verplicht (bijv. paid_monthly).')
      return
    }
    if (!name.trim()) {
      setError('Naam is verplicht.')
      return
    }
    const isFreeKind = kind === 'free'
    if (isFreeKind) {
      if (!Number.isFinite(cents) || cents !== 0) {
        setError('Gratis-plan moet €0 zijn.')
        return
      }
    } else if (!Number.isFinite(cents) || cents < 1) {
      setError('Prijs ongeldig (min. €0,01).')
      return
    }
    setBusy(true)
    try {
      if (editingId) {
        await adminUpdateSubscriptionPlan({
          id: editingId,
          name: name.trim(),
          description: description.trim(),
          price_cents: isFreeKind ? 0 : cents,
          features: syncedFeatures,
          is_active: isActive,
          sort_order: Number.isFinite(order) ? order : 100,
          interval: kind === 'subscription' ? 'month' : null,
          max_private_models: maxModels,
          setMaxPrivateModels: true,
          is_default: isDefault,
        })
        setInfo('Plan bijgewerkt. Bekende slugs syncen prijs naar app_settings.')
      } else {
        await adminCreateSubscriptionPlan({
          slug: slug.trim(),
          name: name.trim(),
          description: description.trim(),
          kind,
          price_cents: isFreeKind ? 0 : cents,
          interval: kind === 'subscription' ? 'month' : null,
          features: syncedFeatures,
          is_active: isActive,
          sort_order: Number.isFinite(order) ? order : 100,
          max_private_models: maxModels,
          is_default: isDefault,
        })
        setInfo('Plan aangemaakt.')
      }
      setModalOpen(false)
      resetForm()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-section">
      <h2>Abonnementen</h2>
      {!configured && (
        <p className="auth-info">Lokale demo: plannen in localStorage (geen Supabase).</p>
      )}
      <p className="muted">
        <code>subscription_plans</code> is leidend voor checkout. Soft-deactiveren via{' '}
        <code>is_active</code> (geen hard delete). Slugs <code>paid_monthly</code> /{' '}
        <code>export_once</code> syncen prijs naar <code>app_settings</code> als legacy
        fallback. Het <strong>standaardplan</strong> (meestal Gratis) wordt bij
        account-aanmaak toegekend.
      </p>

      <AdminPlanPricesQuickEdit onSaved={() => void reload()} />

      <div className="admin-plans-heading">
        <h3>Alle plannen</h3>
        <button type="button" className="bom-action-btn" onClick={startCreate}>
          Nieuw plan
        </button>
      </div>
      <ul className="admin-list">
        {plans.length === 0 && <li className="muted">Nog geen plannen (migratie pushen?).</li>}
        {plans.map((p) => (
          <li key={p.id} className="admin-list-item">
            <div>
              <strong>{p.name}</strong>
              {' · '}
              <code>{p.slug}</code>
              {' · '}
              {p.kind === 'subscription'
                ? 'abonnement'
                : p.kind === 'free'
                  ? 'gratis'
                  : 'betaal per keer'}
              {' · '}
              {formatEuroFromCents(p.price_cents)}
              {p.kind === 'subscription' ? ' / maand' : ''}
              {p.is_default ? ' · standaard' : ''}
              {p.is_active ? '' : ' · inactief'}
              <br />
              <span className="muted">
                {p.features.length
                  ? p.features.map((f) => FEATURE_FLAG_LABELS[f] ?? f).join(', ')
                  : 'geen features'}
                {' · '}
                {p.max_private_models == null
                  ? 'onbeperkt privémodellen'
                  : `max. ${p.max_private_models} privémodellen`}
              </span>
            </div>
            <button type="button" className="linkish" onClick={() => startEdit(p)}>
              Bewerken
            </button>
          </li>
        ))}
      </ul>
      {!modalOpen && error && <p className="auth-error">{error}</p>}
      {info && <p className="auth-info">{info}</p>}

      {modalOpen &&
        createPortal(
          <div
            className="auth-modal-backdrop"
            role="presentation"
            onClick={closeModal}
          >
            <div
              ref={dialogRef}
              className="auth-modal admin-plan-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-plan-modal-title"
              tabIndex={-1}
              onClick={(ev) => ev.stopPropagation()}
            >
              <header className="auth-modal-header">
                <h2 id="admin-plan-modal-title">
                  {editingId ? 'Plan bewerken' : 'Nieuw plan'}
                </h2>
                <button
                  type="button"
                  className="auth-modal-close"
                  onClick={closeModal}
                  disabled={busy}
                  aria-label="Sluiten"
                  data-modal-initial-skip
                >
                  ✕
                </button>
              </header>

              <div className="admin-form-grid">
                <label>
                  Slug
                  <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="paid_monthly"
                    disabled={Boolean(editingId) || busy}
                  />
                </label>
                <label>
                  Naam
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label>
                  Soort
                  <select
                    value={kind}
                    onChange={(e) => {
                      const next = e.target.value as PlanKind
                      setKind(next)
                      if (!editingId) {
                        if (next === 'one_time') {
                          setFeatures([...DEFAULT_PLAN_FEATURES.export_once])
                          setPriceEuro('5.00')
                          setIsDefault(false)
                        } else if (next === 'free') {
                          setFeatures([])
                          setPriceEuro('0.00')
                          setIsDefault(true)
                        } else {
                          setFeatures([...DEFAULT_PLAN_FEATURES.paid_monthly])
                          setPriceEuro('7.00')
                          setIsDefault(false)
                        }
                      } else if (next === 'free') {
                        setPriceEuro('0.00')
                      }
                    }}
                    disabled={Boolean(editingId) || busy}
                  >
                    <option value="subscription">Abonnement (maand)</option>
                    <option value="one_time">Betaal per keer</option>
                    <option value="free">Gratis</option>
                  </select>
                </label>
                <label>
                  Prijs €
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceEuro}
                    onChange={(e) => setPriceEuro(e.target.value)}
                    disabled={busy || kind === 'free'}
                  />
                </label>
                <label>
                  Volgorde (lijst)
                  <input
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    inputMode="numeric"
                    disabled={busy}
                  />
                  <span className="muted admin-field-hint">
                    Lager = hoger in de adminlijst. Vergelijkingskaarten op de upgrade-pagina
                    sorteren vooral op features (tier), niet alleen op dit getal.
                  </span>
                </label>
                <label>
                  Max. privémodellen
                  <input
                    value={maxPrivateModels}
                    onChange={(e) => setMaxPrivateModels(e.target.value)}
                    placeholder="leeg = onbeperkt"
                    inputMode="numeric"
                    disabled={busy}
                  />
                  <span className="muted admin-field-hint">
                    Leeg = onbeperkt (zet automatisch <code>unlimited_saves</code> bij
                    cloud-opslag). 0 = geen cloud-quota.
                  </span>
                </label>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    disabled={busy}
                  />
                  Actief
                </label>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    disabled={busy}
                  />
                  Standaardplan
                  <span className="muted admin-field-hint">
                    Bij opslaan worden andere standaardplannen uitgeschakeld. Nieuwe accounts
                    krijgen dit plan.
                  </span>
                </label>
              </div>
              <label className="admin-textarea-label">
                Beschrijving
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  disabled={busy}
                />
              </label>
              <fieldset className="admin-feature-flags" disabled={busy}>
                <legend>Features</legend>
                {ALL_FEATURE_FLAGS.map((flag) => (
                  <label key={flag} className="admin-check">
                    <input
                      type="checkbox"
                      checked={features.includes(flag)}
                      onChange={() => toggleFeature(flag)}
                      disabled={busy}
                    />
                    {FEATURE_FLAG_LABELS[flag]} <code>{flag}</code>
                  </label>
                ))}
              </fieldset>
              {error && <p className="auth-modal-error">{error}</p>}
              <div className="auth-modal-actions">
                <button
                  type="button"
                  className="bom-action-btn secondary"
                  disabled={busy}
                  onClick={closeModal}
                >
                  Annuleren
                </button>
                <button
                  type="button"
                  className="bom-action-btn"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {busy ? 'Opslaan…' : editingId ? 'Wijzigingen opslaan' : 'Plan aanmaken'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  )
}

function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2)
}

function AdminPlanPricesQuickEdit({ onSaved }: { onSaved?: () => void }) {
  const defaults = defaultPlanPrices()
  const [prices, setPrices] = useState<PlanPrices>(defaults)
  const [paidEuro, setPaidEuro] = useState(centsToEuroInput(defaults.paidMonthlyCents))
  const [exportEuro, setExportEuro] = useState(centsToEuroInput(defaults.exportOnceCents))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const configured = isSupabaseConfigured()

  useEffect(() => {
    void fetchPlanPrices().then((p) => {
      setPrices(p)
      setPaidEuro(centsToEuroInput(p.paidMonthlyCents))
      setExportEuro(centsToEuroInput(p.exportOnceCents))
    })
  }, [])

  const save = async () => {
    setError(null)
    setMsg(null)
    const paidCents = Math.round(Number.parseFloat(paidEuro.replace(',', '.')) * 100)
    const exportCents = Math.round(Number.parseFloat(exportEuro.replace(',', '.')) * 100)
    if (!Number.isFinite(paidCents) || paidCents < 1) {
      setError('Maandabonnement-prijs ongeldig (min. €0,01).')
      return
    }
    if (!Number.isFinite(exportCents) || exportCents < 1) {
      setError('Betaal-per-keer-prijs ongeldig (min. €0,01).')
      return
    }
    setBusy(true)
    try {
      await savePlanPrices({ paidMonthlyCents: paidCents, exportOnceCents: exportCents })
      setPrices({ paidMonthlyCents: paidCents, exportOnceCents: exportCents })
      setMsg(
        'Opgeslagen op subscription_plans (paid_monthly / export_once); prijs gesynchroniseerd naar app_settings.',
      )
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-plan-prices">
      <h3>Checkout-prijzen (snel)</h3>
      <p className="muted">
        Werkt via plan-rows <code>paid_monthly</code> en <code>export_once</code> — niet alleen
        app_settings. Zelfde bron als Mollie-checkout.
      </p>
      {!configured && (
        <p className="auth-info">Lokale demo: opslaan werkt niet zonder Supabase.</p>
      )}
      <div className="admin-form-grid">
        <label>
          Maandabonnement €
          <input
            type="text"
            inputMode="decimal"
            value={paidEuro}
            onChange={(e) => setPaidEuro(e.target.value)}
          />
        </label>
        <label>
          Betaal per keer €
          <input
            type="text"
            inputMode="decimal"
            value={exportEuro}
            onChange={(e) => setExportEuro(e.target.value)}
          />
        </label>
      </div>
      <p className="muted">
        Nu: Maandabonnement {formatEuroFromCents(prices.paidMonthlyCents)} · Betaal per keer{' '}
        {formatEuroFromCents(prices.exportOnceCents)}
      </p>
      <button
        type="button"
        className="bom-action-btn"
        disabled={busy || !configured}
        onClick={() => void save()}
      >
        {busy ? 'Opslaan…' : 'Prijzen opslaan'}
      </button>
      {error && <p className="auth-error">{error}</p>}
      {msg && <p className="auth-info">{msg}</p>}
    </div>
  )
}

function AdminPayments() {
  const configured = isSupabaseConfigured()
  const [mode, setMode] = useState<MollieMode>('test')
  const [draft, setDraft] = useState<MollieMode>('test')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return
    }
    setLoading(true)
    void fetchMollieMode()
      .then((m) => {
        setMode(m)
        setDraft(m)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Modus laden mislukt'))
      .finally(() => setLoading(false))
  }, [configured])

  const save = async () => {
    setError(null)
    setMsg(null)
    setBusy(true)
    try {
      await saveMollieMode(draft)
      setMode(draft)
      setMsg(
        draft === 'live'
          ? 'Live-modus opgeslagen. Nieuwe checkouts gebruiken MOLLIE_API_KEY_LIVE (echte betalingen).'
          : 'Test-modus opgeslagen. Nieuwe checkouts gebruiken MOLLIE_API_KEY_TEST.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <section className="admin-section">
        <h2>Betalingen (Mollie)</h2>
        <p className="muted">Vereist Supabase. API-keys staan nooit in de database of browser.</p>
      </section>
    )
  }

  return (
    <section className="admin-section">
      <h2>Betalingen (Mollie)</h2>
      <p className="muted">
        Wissel tussen Mollie <strong>test</strong>- en <strong>live</strong>-API. De modus staat in{' '}
        <code>app_settings.mollie_mode</code>; de sleutels blijven Edge Function secrets (
        <code>MOLLIE_API_KEY_TEST</code> / <code>MOLLIE_API_KEY_LIVE</code>).
      </p>
      {loading ? (
        <p className="muted">Laden…</p>
      ) : (
        <>
          <p>
            Huidige modus:{' '}
            <strong className={mode === 'live' ? 'admin-mollie-live' : 'admin-mollie-test'}>
              {mode === 'live' ? 'Live' : 'Test'}
            </strong>
          </p>
          <fieldset className="admin-mollie-mode">
            <legend>API-modus</legend>
            <label className="admin-check">
              <input
                type="radio"
                name="mollie_mode"
                checked={draft === 'test'}
                onChange={() => setDraft('test')}
              />
              Test — geen echte betalingen (<code>test_…</code>)
            </label>
            <label className="admin-check">
              <input
                type="radio"
                name="mollie_mode"
                checked={draft === 'live'}
                onChange={() => setDraft('live')}
              />
              Live — echte betalingen (<code>live_…</code>)
            </label>
          </fieldset>
          {draft === 'live' && (
            <p className="auth-error admin-mollie-warn" role="alert">
              Let op: Live-modus verwerkt echte betalingen via je Mollie live-account. Zet alleen Live
              als <code>MOLLIE_API_KEY_LIVE</code> correct is geconfigureerd in Supabase secrets.
            </p>
          )}
          <button
            type="button"
            className="bom-action-btn"
            disabled={busy || draft === mode}
            onClick={() => void save()}
          >
            {busy ? 'Opslaan…' : 'Modus opslaan'}
          </button>
        </>
      )}
      {error && <p className="auth-error">{error}</p>}
      {msg && <p className="auth-info">{msg}</p>}
      <p className="muted admin-note">
        Webhook-URL is hetzelfde voor test en live (
        <code>…/functions/v1/mollie-webhook</code>). Mollie stuurt per payment; checkout zet{' '}
        <code>mollie_mode</code> in metadata zodat de webhook de juiste secret gebruikt. Live
        vereist <code>MOLLIE_API_KEY_LIVE</code> (geen stille fallback naar een test-sleutel).
      </p>
      <p className="muted admin-note">
        Voor maandabonnementen (mandate flow, <code>sequenceType=first</code>) toont Mollie alleen
        methodes die een mandate kunnen aanmaken. In het Mollie-dashboard (English UI,{' '}
        <strong>Live</strong>): <strong>Settings → Website profiles</strong> → je live profile →{' '}
        <strong>Payment methods</strong> → zet <strong>Credit card</strong> aan. Voor iDEAL bij de
        eerste abonnementsbetaling: zet <strong>iDEAL</strong> én <strong>SEPA Direct Debit</strong>{' '}
        aan (iDEAL-mandate = Direct Debit; alleen one-off iDEAL is niet genoeg).{' '}
        <strong>Wero</strong> ondersteunt (nog) geen Mollie first-payment/mandate voor abonnementen —
        ook als Wero voor one-off actief is, verschijnt het niet bij subscriptions.
      </p>
    </section>
  )
}

function AdminDiscounts() {
  const configured = isSupabaseConfigured()
  const [codes, setCodes] = useState<DiscountCode[]>([])
  const [profiles, setProfiles] = useState<ProfileDiscountRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [percent, setPercent] = useState('10')
  const [validUntil, setValidUntil] = useState('')
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)

  const [userEmail, setUserEmail] = useState('')
  const [userPercent, setUserPercent] = useState('15')
  const [userUntil, setUserUntil] = useState('')
  const [userNote, setUserNote] = useState('')

  const reload = async () => {
    if (!configured) return
    const [c, p] = await Promise.all([
      adminListDiscountCodes(),
      adminListProfileDiscounts(),
    ])
    setCodes(c)
    setProfiles(p)
  }

  useEffect(() => {
    if (!configured) return
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : 'Kortingen laden mislukt'),
    )
  }, [configured])

  const createCode = async () => {
    setError(null)
    setInfo(null)
    const pct = Number.parseFloat(percent.replace(',', '.'))
    if (!code.trim()) {
      setError('Code is verplicht.')
      return
    }
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      setError('Percentage tussen 0 en 100.')
      return
    }
    setBusy(true)
    try {
      await adminUpsertDiscountCode({
        code: code.trim(),
        percent_off: pct,
        amount_off_cents: null,
        valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        active,
      })
      setCode('')
      setInfo('Kortingscode opgeslagen.')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setBusy(false)
    }
  }

  const grantUser = async () => {
    setError(null)
    setInfo(null)
    const pct = Number.parseFloat(userPercent.replace(',', '.'))
    if (!userEmail.trim()) {
      setError('E-mail is verplicht.')
      return
    }
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      setError('Percentage tussen 0 en 100.')
      return
    }
    setBusy(true)
    try {
      await adminSetProfileDiscount({
        email: userEmail.trim(),
        percent_off: pct,
        valid_until: userUntil ? new Date(userUntil).toISOString() : null,
        note: userNote.trim() || null,
      })
      setUserEmail('')
      setUserNote('')
      setInfo('Persoonlijke korting toegekend.')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toekennen mislukt')
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <section className="admin-section">
        <h2>Kortingen</h2>
        <p className="muted">Vereist Supabase + migratie <code>admin_pricing_discounts</code>.</p>
      </section>
    )
  }

  return (
    <section className="admin-section">
      <h2>Kortingscodes</h2>
      <div className="admin-form-grid">
        <label>
          Code
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="LENTE10" />
        </label>
        <label>
          Korting %
          <input value={percent} onChange={(e) => setPercent(e.target.value)} />
        </label>
        <label>
          Geldig tot (optioneel)
          <input
            type="datetime-local"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </label>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Actief
        </label>
      </div>
      <button
        type="button"
        className="bom-action-btn"
        disabled={busy}
        onClick={() => void createCode()}
      >
        Code aanmaken
      </button>

      <ul className="admin-list">
        {codes.length === 0 && <li className="muted">Nog geen codes.</li>}
        {codes.map((c) => (
          <li key={c.id} className="admin-list-item">
            <div>
              <strong>{c.code}</strong>
              {' · '}
              {c.percent_off != null
                ? `${c.percent_off}%`
                : c.amount_off_cents != null
                  ? formatEuroFromCents(c.amount_off_cents)
                  : '—'}
              {c.active ? '' : ' · inactief'}
              {c.valid_until
                ? ` · tot ${new Date(c.valid_until).toLocaleString('nl-NL')}`
                : ''}
            </div>
            <button
              type="button"
              className="linkish"
              onClick={() =>
                void adminDeleteDiscountCode(c.id)
                  .then(reload)
                  .catch((e) =>
                    setError(e instanceof Error ? e.message : 'Verwijderen mislukt'),
                  )
              }
            >
              Verwijderen
            </button>
          </li>
        ))}
      </ul>

      <h2>Persoonlijke korting</h2>
      <p className="muted">Ken een % korting toe via e-mail van het account.</p>
      <div className="admin-form-grid">
        <label>
          E-mail
          <input
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            placeholder="gebruiker@voorbeeld.nl"
          />
        </label>
        <label>
          Korting %
          <input value={userPercent} onChange={(e) => setUserPercent(e.target.value)} />
        </label>
        <label>
          Geldig tot (optioneel)
          <input
            type="datetime-local"
            value={userUntil}
            onChange={(e) => setUserUntil(e.target.value)}
          />
        </label>
        <label>
          Notitie
          <input value={userNote} onChange={(e) => setUserNote(e.target.value)} />
        </label>
      </div>
      <button
        type="button"
        className="bom-action-btn secondary"
        disabled={busy}
        onClick={() => void grantUser()}
      >
        Korting toekennen
      </button>

      <ul className="admin-list">
        {profiles.length === 0 && <li className="muted">Geen persoonlijke kortingen.</li>}
        {profiles.map((p) => (
          <li key={p.id} className="admin-list-item">
            <div>
              <strong>{p.email || p.profile_id}</strong>
              {p.display_name ? ` (${p.display_name})` : ''}
              {' · '}
              {p.percent_off}%
              {p.valid_until
                ? ` · tot ${new Date(p.valid_until).toLocaleString('nl-NL')}`
                : ''}
              {p.note ? ` · ${p.note}` : ''}
            </div>
            <button
              type="button"
              className="linkish"
              onClick={() =>
                void adminClearProfileDiscount(p.profile_id)
                  .then(reload)
                  .catch((e) =>
                    setError(e instanceof Error ? e.message : 'Verwijderen mislukt'),
                  )
              }
            >
              Intrekken
            </button>
          </li>
        ))}
      </ul>

      {error && <p className="auth-error">{error}</p>}
      {info && <p className="auth-info">{info}</p>}
    </section>
  )
}

function emptyPriceDrafts(): Record<GatedFeatureId, string> {
  const drafts = {} as Record<GatedFeatureId, string>
  for (const id of GATED_FEATURE_IDS) drafts[id] = ''
  return drafts
}

function AdminPaidFeatures() {
  const [gates, setGates] = useState<FeatureGates>(defaultFeatureGates())
  const [featurePrices, setFeaturePrices] = useState<FeaturePrices>(defaultFeaturePrices())
  const [priceDrafts, setPriceDrafts] = useState<Record<GatedFeatureId, string>>(emptyPriceDrafts)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void fetchFeatureGates().then(setGates)
    void fetchFeaturePrices().then((p) => {
      setFeaturePrices(p)
      const drafts = emptyPriceDrafts()
      for (const id of GATED_FEATURE_IDS) {
        drafts[id] = p[id] != null ? String(p[id]) : ''
      }
      setPriceDrafts(drafts)
    })
  }, [])

  const saveAll = async () => {
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      const nextPrices: FeaturePrices = { ...defaultFeaturePrices() }
      for (const id of GATED_FEATURE_IDS) {
        const raw = priceDrafts[id].trim()
        if (!raw) {
          nextPrices[id] = null
          continue
        }
        const n = Number.parseInt(raw, 10)
        if (!Number.isFinite(n) || n < 1) {
          throw new Error(`Ongeldige prijs voor ${GATED_FEATURE_LABELS[id]} (centen, min. 1).`)
        }
        nextPrices[id] = n
      }
      await Promise.all([saveFeatureGates(gates), saveFeaturePrices(nextPrices)])
      setFeaturePrices(nextPrices)
      setMsg('Betaalde functies opgeslagen.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-section">
      <h2>Betaalde functies (per gebruik)</h2>
      <p className="muted">
        Alleen <strong>pay-per-use</strong> acties: paywall aan/uit en optionele eenmalige prijs
        (centen) voor ontgrendeling per cloud-model. Aan = abonnement met de feature, een
        blijvende model-unlock, of (print/copy) account-breed Betaal per keer. Uit = gratis.
        Lege prijs = fallback op Betaal-per-keer.
      </p>
      <p className="muted">
        Abonnementsrechten (cloud-opslag, openen van schijf, publiceren, fork) stel je in op het
        tabblad <strong>Abonnementen</strong> per plan — niet hier.
      </p>

      <ul className="admin-paid-feature-list">
        {GATED_FEATURE_IDS.map((id) => (
          <li key={id} className="admin-paid-feature-row">
            <label className="admin-paid-feature-toggle">
              <input
                type="checkbox"
                checked={gates[id]}
                disabled={busy}
                onChange={(e) => setGates((prev) => ({ ...prev, [id]: e.target.checked }))}
              />
              <span>
                <strong>{GATED_FEATURE_LABELS[id]}</strong>
                <span className="admin-feature-desc">{GATED_FEATURE_DESCRIPTIONS[id]}</span>
              </span>
            </label>
            <label className="admin-paid-feature-price">
              <span className="admin-paid-feature-price-label">
                Prijs (centen)
                <span className="admin-field-hint">
                  {featurePrices[id] != null
                    ? `Nu ${formatEuroFromCents(featurePrices[id]!)}`
                    : 'Fallback: export_once'}
                </span>
              </span>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                placeholder="Leeg = fallback"
                value={priceDrafts[id]}
                disabled={busy}
                aria-label={`Prijs in centen voor ${GATED_FEATURE_LABELS[id]}`}
                onChange={(e) =>
                  setPriceDrafts((prev) => ({ ...prev, [id]: e.target.value }))
                }
              />
            </label>
          </li>
        ))}
      </ul>

      <div className="admin-form-actions">
        <button type="button" className="primary" disabled={busy} onClick={() => void saveAll()}>
          {busy ? 'Opslaan…' : 'Opslaan'}
        </button>
      </div>
      {msg && <p className="muted">{msg}</p>}
      {err && <p className="auth-error">{err}</p>}
    </section>
  )
}

function AdminFeatures({
  theme,
  onThemeChange,
  planksEnabled,
  onPlanksEnabledChange,
}: {
  theme: ThemeId
  onThemeChange: (theme: ThemeId) => void
  planksEnabled: boolean
  onPlanksEnabledChange: (enabled: boolean) => void | Promise<void>
}) {
  return (
    <section className="admin-section">
      <h2>Functies (site-breed)</h2>
      <label className="admin-feature-toggle">
        <input
          type="checkbox"
          checked={planksEnabled}
          onChange={(e) => void onPlanksEnabledChange(e.target.checked)}
        />
        <span>
          <strong>Planken / platen</strong>
          <span className="admin-feature-desc">
            Editor-tool om steigerplanken en platen te plaatsen.
          </span>
        </span>
      </label>

      <h2>Stijl (dit apparaat)</h2>
      <div className="admin-style-options">
        {THEME_IDS.map((id) => {
          const meta = THEMES[id]
          const selected = theme === id
          return (
            <button
              key={id}
              type="button"
              className={`admin-style-option${selected ? ' selected' : ''}`}
              onClick={() => onThemeChange(id)}
              aria-pressed={selected}
            >
              <span className="admin-style-swatches" aria-hidden>
                {meta.swatches.map((hex) => (
                  <span key={hex} style={{ background: hex }} />
                ))}
              </span>
              <span className="admin-style-label">{meta.label}</span>
              <span className="admin-style-desc">{meta.description}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
