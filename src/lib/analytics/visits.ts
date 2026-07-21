import type { AppRoute } from '../routing'
import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'

const VISITOR_KEY_STORAGE = 'steigerbuis.visitorKey.v1'
const TRACK_DEBOUNCE_MS = 10_000
const UTM_MAX_LEN = 64
const recentlyTrackedKeys = new Map<string, number>()

/** Coarse timezone → ISO country; not IP geolocation. Ambiguous zones stay unset. */
const TIMEZONE_COUNTRY: Record<string, string> = {
  'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE',
  'Europe/Berlin': 'DE',
  'Europe/Paris': 'FR',
  'Europe/London': 'GB',
  'Europe/Dublin': 'IE',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Vienna': 'AT',
  'Europe/Zurich': 'CH',
  'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI',
  'Europe/Warsaw': 'PL',
  'Europe/Prague': 'CZ',
  'Europe/Lisbon': 'PT',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Pacific/Auckland': 'NZ',
}

export type AdminVisitRange = 7 | 30 | 90

export interface AdminVisitSeriesPoint {
  bucket: string
  visits: number
  uniques: number
}

export interface AdminVisitBreakdownRow {
  key: string
  visits: number
  uniques: number
}

export interface AdminVisitUtmRow {
  source: string
  medium: string
  campaign: string
  visits: number
  uniques: number
}

export interface AdminVisitLocationRow {
  key: string
  countryCode: string | null
  timezone: string | null
  visits: number
  uniques: number
}

export interface AdminVisitAnalytics {
  rangeDays: number
  granularity: 'hour' | 'day'
  totalVisits: number
  uniqueVisitors: number
  series: AdminVisitSeriesPoint[]
  browsers: AdminVisitBreakdownRow[]
  oses: AdminVisitBreakdownRow[]
  referrers: AdminVisitBreakdownRow[]
  utm: AdminVisitUtmRow[]
  locations: AdminVisitLocationRow[]
  topRoutes: AdminVisitBreakdownRow[]
  topPaths: AdminVisitBreakdownRow[]
}

/** Friendly NL labels for known app route keys stored in page_visits.route. */
const ROUTE_LABELS_NL: Record<string, string> = {
  app: 'Configurator',
  gallery: 'Galerij',
  tutorials: 'Tutorials',
  favourites: 'Favorieten',
  feed: 'Feed',
  model: 'Model',
  profile: 'Profiel',
  upgrade: 'Upgrade',
  admin: 'Admin',
  privacy: 'Privacy',
  terms: 'Voorwaarden',
}

export function formatVisitRouteLabel(routeKey: string): string {
  const key = routeKey.trim().toLowerCase()
  return ROUTE_LABELS_NL[key] ?? routeKey
}

function normalizeCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value))
  return 0
}

function sanitizePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return '/'
  return trimmed.slice(0, 256)
}

function cap(value: string | null | undefined, max: number): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

function getVisitorKey(): string | null {
  if (typeof window === 'undefined') return null
  const existing = localStorage.getItem(VISITOR_KEY_STORAGE)
  if (existing && existing.length >= 16) return existing
  const created = crypto.randomUUID()
  localStorage.setItem(VISITOR_KEY_STORAGE, created)
  return created
}

function routeToLabel(route: AppRoute): string {
  switch (route.name) {
    case 'model':
      return 'model'
    case 'profile':
      return 'profile'
    default:
      return route.name
  }
}

/** Lightweight UA parse — no heavy library. */
export function parseBrowser(ua: string): string {
  const s = ua || ''
  if (/edg\//i.test(s)) return 'Edge'
  if (/opr\//i.test(s) || /opera/i.test(s)) return 'Other'
  if (/chrome\//i.test(s) && !/edg\//i.test(s) && !/opr\//i.test(s)) return 'Chrome'
  if (/firefox\//i.test(s)) return 'Firefox'
  if (/safari\//i.test(s) && !/chrome\//i.test(s) && !/chromium\//i.test(s)) return 'Safari'
  return 'Other'
}

export function parseOs(ua: string): string {
  const s = ua || ''
  if (/iphone|ipad|ipod/i.test(s)) return 'iOS'
  if (/android/i.test(s)) return 'Android'
  if (/windows/i.test(s)) return 'Windows'
  if (/mac os x|macintosh/i.test(s)) return 'macOS'
  if (/linux/i.test(s) || /cros/i.test(s)) return 'Linux'
  return 'Other'
}

function getReferrerHost(): string | null {
  if (typeof document === 'undefined') return null
  const raw = document.referrer
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (typeof window !== 'undefined' && url.host === window.location.host) return null
    return cap(url.host.toLowerCase(), 253)
  } catch {
    return null
  }
}

function getUtmParams(): { source: string | null; medium: string | null; campaign: string | null } {
  if (typeof window === 'undefined') {
    return { source: null, medium: null, campaign: null }
  }
  const params = new URLSearchParams(window.location.search)
  return {
    source: cap(params.get('utm_source'), UTM_MAX_LEN),
    medium: cap(params.get('utm_medium'), UTM_MAX_LEN),
    campaign: cap(params.get('utm_campaign'), UTM_MAX_LEN),
  }
}

function getTimezone(): string | null {
  try {
    return cap(Intl.DateTimeFormat().resolvedOptions().timeZone, 64)
  } catch {
    return null
  }
}

/**
 * Privacy-friendly country hint: timezone map first, else Accept-Language region.
 * Never stores IP. Ambiguous / missing → null (UI shows timezone or "Onbekend").
 */
function inferCountryCode(timezone: string | null): string | null {
  if (timezone && TIMEZONE_COUNTRY[timezone]) return TIMEZONE_COUNTRY[timezone]
  if (typeof navigator === 'undefined') return null
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const lang of langs) {
    const match = /[-_]([A-Za-z]{2})\b/.exec(lang)
    if (match) return match[1]!.toUpperCase()
  }
  return null
}

function emptyAnalytics(rangeDays: AdminVisitRange): AdminVisitAnalytics {
  return {
    rangeDays,
    granularity: 'day',
    totalVisits: 0,
    uniqueVisitors: 0,
    series: fillVisitSeries([], rangeDays, 'day'),
    browsers: [],
    oses: [],
    referrers: [],
    utm: [],
    locations: [],
    topRoutes: [],
    topPaths: [],
  }
}

/** UTC calendar day key (YYYY-MM-DD), matching Postgres date_trunc('day') in UTC. */
function utcDayKey(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) {
    return typeof value === 'string' ? value.slice(0, 10) : ''
  }
  return d.toISOString().slice(0, 10)
}

function utcHourKey(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ''
  const iso = d.toISOString()
  return `${iso.slice(0, 13)}:00:00.000Z`
}

/**
 * Ensure one bucket per day/hour across the selected range, including zero-days.
 * Defensive against sparse RPC payloads so the chart spans full width evenly.
 */
export function fillVisitSeries(
  series: AdminVisitSeriesPoint[],
  rangeDays: number,
  granularity: 'hour' | 'day',
): AdminVisitSeriesPoint[] {
  const days = Math.min(Math.max(Math.trunc(rangeDays) || 30, 1), 365)
  const byKey = new Map<string, AdminVisitSeriesPoint>()
  for (const point of series) {
    if (!point.bucket) continue
    const key = granularity === 'hour' ? utcHourKey(point.bucket) : utcDayKey(point.bucket)
    if (!key) continue
    byKey.set(key, {
      bucket: point.bucket,
      visits: point.visits,
      uniques: point.uniques,
    })
  }

  const out: AdminVisitSeriesPoint[] = []
  if (granularity === 'hour') {
    const end = new Date()
    end.setUTCMinutes(0, 0, 0)
    const start = new Date(end)
    start.setUTCHours(start.getUTCHours() - days * 24)
    for (let t = start.getTime(); t <= end.getTime(); t += 3_600_000) {
      const d = new Date(t)
      const key = utcHourKey(d)
      const existing = byKey.get(key)
      out.push(existing ?? { bucket: d.toISOString(), visits: 0, uniques: 0 })
    }
    return out
  }

  const end = new Date()
  end.setUTCHours(0, 0, 0, 0)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - days)
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const d = new Date(t)
    const key = utcDayKey(d)
    const existing = byKey.get(key)
    out.push(existing ?? { bucket: d.toISOString(), visits: 0, uniques: 0 })
  }
  return out
}

function mapBreakdown(raw: unknown): AdminVisitBreakdownRow[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const row = item as Record<string, unknown>
    return {
      key: String(row.key ?? 'Onbekend'),
      visits: normalizeCount(row.visits),
      uniques: normalizeCount(row.uniques),
    }
  })
}

export async function trackPageVisit(route: AppRoute): Promise<void> {
  if (!isSupabaseConfigured()) return
  const supabase = getSupabase()
  if (!supabase) return
  const visitorKey = getVisitorKey()
  if (!visitorKey) return

  const routeLabel = routeToLabel(route)
  const path = sanitizePath(window.location.pathname + window.location.search)
  const dedupeKey = `${visitorKey}:${routeLabel}:${path}`
  const now = Date.now()
  const previous = recentlyTrackedKeys.get(dedupeKey)
  if (previous && now - previous < TRACK_DEBOUNCE_MS) return
  recentlyTrackedKeys.set(dedupeKey, now)

  const ua = navigator.userAgent.slice(0, 256)
  const timezone = getTimezone()
  const utm = getUtmParams()

  const { error } = await supabase.from('page_visits').insert({
    visitor_key: visitorKey,
    route: routeLabel,
    path,
    user_agent: ua,
    browser: parseBrowser(ua),
    os: parseOs(ua),
    referrer_host: getReferrerHost(),
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    timezone,
    country_code: inferCountryCode(timezone),
  })
  if (error) {
    console.warn('page_visits insert', error.message)
  }
}

export async function fetchAdminVisitAnalytics(rangeDays: AdminVisitRange): Promise<AdminVisitAnalytics> {
  if (!isSupabaseConfigured()) return emptyAnalytics(rangeDays)
  const supabase = getSupabase()
  if (!supabase) return emptyAnalytics(rangeDays)

  const { data, error } = await supabase.rpc('admin_visit_analytics', { p_days: rangeDays })
  if (error) throw new Error(error.message)

  const row = (data ?? {}) as Record<string, unknown>
  const granularity = row.granularity === 'hour' ? 'hour' : 'day'
  const rawSeries = Array.isArray(row.series) ? row.series : []
  const rawUtm = Array.isArray(row.utm) ? row.utm : []
  const rawLocations = Array.isArray(row.locations) ? row.locations : []

  const mappedSeries = rawSeries.map((item) => {
    const point = item as Record<string, unknown>
    return {
      bucket: String(point.bucket ?? ''),
      visits: normalizeCount(point.visits),
      uniques: normalizeCount(point.uniques),
    }
  })

  return {
    rangeDays: normalizeCount(row.range_days) || rangeDays,
    granularity,
    totalVisits: normalizeCount(row.total_visits),
    uniqueVisitors: normalizeCount(row.unique_visitors),
    series: fillVisitSeries(mappedSeries, rangeDays, granularity),
    browsers: mapBreakdown(row.browsers),
    oses: mapBreakdown(row.oses),
    referrers: mapBreakdown(row.referrers),
    utm: rawUtm.map((item) => {
      const u = item as Record<string, unknown>
      return {
        source: String(u.source ?? '(geen)'),
        medium: String(u.medium ?? '(geen)'),
        campaign: String(u.campaign ?? '(geen)'),
        visits: normalizeCount(u.visits),
        uniques: normalizeCount(u.uniques),
      }
    }),
    locations: rawLocations.map((item) => {
      const loc = item as Record<string, unknown>
      return {
        key: String(loc.key ?? 'Onbekend'),
        countryCode: loc.country_code != null ? String(loc.country_code) : null,
        timezone: loc.timezone != null ? String(loc.timezone) : null,
        visits: normalizeCount(loc.visits),
        uniques: normalizeCount(loc.uniques),
      }
    }),
    topRoutes: mapBreakdown(row.top_routes),
    topPaths: mapBreakdown(row.top_paths),
  }
}
