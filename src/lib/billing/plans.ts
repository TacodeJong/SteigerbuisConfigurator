/** Configurable subscription plans (DB + hardcoded fallback). Matches subscription_plans table. */

import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'
import {
  stubAdminCreatePlan,
  stubAdminListPlans,
  stubAdminUpdatePlan,
  stubListActivePlans,
} from '../auth/localStubStore'
import {
  EXPORT_PACK_AMOUNT_EUR,
  PAID_PLAN_AMOUNT_EUR,
  type CheckoutPlan,
} from './planPricing'
import { eurToCents } from './appPricing'

export type PlanKind = 'subscription' | 'one_time' | 'free'
export type PlanInterval = 'month' | null
export type PlanFeatureFlag =
  | 'cloud_save'
  | 'open_from_disk'
  | 'publish'
  | 'fork'
  | 'full_print'
  | 'copy_order_list'
  | 'download_model'
  | 'unlimited_saves'

export const DEFAULT_PLAN_FEATURES: Record<'paid_monthly' | 'export_once', PlanFeatureFlag[]> = {
  paid_monthly: [
    'cloud_save',
    'open_from_disk',
    'publish',
    'fork',
    'full_print',
    'copy_order_list',
    'download_model',
  ],
  export_once: ['full_print', 'copy_order_list'],
}

/** NL-weergavelabels voor feature-flags (technische slugs blijven ongewijzigd). */
export const FEATURE_FLAG_LABELS: Record<PlanFeatureFlag, string> = {
  cloud_save: 'Cloud-opslag (opslaan/laden)',
  open_from_disk: 'Openen van schijf',
  publish: 'Publiceren',
  fork: 'Eigen kopie van galerijmodellen',
  full_print: 'Volledige print/plattegrond',
  copy_order_list: 'Bestellijst kopiëren naar klembord',
  download_model: 'Downloaden van modellen',
  unlimited_saves: 'Onbeperkt cloud-modellen',
}

export function featureFlagLabel(flag: PlanFeatureFlag | string): string {
  if (flag in FEATURE_FLAG_LABELS) {
    return FEATURE_FLAG_LABELS[flag as PlanFeatureFlag]
  }
  return flag
}

/**
 * Label voor privé cloud-modellen limiet.
 * null max + cloud → onbeperkt; getal → “Tot X…”; 0 / geen cloud → null (niet tonen).
 */
export function cloudModelsLimitLabel(
  plan: Pick<SubscriptionPlan, 'features' | 'max_private_models'>,
): string | null {
  const max = plan.max_private_models
  if (max === 0) return null
  if (typeof max === 'number' && max > 0) {
    return `Tot ${max} cloud-modellen`
  }
  const hasCloud =
    plan.features.includes('cloud_save') || plan.features.includes('unlimited_saves')
  if (hasCloud) return 'Onbeperkt cloud-modellen'
  return null
}

/** Feature-labels voor upgrade-kaarten (cloud-limiet i.p.v. losse cloud/unlimited flags). */
export function planFeatureLabelsForDisplay(plan: SubscriptionPlan): string[] {
  const cloudLabel = cloudModelsLimitLabel(plan)
  const labels: string[] = []
  for (const flag of plan.features) {
    if (flag === 'cloud_save' || flag === 'unlimited_saves') continue
    labels.push(featureFlagLabel(flag))
  }
  if (cloudLabel) labels.unshift(cloudLabel)
  else if (plan.features.includes('cloud_save')) {
    labels.unshift(FEATURE_FLAG_LABELS.cloud_save)
  }
  return labels
}

/** Sync unlimited_saves flag with max_private_models for admin/display consistency. */
export function syncUnlimitedSavesFeature(
  features: PlanFeatureFlag[],
  maxPrivateModels: number | null,
): PlanFeatureFlag[] {
  const hasCloud = features.includes('cloud_save')
  const next: PlanFeatureFlag[] = features.filter((f) => f !== 'unlimited_saves')
  if (maxPrivateModels == null && hasCloud) {
    return [...next, 'unlimited_saves']
  }
  return next
}

export interface SubscriptionPlan {
  id: string
  slug: string
  name: string
  description: string
  kind: PlanKind
  price_cents: number
  currency: string
  interval: PlanInterval
  features: PlanFeatureFlag[]
  /** null = unlimited; 0 = no cloud quota; number = cap */
  max_private_models: number | null
  is_active: boolean
  /** Exact één standaardplan (signup / fallback). */
  is_default: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

const FEATURE_FLAGS: PlanFeatureFlag[] = [
  'cloud_save',
  'open_from_disk',
  'publish',
  'fork',
  'full_print',
  'copy_order_list',
  'download_model',
  'unlimited_saves',
]

/** Hardcoded fallbacks when DB/plans table unavailable. */
export function defaultSubscriptionPlans(): SubscriptionPlan[] {
  return [
    {
      id: 'fallback-free',
      slug: FREE_PLAN_SLUG,
      name: 'Gratis account',
      description: 'Ontwerpen en een eenvoudige stuklijst zonder abonnement.',
      kind: 'free',
      price_cents: 0,
      currency: 'eur',
      interval: null,
      features: [],
      max_private_models: 3,
      is_active: true,
      is_default: true,
      sort_order: 0,
    },
    {
      id: 'fallback-paid_monthly',
      slug: 'paid_monthly',
      name: 'Basis account',
      description:
        'Maandelijks: volledige print + cloud-opslag (tot 3 privémodellen), publiceren en ontwerpen overnemen.',
      kind: 'subscription',
      price_cents: eurToCents(PAID_PLAN_AMOUNT_EUR),
      currency: 'eur',
      interval: 'month',
      features: [...DEFAULT_PLAN_FEATURES.paid_monthly],
      max_private_models: 3,
      is_active: true,
      is_default: false,
      sort_order: 10,
    },
    {
      id: 'fallback-export_once',
      slug: 'export_once',
      name: 'Betaal per keer',
      description:
        'Eenmalige aankoop voor volledige plattegrond/print wanneer je die functie nodig hebt. Geen cloud-opslag, publiceren of ontwerpen overnemen. Geen abonnement.',
      kind: 'one_time',
      price_cents: eurToCents(EXPORT_PACK_AMOUNT_EUR),
      currency: 'eur',
      interval: null,
      features: [...DEFAULT_PLAN_FEATURES.export_once],
      max_private_models: 0,
      is_active: true,
      is_default: false,
      sort_order: 20,
    },
  ]
}

function parseMaxPrivateModels(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.floor(n)
}

function parseFeatures(raw: unknown): PlanFeatureFlag[] {
  if (!Array.isArray(raw)) return []
  const out: PlanFeatureFlag[] = []
  for (const item of raw) {
    if (typeof item === 'string' && (FEATURE_FLAGS as string[]).includes(item)) {
      out.push(item as PlanFeatureFlag)
    }
  }
  return out
}

function parseKind(raw: unknown): PlanKind {
  if (raw === 'one_time') return 'one_time'
  if (raw === 'free') return 'free'
  return 'subscription'
}

function mapRow(row: Record<string, unknown>): SubscriptionPlan {
  const slug = String(row.slug)
  const kind = parseKind(row.kind)
  const rawCents = Math.round(Number(row.price_cents) || 0)
  const looksFree =
    kind === 'free' ||
    rawCents <= 0 ||
    slug === 'free' ||
    slug === 'gratis' ||
    slug === LEGACY_VIRTUAL_FREE_SLUG ||
    row.is_default === true
  return {
    id: String(row.id),
    slug,
    name: String(row.name),
    description: String(row.description ?? ''),
    kind: looksFree && kind !== 'one_time' ? 'free' : kind,
    // Free/default mag 0; overige plannen min. 1 cent.
    price_cents: looksFree ? Math.max(0, rawCents) : Math.max(1, rawCents || 1),
    currency: String(row.currency || 'eur'),
    interval: row.interval === 'month' ? 'month' : null,
    features: parseFeatures(row.features),
    max_private_models: parseMaxPrivateModels(row.max_private_models),
    is_active: row.is_active !== false,
    is_default: row.is_default === true,
    sort_order: Number(row.sort_order) || 0,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  }
}

/** Active plans for Upgrade UI (public RLS: is_active = true). */
export async function fetchActiveSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  if (!isSupabaseConfigured()) {
    const stub = stubListActivePlans()
    return stub.length ? stub.map((p) => mapRow(p as unknown as Record<string, unknown>)) : defaultSubscriptionPlans()
  }
  const supabase = getSupabase()
  if (!supabase) return defaultSubscriptionPlans()

  const { data: rows, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error || !rows?.length) {
    if (error) console.warn('plans fetch', error.message)
    return defaultSubscriptionPlans()
  }
  return (rows as Record<string, unknown>[]).map(mapRow)
}

/** Alias — Upgrade UI / docs. */
export const fetchActivePlans = fetchActiveSubscriptionPlans

export async function adminListSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  if (!isSupabaseConfigured()) {
    return stubAdminListPlans().map((p) => mapRow(p as unknown as Record<string, unknown>))
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')
  const { data, error } = await supabase.rpc('admin_list_subscription_plans')
  if (error) throw error
  return ((data ?? []) as Record<string, unknown>[]).map(mapRow)
}

export interface CreatePlanInput {
  slug: string
  name: string
  description?: string
  kind: PlanKind
  price_cents: number
  currency?: string
  interval?: PlanInterval
  features?: PlanFeatureFlag[]
  is_active?: boolean
  sort_order?: number
  /** null = unlimited */
  max_private_models?: number | null
  is_default?: boolean
}

export interface UpdatePlanInput {
  id: string
  name?: string
  description?: string
  price_cents?: number
  currency?: string
  features?: PlanFeatureFlag[]
  is_active?: boolean
  sort_order?: number
  interval?: PlanInterval
  /** null = unlimited; omit to leave unchanged only if setMaxPrivateModels is false */
  max_private_models?: number | null
  setMaxPrivateModels?: boolean
  is_default?: boolean
}

function normalizeAdminPriceCents(kind: PlanKind, cents: number): number {
  if (kind === 'free') return 0
  return Math.max(1, Math.round(cents))
}

export async function adminCreateSubscriptionPlan(
  input: CreatePlanInput,
): Promise<SubscriptionPlan> {
  const priceCents = normalizeAdminPriceCents(input.kind, input.price_cents)
  if (!isSupabaseConfigured()) {
    return mapRow(
      stubAdminCreatePlan({
        slug: input.slug,
        name: input.name,
        description: input.description,
        kind: input.kind,
        price_cents: priceCents,
        currency: input.currency,
        interval: input.interval,
        features: input.features,
        is_active: input.is_active,
        sort_order: input.sort_order,
        max_private_models: input.max_private_models ?? null,
        is_default: input.is_default,
      }) as unknown as Record<string, unknown>,
    )
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')
  const { data, error } = await supabase.rpc('admin_create_subscription_plan', {
    p_slug: input.slug,
    p_name: input.name,
    p_description: input.description ?? '',
    p_kind: input.kind,
    p_price_cents: priceCents,
    p_currency: input.currency ?? 'eur',
    p_interval: input.kind === 'subscription' ? input.interval || 'month' : null,
    p_features: input.features ?? [],
    p_is_active: input.is_active ?? true,
    p_sort_order: input.sort_order ?? 100,
    p_max_private_models: input.max_private_models ?? null,
    p_is_default: input.is_default ?? false,
  })
  if (error) throw error
  return mapRow(data as Record<string, unknown>)
}

export async function adminUpdateSubscriptionPlan(
  input: UpdatePlanInput,
): Promise<SubscriptionPlan> {
  if (!isSupabaseConfigured()) {
    return mapRow(
      stubAdminUpdatePlan({
        id: input.id,
        name: input.name,
        description: input.description,
        price_cents: input.price_cents,
        currency: input.currency,
        features: input.features,
        is_active: input.is_active,
        sort_order: input.sort_order,
        interval: input.interval,
        max_private_models: input.max_private_models,
        setMaxPrivateModels: input.setMaxPrivateModels,
        is_default: input.is_default,
      }) as unknown as Record<string, unknown>,
    )
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')
  const { data, error } = await supabase.rpc('admin_update_subscription_plan', {
    p_id: input.id,
    p_name: input.name ?? null,
    p_description: input.description ?? null,
    p_price_cents:
      input.price_cents != null ? Math.max(0, Math.round(input.price_cents)) : null,
    p_currency: input.currency ?? null,
    p_features: input.features ?? null,
    p_is_active: input.is_active ?? null,
    p_sort_order: input.sort_order ?? null,
    p_interval: input.interval ?? null,
    p_max_private_models: input.max_private_models ?? null,
    p_set_max_private_models: input.setMaxPrivateModels ?? false,
    p_is_default: input.is_default ?? null,
  })
  if (error) throw error
  return mapRow(data as Record<string, unknown>)
}

export function findPlanBySlug(
  plans: SubscriptionPlan[],
  slug: string,
): SubscriptionPlan | undefined {
  return plans.find((p) => p.slug === slug)
}

/** NL fallbacks when DB name missing or leftover English "Paid". */
export const FALLBACK_PLAN_DISPLAY_NAMES: Record<string, string> = {
  free: 'Gratis account',
  gratis: 'Gratis account',
  paid_monthly: 'Basis account',
  export_once: 'Betaal per keer',
  extra_monthly: 'Extra account',
}

/**
 * Weergavenaam: `subscription_plans.name` via slug → fallback map → nooit Engels "Paid".
 */
export function planDisplayName(
  slug: string | null | undefined,
  plans?: readonly SubscriptionPlan[] | null,
): string {
  const key = slug?.trim()
  if (!key) return 'Geen abonnement'

  const fromDb = plans?.find((p) => p.slug === key)?.name?.trim()
  if (fromDb && fromDb.toLowerCase() !== 'paid') {
    return fromDb
  }

  if (FALLBACK_PLAN_DISPLAY_NAMES[key]) return FALLBACK_PLAN_DISPLAY_NAMES[key]
  if (key.toLowerCase() === 'paid') return FALLBACK_PLAN_DISPLAY_NAMES.paid_monthly
  return key
}

/** Map known checkout plan → price from plans list with fallback. */
export function priceCentsFromPlans(
  plan: CheckoutPlan | string,
  plans: SubscriptionPlan[],
  fallbackPaid: number,
  fallbackExport: number,
): number {
  const found = findPlanBySlug(plans, plan)
  if (found) return found.price_cents
  return plan === 'export_once' ? fallbackExport : fallbackPaid
}

export function planPriceHint(plan: SubscriptionPlan): string {
  if (isFreePlan(plan) || plan.price_cents <= 0) return 'Gratis'
  const euro = (plan.price_cents / 100).toFixed(2)
  const pretty = euro.endsWith('.00')
    ? `€${euro.slice(0, -3)}`
    : `€${euro.replace('.', ',')}`
  if (plan.kind === 'one_time') return `Per keer ${pretty}`
  if (plan.interval === 'month') return `${pretty} / maand`
  return pretty
}

/**
 * Feature-score voor kaartvolgorde (links → rechts: armer → rijker).
 * Gewichten: full_print < cloud_save < publish/fork < unlimited_saves.
 * Onbekende flags tellen mee (1) zodat admin-extra’s de rank nog verhogen.
 * Bij gelijke score: sort_order, daarna price_cents (zie comparePlansByTier).
 */
export const FEATURE_SCORE_WEIGHTS: Record<string, number> = {
  full_print: 1,
  copy_order_list: 1,
  cloud_save: 2,
  publish: 3,
  fork: 3,
  unlimited_saves: 4,
}

/** Canonieke DB-slug voor het gratis plan. */
export const FREE_PLAN_SLUG = 'free'

/** Oude virtuele kaart-slug (pre-migratie); alleen als fallback. */
export const LEGACY_VIRTUAL_FREE_SLUG = '__free__'

/** Bekende DB-slugs voor het gratis/default plan. */
export const DB_FREE_PLAN_SLUGS = ['free', 'gratis'] as const

export function planFeatureScore(
  features: readonly (PlanFeatureFlag | string)[] | null | undefined,
): number {
  if (!features?.length) return 0
  let score = 0
  for (const flag of features) {
    score += FEATURE_SCORE_WEIGHTS[flag] ?? 1
  }
  return score
}

/** true als features print/export-entitlements dekken (one_time dan overbodig). */
export function planHasPrintEntitlement(
  features: readonly (PlanFeatureFlag | string)[] | null | undefined,
): boolean {
  if (!features?.length) return false
  return features.includes('full_print')
}

/** Virtuele Gratis-kaart — alleen fallback als DB-rij ontbreekt. */
export function virtualFreePlan(freeLimit = 3): SubscriptionPlan {
  return {
    id: 'virtual-free',
    slug: FREE_PLAN_SLUG,
    name: 'Gratis account',
    description: 'Ontwerpen en een eenvoudige stuklijst zonder abonnement.',
    kind: 'free',
    price_cents: 0,
    currency: 'eur',
    interval: null,
    features: [],
    max_private_models: freeLimit,
    is_active: true,
    is_default: true,
    sort_order: -1000,
  }
}

/** @deprecated Gebruik isFreePlan — legacy virtuele slug `__free__`. */
export function isVirtualFreePlan(plan: Pick<SubscriptionPlan, 'slug'> | string): boolean {
  const slug = typeof plan === 'string' ? plan : plan.slug
  return slug === LEGACY_VIRTUAL_FREE_SLUG || slug === FREE_PLAN_SLUG
}

/**
 * Gratis / default plan: kind free, slug free/gratis/__free__, price 0, of is_default.
 */
export function isFreePlan(
  plan:
    | Pick<SubscriptionPlan, 'slug' | 'price_cents' | 'is_default' | 'kind'>
    | string
    | null
    | undefined,
): boolean {
  if (plan == null) return false
  if (typeof plan === 'string') {
    const slug = plan.trim()
    if (!slug) return false
    if (slug === LEGACY_VIRTUAL_FREE_SLUG) return true
    return (DB_FREE_PLAN_SLUGS as readonly string[]).includes(slug)
  }
  if (plan.kind === 'free') return true
  if (plan.is_default) return true
  if ((plan.price_cents ?? 0) <= 0) return true
  if (plan.slug === LEGACY_VIRTUAL_FREE_SLUG) return true
  return (DB_FREE_PLAN_SLUGS as readonly string[]).includes(plan.slug)
}

/** Checkout mag nooit voor gratis / €0-plannen. */
export function isCheckoutablePlan(
  plan: Pick<SubscriptionPlan, 'slug' | 'kind' | 'price_cents' | 'is_default'> | string,
): boolean {
  if (typeof plan === 'string') return !isFreePlan(plan)
  if (isFreePlan(plan)) return false
  return (plan.price_cents ?? 0) > 0
}

/** Eerste gratis/default-plan uit catalogus (geen virtuele fallback). */
export function findDbFreePlan(
  plans: readonly SubscriptionPlan[] | null | undefined,
): SubscriptionPlan | undefined {
  if (!plans?.length) return undefined
  const active = plans.filter(
    (p) => p.is_active !== false && p.slug !== LEGACY_VIRTUAL_FREE_SLUG,
  )
  return (
    active.find((p) => p.is_default) ??
    active.find((p) => p.kind === 'free') ??
    active.find((p) => isFreePlan(p))
  )
}

/**
 * Default selectie-slug: DB free/default → anders `free`.
 */
export function defaultPlanSlug(
  plans?: readonly SubscriptionPlan[] | null,
): string {
  return findDbFreePlan(plans)?.slug ?? FREE_PLAN_SLUG
}

/** Plan-object voor default selectie (DB free of virtueel). */
export function resolveDefaultPlan(
  plans?: readonly SubscriptionPlan[] | null,
): SubscriptionPlan {
  return findDbFreePlan(plans) ?? virtualFreePlan()
}

/**
 * Kind-tier voor sortering: gratis < subscription.
 * One-time (`export_once`) is geen abonnement-kaart meer — pay-per-use via feature gates.
 */
export function planKindTier(
  plan: Pick<SubscriptionPlan, 'slug' | 'kind' | 'price_cents' | 'is_default'>,
): number {
  if (isFreePlan(plan)) return 0
  if (plan.kind === 'one_time') return 1
  return 2
}

/** Vergelijk voor grid links→rechts (lager = links). */
export function comparePlansByTier(a: SubscriptionPlan, b: SubscriptionPlan): number {
  const tier = planKindTier(a) - planKindTier(b)
  if (tier !== 0) return tier
  const score = planFeatureScore(a.features) - planFeatureScore(b.features)
  if (score !== 0) return score
  const order = (a.sort_order ?? 0) - (b.sort_order ?? 0)
  if (order !== 0) return order
  return (a.price_cents ?? 0) - (b.price_cents ?? 0)
}

/**
 * Kaarten voor Upgrade/registratie: Gratis + actieve subscriptions.
 * One-time (`export_once` / “Betaal per keer”) wordt bewust weggelaten — geen abonnement;
 * eenmalige unlocks lopen via feature-paywalls (per model/feature).
 * Geen dubbele virtuele free als DB-free bestaat.
 */
export function buildUpgradeDisplayPlans(
  activePlans: readonly SubscriptionPlan[],
): SubscriptionPlan[] {
  const source =
    activePlans.length > 0 ? [...activePlans] : defaultSubscriptionPlans()
  const dbFree = findDbFreePlan(source)
  const subscriptions = source.filter(
    (p) =>
      p.is_active !== false &&
      !isFreePlan(p) &&
      p.kind === 'subscription',
  )
  const freeCard = dbFree ?? virtualFreePlan()
  const cards = [freeCard, ...subscriptions]
  cards.sort(comparePlansByTier)
  return cards
}
