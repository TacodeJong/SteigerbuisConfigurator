/**
 * LocalStorage-backed stub when Supabase env is empty.
 * Lets you exercise auth / library / gates / social without a backend.
 */
import type { KlimrekConfig, SceneModel } from '../../types'
import { FREE_PRIVATE_MODEL_LIMIT, ApiError, saveLimitMessage } from '../apiErrors'
import { isEntitledPaid, resolvePrivateModelLimit } from '../billing/entitlements'
import type { Profile } from './types'

const ROOT = 'steigerbuis.localStub.v1'

interface StubUser {
  id: string
  email: string
  password: string
  profile: Profile
}

interface StubModel {
  id: string
  owner_id: string
  name: string
  scene: SceneModel
  config: KlimrekConfig
  visibility: 'private' | 'published'
  forked_from_id: string | null
  attribution_name: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface StubDeletedAccount {
  id: string
  deleted_at: string
  former_user_id: string
  email_hash: string
  display_name_redacted: string | null
  had_paid: boolean
  reason: string | null
}

export interface StubSubscriptionPlan {
  id: string
  slug: string
  name: string
  description: string
  kind: 'subscription' | 'one_time' | 'free'
  price_cents: number
  currency: string
  interval: 'month' | null
  features: string[]
  max_private_models: number | null
  is_active: boolean
  is_default: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface StubPlanAssignmentEvent {
  id: number
  created_at: string
  admin_id: string | null
  admin_email: string | null
  target_user_id: string
  target_email: string | null
  from_plan_slug: string | null
  to_plan_slug: string
  paid_until: string | null
  note: string | null
  had_mollie_subscription: boolean
}

interface Store {
  users: StubUser[]
  sessionUserId: string | null
  models: StubModel[]
  favourites: { user_id: string; model_id: string; created_at: string }[]
  follows: { follower_id: string; followee_id: string; created_at: string }[]
  deletedAccounts: StubDeletedAccount[]
  subscriptionPlans: StubSubscriptionPlan[]
  planAssignmentEvents: StubPlanAssignmentEvent[]
  nextPlanAssignmentId: number
}

function emptyStore(): Store {
  const ts = new Date().toISOString()
  return {
    users: [],
    sessionUserId: null,
    models: [],
    favourites: [],
    follows: [],
    deletedAccounts: [],
    planAssignmentEvents: [],
    nextPlanAssignmentId: 1,
    subscriptionPlans: [
      {
        id: 'stub-free',
        slug: 'free',
        name: 'Gratis account',
        description: 'Ontwerpen en een eenvoudige stuklijst zonder abonnement.',
        kind: 'free',
        price_cents: 0,
        currency: 'eur',
        interval: null,
        features: [],
        max_private_models: FREE_PRIVATE_MODEL_LIMIT,
        is_active: true,
        is_default: true,
        sort_order: 0,
        created_at: ts,
        updated_at: ts,
      },
      {
        id: 'stub-paid_monthly',
        slug: 'paid_monthly',
        name: 'Basis account',
        description:
          'Maandelijks: cloud (tot 3 privémodellen), publiceren, ontwerpen overnemen, print.',
        kind: 'subscription',
        price_cents: 700,
        currency: 'eur',
        interval: 'month',
        features: ['cloud_save', 'publish', 'fork', 'full_print', 'copy_order_list'],
        max_private_models: 3,
        is_active: true,
        is_default: false,
        sort_order: 10,
        created_at: ts,
        updated_at: ts,
      },
      {
        id: 'stub-extra_monthly',
        slug: 'extra_monthly',
        name: 'Extra account',
        description: 'Uitgebreider abonnement (voorbeeld, uit tot admin aanzet).',
        kind: 'subscription',
        price_cents: 1200,
        currency: 'eur',
        interval: 'month',
        features: ['cloud_save', 'publish', 'fork', 'full_print', 'copy_order_list', 'unlimited_saves'],
        max_private_models: null,
        is_active: false,
        is_default: false,
        sort_order: 15,
        created_at: ts,
        updated_at: ts,
      },
      {
        id: 'stub-export_once',
        slug: 'export_once',
        name: 'Betaal per keer',
        description:
          'Eenmalige aankoop voor volledige plattegrond/print wanneer je die functie nodig hebt (geen abonnement).',
        kind: 'one_time',
        price_cents: 500,
        currency: 'eur',
        interval: null,
        features: ['full_print', 'copy_order_list'],
        max_private_models: 0,
        is_active: true,
        is_default: false,
        sort_order: 20,
        created_at: ts,
        updated_at: ts,
      },
    ],
  }
}

function defaultStubPlans(): StubSubscriptionPlan[] {
  return emptyStore().subscriptionPlans
}

/** Sync privacy hash for local stub (not cryptographic; never stores plaintext email). */
function stubEmailHash(email: string): string {
  const normalized = email.trim().toLowerCase()
  let h = 2166136261
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `fnv1a_${(h >>> 0).toString(16).padStart(8, '0')}`
}

function redactDisplayName(name: string | null | undefined): string | null {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return null
  return `${trimmed.slice(0, 1)}***`
}

function read(): Store {
  try {
    const raw = localStorage.getItem(ROOT)
    if (!raw) return emptyStore()
    const parsed = { ...emptyStore(), ...(JSON.parse(raw) as Partial<Store>) }
    if (!parsed.subscriptionPlans?.length) {
      parsed.subscriptionPlans = defaultStubPlans()
    } else {
      parsed.subscriptionPlans = parsed.subscriptionPlans.map((p) => ({
        ...p,
        is_default: p.is_default ?? p.slug === 'free',
        kind:
          p.kind === 'free' || p.slug === 'free'
            ? 'free'
            : p.kind === 'one_time'
              ? 'one_time'
              : 'subscription',
        max_private_models:
          p.max_private_models === undefined
            ? p.slug === 'export_once'
              ? 0
              : p.features?.includes('unlimited_saves')
                ? null
                : p.slug === 'paid_monthly' || p.slug === 'free'
                  ? 3
                  : null
            : p.max_private_models,
      }))
      if (!parsed.subscriptionPlans.some((p) => p.slug === 'free')) {
        const free = defaultStubPlans().find((p) => p.slug === 'free')
        if (free) {
          parsed.subscriptionPlans = [
            { ...free, is_default: true },
            ...parsed.subscriptionPlans.map((p) => ({ ...p, is_default: false })),
          ]
        }
      }
    }
    return parsed
  } catch {
    return emptyStore()
  }
}

function write(store: Store): void {
  localStorage.setItem(ROOT, JSON.stringify(store))
}

function uid(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

export function stubGetSession(): { user: { id: string; email: string }; profile: Profile } | null {
  const store = read()
  if (!store.sessionUserId) return null
  const user = store.users.find((u) => u.id === store.sessionUserId)
  if (!user) return null
  return { user: { id: user.id, email: user.email }, profile: user.profile }
}

export function stubSignUp(
  email: string,
  password: string,
  displayName: string,
  options?: { preferredPlanSlug?: string | null },
): { user: { id: string; email: string }; profile: Profile } {
  const store = read()
  const normalized = email.trim().toLowerCase()
  if (!normalized || !password) throw new ApiError('validation', 'E-mail en wachtwoord zijn verplicht.')
  if (store.users.some((u) => u.email === normalized)) {
    throw new ApiError('validation', 'Dit e-mailadres is al in gebruik.')
  }
  const id = uid()
  const preferred = options?.preferredPlanSlug?.trim() || null
  const defaultFree =
    store.subscriptionPlans.find((p) => p.is_default)?.slug ||
    store.subscriptionPlans.find((p) => p.kind === 'free' || p.slug === 'free')?.slug ||
    'free'
  const isPreferredFree =
    !preferred ||
    preferred === '__free__' ||
    preferred === 'free' ||
    preferred === 'gratis' ||
    store.subscriptionPlans.some(
      (p) =>
        p.slug === preferred &&
        (p.kind === 'free' || p.is_default || (p.price_cents ?? 0) <= 0),
    )
  const profile: Profile = {
    id,
    display_name: displayName.trim() || normalized.split('@')[0] || 'Gebruiker',
    bio: null,
    is_paid: false,
    paid_until: null,
    export_pack: false,
    // Gratis/default bij signup; betaald plan komt pas na checkout.
    subscription_plan_slug: isPreferredFree
      ? preferred && preferred !== '__free__'
        ? preferred
        : defaultFree
      : defaultFree,
    subscription_status: null,
    subscription_cancel_at: null,
    is_admin: false,
  }
  const user: StubUser = { id, email: normalized, password, profile }
  store.users.push(user)
  store.sessionUserId = id
  write(store)
  return { user: { id, email: normalized }, profile }
}

export function stubSignIn(
  email: string,
  password: string,
): { user: { id: string; email: string }; profile: Profile } {
  const store = read()
  const normalized = email.trim().toLowerCase()
  const user = store.users.find((u) => u.email === normalized && u.password === password)
  if (!user) throw new ApiError('unauthorized', 'Onjuiste inloggegevens.')
  store.sessionUserId = user.id
  write(store)
  return { user: { id: user.id, email: user.email }, profile: user.profile }
}

export function stubSignOut(): void {
  const store = read()
  store.sessionUserId = null
  write(store)
}

export function stubUpdateProfile(patch: { display_name?: string; bio?: string | null }): Profile {
  const store = read()
  const user = store.users.find((u) => u.id === store.sessionUserId)
  if (!user) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  if (patch.display_name != null) user.profile.display_name = patch.display_name.trim()
  if (patch.bio !== undefined) user.profile.bio = patch.bio
  write(store)
  return user.profile
}

/** Demo-only: toggle Paid without Mollie. */
export function stubSetPaid(paid: boolean): Profile {
  const store = read()
  const user = store.users.find((u) => u.id === store.sessionUserId)
  if (!user) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  user.profile.is_paid = paid
  if (paid) {
    const until = new Date()
    until.setMonth(until.getMonth() + 1)
    user.profile.paid_until = until.toISOString()
    user.profile.subscription_plan_slug = 'paid_monthly'
    user.profile.subscription_status = 'active'
    user.profile.subscription_cancel_at = null
  } else {
    user.profile.paid_until = null
    if (user.profile.subscription_plan_slug === 'paid_monthly') {
      user.profile.subscription_status = 'expired'
      user.profile.subscription_cancel_at = nowIso()
    }
  }
  write(store)
  return user.profile
}

/** Demo-only: toggle one-time export pack without Mollie. */
export function stubSetExportPack(on: boolean): Profile {
  const store = read()
  const user = store.users.find((u) => u.id === store.sessionUserId)
  if (!user) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  user.profile.export_pack = on
  if (on) {
    if (!isEntitledPaid(user.profile)) {
      user.profile.subscription_plan_slug = 'export_once'
      user.profile.subscription_status = 'active'
      user.profile.subscription_cancel_at = null
    }
  }
  write(store)
  return user.profile
}

/**
 * Demo-only: cancel Paid (stop “renewal”).
 * Default keeps access until paid_until; endImmediately clears Paid now.
 */
export function stubCancelSubscription(endImmediately = false): Profile {
  const store = read()
  const user = store.users.find((u) => u.id === store.sessionUserId)
  if (!user) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  if (!user.profile.is_paid) {
    throw new ApiError('validation', 'Geen actief maandabonnement om te annuleren.')
  }
  user.profile.subscription_plan_slug = user.profile.subscription_plan_slug ?? 'paid_monthly'
  if (endImmediately) {
    user.profile.is_paid = false
    user.profile.paid_until = null
    user.profile.subscription_status = 'canceled'
    user.profile.subscription_cancel_at = nowIso()
  } else {
    user.profile.subscription_status = 'canceled'
    user.profile.subscription_cancel_at = user.profile.paid_until ?? nowIso()
  }
  write(store)
  return user.profile
}

/** Demo-only: toggle admin role (local stub without Supabase). */
export function stubSetAdmin(on: boolean): Profile {
  const store = read()
  const user = store.users.find((u) => u.id === store.sessionUserId)
  if (!user) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  user.profile.is_admin = on
  write(store)
  return user.profile
}

export function stubListMine(): StubModel[] {
  const store = read()
  if (!store.sessionUserId) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  return store.models
    .filter((m) => m.owner_id === store.sessionUserId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export function stubSaveModel(input: {
  id?: string
  name: string
  scene: SceneModel
  config: KlimrekConfig
}): StubModel {
  const store = read()
  const uid = store.sessionUserId
  if (!uid) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  const user = store.users.find((u) => u.id === uid)!
  const name = input.name.trim() || `Model ${new Date().toLocaleString('nl-NL')}`

  if (input.id) {
    const idx = store.models.findIndex((m) => m.id === input.id && m.owner_id === uid)
    if (idx < 0) throw new ApiError('not_found', 'Model niet gevonden.')
    const updated: StubModel = {
      ...store.models[idx],
      name,
      scene: input.scene,
      config: input.config,
      updated_at: nowIso(),
    }
    store.models[idx] = updated
    write(store)
    return updated
  }

  const limit = resolvePrivateModelLimit(
    user.profile,
    store.subscriptionPlans,
    FREE_PRIVATE_MODEL_LIMIT,
  )
  if (limit != null) {
    const privateCount = store.models.filter(
      (m) => m.owner_id === uid && m.visibility === 'private',
    ).length
    if (privateCount >= limit) {
      throw new ApiError('save_limit', saveLimitMessage(limit))
    }
  }

  const model: StubModel = {
    id: crypto.randomUUID(),
    owner_id: uid,
    name,
    scene: input.scene,
    config: input.config,
    visibility: 'private',
    forked_from_id: null,
    attribution_name: null,
    published_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  store.models.unshift(model)
  write(store)
  return model
}

export function stubDeleteModel(id: string): void {
  const store = read()
  if (!store.sessionUserId) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  store.models = store.models.filter((m) => !(m.id === id && m.owner_id === store.sessionUserId))
  write(store)
}

export function stubPublish(id: string): StubModel {
  const store = read()
  const uid = store.sessionUserId
  if (!uid) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  const user = store.users.find((u) => u.id === uid)!
  if (!isEntitledPaid(user.profile)) throw new ApiError('paid_required', 'Publiceren vereist een maandabonnement.')
  const m = store.models.find((x) => x.id === id && x.owner_id === uid)
  if (!m) throw new ApiError('not_found', 'Model niet gevonden.')
  m.visibility = 'published'
  m.published_at = m.published_at ?? nowIso()
  m.updated_at = nowIso()
  write(store)
  return m
}

export function stubUnpublish(id: string): StubModel {
  const store = read()
  const uid = store.sessionUserId
  if (!uid) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  const m = store.models.find((x) => x.id === id && x.owner_id === uid)
  if (!m) throw new ApiError('not_found', 'Model niet gevonden.')
  m.visibility = 'private'
  m.published_at = null
  m.updated_at = nowIso()
  write(store)
  return m
}

export function stubListGallery(): (StubModel & { owner_display_name: string })[] {
  const store = read()
  return store.models
    .filter((m) => m.visibility === 'published')
    .map((m) => ({
      ...m,
      owner_display_name:
        store.users.find((u) => u.id === m.owner_id)?.profile.display_name || 'Onbekende ontwerper',
    }))
    .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
}

export function stubGetModel(id: string): (StubModel & { owner_display_name: string }) | null {
  const store = read()
  const m = store.models.find((x) => x.id === id)
  if (!m) return null
  if (m.visibility !== 'published' && m.owner_id !== store.sessionUserId) return null
  return {
    ...m,
    owner_display_name:
      store.users.find((u) => u.id === m.owner_id)?.profile.display_name || 'Onbekende ontwerper',
  }
}

export function stubFork(id: string): StubModel {
  const store = read()
  const uid = store.sessionUserId
  if (!uid) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  const user = store.users.find((u) => u.id === uid)!
  if (!isEntitledPaid(user.profile)) {
    throw new ApiError('paid_required', 'Bewerken voor jezelf vereist een maandabonnement.')
  }
  const src = store.models.find((m) => m.id === id && m.visibility === 'published')
  if (!src) throw new ApiError('not_found', 'Gepubliceerd model niet gevonden.')
  const ownerName =
    store.users.find((u) => u.id === src.owner_id)?.profile.display_name || 'Onbekende ontwerper'
  const fork: StubModel = {
    id: crypto.randomUUID(),
    owner_id: uid,
    name: `Kopie van ${src.name}`,
    scene: structuredClone(src.scene),
    config: structuredClone(src.config),
    visibility: 'private',
    forked_from_id: src.id,
    attribution_name: ownerName,
    published_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  store.models.unshift(fork)
  write(store)
  return fork
}

export function stubToggleFavourite(modelId: string, on: boolean): void {
  const store = read()
  const uid = store.sessionUserId
  if (!uid) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  store.favourites = store.favourites.filter((f) => !(f.user_id === uid && f.model_id === modelId))
  if (on) {
    const m = store.models.find((x) => x.id === modelId && x.visibility === 'published')
    if (!m) throw new ApiError('not_found', 'Alleen gepubliceerde modellen kunnen favoriet worden.')
    store.favourites.push({ user_id: uid, model_id: modelId, created_at: nowIso() })
  }
  write(store)
}

export function stubListFavourites(): (StubModel & { owner_display_name: string })[] {
  const store = read()
  const uid = store.sessionUserId
  if (!uid) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  const ids = new Set(store.favourites.filter((f) => f.user_id === uid).map((f) => f.model_id))
  return stubListGallery().filter((m) => ids.has(m.id) && m.visibility === 'published')
}

export function stubIsFavourite(modelId: string): boolean {
  const store = read()
  const uid = store.sessionUserId
  if (!uid) return false
  return store.favourites.some((f) => f.user_id === uid && f.model_id === modelId)
}

export function stubFollow(followeeId: string, on: boolean): void {
  const store = read()
  const uid = store.sessionUserId
  if (!uid) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  if (followeeId === uid) throw new ApiError('validation', 'Je kunt jezelf niet volgen.')
  store.follows = store.follows.filter((f) => !(f.follower_id === uid && f.followee_id === followeeId))
  if (on) {
    if (!store.users.some((u) => u.id === followeeId)) {
      throw new ApiError('not_found', 'Gebruiker niet gevonden.')
    }
    store.follows.push({ follower_id: uid, followee_id: followeeId, created_at: nowIso() })
  }
  write(store)
}

export function stubIsFollowing(followeeId: string): boolean {
  const store = read()
  const uid = store.sessionUserId
  if (!uid) return false
  return store.follows.some((f) => f.follower_id === uid && f.followee_id === followeeId)
}

export function stubListFollowingFeed(): (StubModel & { owner_display_name: string })[] {
  const store = read()
  const uid = store.sessionUserId
  if (!uid) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  const followees = new Set(
    store.follows.filter((f) => f.follower_id === uid).map((f) => f.followee_id),
  )
  return stubListGallery().filter((m) => followees.has(m.owner_id))
}

export function stubGetProfile(userId: string): Profile | null {
  const store = read()
  return store.users.find((u) => u.id === userId)?.profile ?? null
}

/**
 * Permanently wipe the signed-in stub user + owned data.
 * Keeps an anonymized audit row in localStorage (no plaintext email).
 */
export function stubDeleteAccount(confirmEmail: string, reason: string | null = null): void {
  const store = read()
  const userId = store.sessionUserId
  if (!userId) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  const user = store.users.find((u) => u.id === userId)
  if (!user) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')

  const confirm = confirmEmail.trim()
  const ok =
    confirm.toUpperCase() === 'VERWIJDER' ||
    confirm.toLowerCase() === user.email.trim().toLowerCase()
  if (!ok) {
    throw new ApiError('validation', 'Typ je e-mailadres of VERWIJDER om te bevestigen.')
  }

  const hadPaid = isEntitledPaid(user.profile)

  const audit: StubDeletedAccount = {
    id: crypto.randomUUID(),
    deleted_at: nowIso(),
    former_user_id: userId,
    email_hash: stubEmailHash(user.email),
    display_name_redacted: redactDisplayName(user.profile.display_name),
    had_paid: hadPaid,
    reason: reason?.trim() || null,
  }
  store.deletedAccounts = [audit, ...(store.deletedAccounts ?? [])]

  const ownedModelIds = new Set(
    store.models.filter((m) => m.owner_id === userId).map((m) => m.id),
  )
  store.models = store.models.filter((m) => m.owner_id !== userId)
  store.favourites = store.favourites.filter(
    (f) => f.user_id !== userId && !ownedModelIds.has(f.model_id),
  )
  store.follows = store.follows.filter(
    (f) => f.follower_id !== userId && f.followee_id !== userId,
  )
  store.users = store.users.filter((u) => u.id !== userId)
  store.sessionUserId = null
  write(store)
}

export function stubListDeletedAccounts(limit = 40): StubDeletedAccount[] {
  const store = read()
  return (store.deletedAccounts ?? [])
    .slice()
    .sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
    .slice(0, Math.max(1, Math.min(limit, 200)))
}

export function stubDeletedAccountsCount(): number {
  const store = read()
  return (store.deletedAccounts ?? []).length
}

export function stubListActivePlans(): StubSubscriptionPlan[] {
  return read()
    .subscriptionPlans.filter((p) => p.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
}

export function stubAdminListPlans(): StubSubscriptionPlan[] {
  return read()
    .subscriptionPlans.slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
}

export function stubAdminCreatePlan(input: {
  slug: string
  name: string
  description?: string
  kind: 'subscription' | 'one_time' | 'free'
  price_cents: number
  currency?: string
  interval?: 'month' | null
  features?: string[]
  is_active?: boolean
  sort_order?: number
  max_private_models?: number | null
  is_default?: boolean
}): StubSubscriptionPlan {
  const store = read()
  const slug = input.slug.trim().toLowerCase()
  if (!slug) throw new ApiError('validation', 'Slug is verplicht.')
  if (store.subscriptionPlans.some((p) => p.slug === slug)) {
    throw new ApiError('validation', 'Deze slug bestaat al.')
  }
  const ts = nowIso()
  const isFree = input.kind === 'free'
  const plan: StubSubscriptionPlan = {
    id: uid(),
    slug,
    name: input.name.trim() || slug,
    description: input.description?.trim() || '',
    kind: input.kind,
    price_cents: isFree ? 0 : Math.max(1, Math.round(input.price_cents)),
    currency: (input.currency || 'eur').toLowerCase(),
    interval: input.kind === 'subscription' ? input.interval || 'month' : null,
    features: [...(input.features ?? [])],
    max_private_models:
      input.max_private_models === undefined ? null : input.max_private_models,
    is_active: input.is_active ?? true,
    is_default: input.is_default ?? false,
    sort_order: input.sort_order ?? 100,
    created_at: ts,
    updated_at: ts,
  }
  if (plan.is_default) {
    for (const p of store.subscriptionPlans) p.is_default = false
  }
  store.subscriptionPlans.push(plan)
  write(store)
  return plan
}

export function stubAdminUpdatePlan(input: {
  id: string
  name?: string
  description?: string
  price_cents?: number
  currency?: string
  features?: string[]
  is_active?: boolean
  sort_order?: number
  interval?: 'month' | null
  max_private_models?: number | null
  setMaxPrivateModels?: boolean
  is_default?: boolean
}): StubSubscriptionPlan {
  const store = read()
  const idx = store.subscriptionPlans.findIndex((p) => p.id === input.id)
  if (idx < 0) throw new ApiError('not_found', 'Plan niet gevonden.')
  const prev = store.subscriptionPlans[idx]
  const nextDefault = input.is_default != null ? input.is_default : prev.is_default
  const updated: StubSubscriptionPlan = {
    ...prev,
    name: input.name != null ? input.name.trim() || prev.name : prev.name,
    description: input.description != null ? input.description : prev.description,
    price_cents:
      input.price_cents != null
        ? prev.kind === 'free'
          ? Math.max(0, Math.round(input.price_cents))
          : Math.max(1, Math.round(input.price_cents))
        : prev.price_cents,
    currency: input.currency != null ? input.currency.toLowerCase() : prev.currency,
    features: input.features != null ? [...input.features] : prev.features,
    is_active: input.is_active != null ? input.is_active : prev.is_active,
    sort_order: input.sort_order != null ? input.sort_order : prev.sort_order,
    interval:
      prev.kind === 'subscription'
        ? input.interval !== undefined
          ? input.interval
          : prev.interval
        : null,
    max_private_models: input.setMaxPrivateModels
      ? (input.max_private_models ?? null)
      : (prev.max_private_models ?? null),
    is_default: nextDefault,
    updated_at: nowIso(),
  }
  if (updated.is_default) {
    for (let i = 0; i < store.subscriptionPlans.length; i++) {
      if (i !== idx) store.subscriptionPlans[i] = { ...store.subscriptionPlans[i], is_default: false }
    }
  }
  store.subscriptionPlans[idx] = updated
  write(store)
  return updated
}

function requireStubAdmin(): StubUser {
  const store = read()
  const user = store.users.find((u) => u.id === store.sessionUserId)
  if (!user) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  if (!user.profile.is_admin) throw new ApiError('unauthorized', 'admin_required')
  return user
}

export function stubAdminLookupUserSubscription(input: {
  email?: string | null
  profile_id?: string | null
}): {
  found: boolean
  profile_id?: string
  email?: string | null
  display_name?: string | null
  subscription_plan_slug?: string | null
  is_paid?: boolean
  paid_until?: string | null
  export_pack?: boolean
  subscription_status?: string | null
  mollie_subscription_id?: string | null
  mollie_subscription_status?: string | null
  mollie_customer_id?: string | null
} {
  requireStubAdmin()
  const store = read()
  let target: StubUser | undefined
  if (input.profile_id) {
    target = store.users.find((u) => u.id === input.profile_id)
  } else if (input.email?.trim()) {
    const email = input.email.trim().toLowerCase()
    target = store.users.find((u) => u.email === email)
  }
  if (!target) return { found: false }
  return {
    found: true,
    profile_id: target.id,
    email: target.email,
    display_name: target.profile.display_name,
    subscription_plan_slug: target.profile.subscription_plan_slug ?? null,
    is_paid: Boolean(target.profile.is_paid),
    paid_until: target.profile.paid_until ?? null,
    export_pack: Boolean(target.profile.export_pack),
    subscription_status: target.profile.subscription_status ?? null,
    mollie_subscription_id: target.profile.mollie_subscription_id ?? null,
    mollie_subscription_status: target.profile.mollie_subscription_status ?? null,
    mollie_customer_id: target.profile.mollie_customer_id ?? null,
  }
}

export function stubAdminListUsersForAssign(input?: {
  query?: string | null
  limit?: number
}): {
  profile_id: string
  email: string | null
  display_name: string | null
  subscription_plan_slug: string | null
  is_paid: boolean
  paid_until: string | null
  export_pack: boolean
  subscription_status: string | null
  mollie_subscription_id: string | null
}[] {
  requireStubAdmin()
  const store = read()
  const q = input?.query?.trim().toLowerCase() || null
  const limit = Math.max(1, Math.min(input?.limit ?? 40, 100))
  return store.users
    .filter((u) => {
      if (!q) return true
      return (
        u.email.includes(q) ||
        (u.profile.display_name || '').toLowerCase().includes(q) ||
        (u.profile.subscription_plan_slug || '').toLowerCase().includes(q)
      )
    })
    .slice()
    .sort((a, b) => (b.profile.updated_at || '').localeCompare(a.profile.updated_at || ''))
    .slice(0, limit)
    .map((u) => ({
      profile_id: u.id,
      email: u.email,
      display_name: u.profile.display_name,
      subscription_plan_slug: u.profile.subscription_plan_slug ?? null,
      is_paid: Boolean(u.profile.is_paid),
      paid_until: u.profile.paid_until ?? null,
      export_pack: Boolean(u.profile.export_pack),
      subscription_status: u.profile.subscription_status ?? null,
      mollie_subscription_id: u.profile.mollie_subscription_id ?? null,
    }))
}

export function stubAdminAssignPlan(input: {
  plan_slug: string
  email?: string | null
  profile_id?: string | null
  paid_until?: string | null
  note?: string | null
  clear_mollie_local?: boolean
}): {
  ok: boolean
  profile_id: string
  email: string | null
  from_plan_slug: string | null
  to_plan_slug: string
  plan_kind: string
  is_paid: boolean
  paid_until: string | null
  export_pack: boolean
  subscription_status: string | null
  had_mollie_subscription: boolean
  mollie_local_cleared: boolean
} {
  const admin = requireStubAdmin()
  const store = read()
  const plan = store.subscriptionPlans.find((p) => p.slug === input.plan_slug.trim())
  if (!plan) throw new ApiError('not_found', 'plan_not_found')

  let target: StubUser | undefined
  if (input.profile_id) {
    target = store.users.find((u) => u.id === input.profile_id)
  } else if (input.email?.trim()) {
    const email = input.email.trim().toLowerCase()
    target = store.users.find((u) => u.email === email)
  }
  if (!target) throw new ApiError('not_found', 'user_not_found')

  const fromSlug = target.profile.subscription_plan_slug ?? null
  const hadMollie = Boolean(target.profile.mollie_subscription_id)
  const clearMollie = input.clear_mollie_local !== false

  if (plan.kind === 'free') {
    target.profile.subscription_plan_slug = plan.slug
    target.profile.is_paid = false
    target.profile.paid_until = null
    target.profile.export_pack = false
    target.profile.subscription_status = 'active'
    target.profile.subscription_cancel_at = null
  } else if (plan.kind === 'one_time') {
    target.profile.subscription_plan_slug = plan.slug
    target.profile.export_pack = true
    target.profile.subscription_status = 'active'
    target.profile.subscription_cancel_at = null
  } else {
    let until = input.paid_until ?? null
    if (!until) {
      if (target.profile.paid_until && new Date(target.profile.paid_until).getTime() > Date.now()) {
        until = target.profile.paid_until
      } else {
        const d = new Date()
        d.setMonth(d.getMonth() + 1)
        until = d.toISOString()
      }
    }
    target.profile.subscription_plan_slug = plan.slug
    target.profile.is_paid = true
    target.profile.paid_until = until
    target.profile.subscription_status = 'active'
    target.profile.subscription_cancel_at = null
  }

  if (clearMollie && hadMollie && plan.kind !== 'one_time') {
    target.profile.mollie_subscription_status = 'canceled'
    target.profile.mollie_subscription_next_payment_at = null
  }
  target.profile.updated_at = nowIso()

  const event: StubPlanAssignmentEvent = {
    id: store.nextPlanAssignmentId ?? 1,
    created_at: nowIso(),
    admin_id: admin.id,
    admin_email: admin.email,
    target_user_id: target.id,
    target_email: target.email,
    from_plan_slug: fromSlug,
    to_plan_slug: plan.slug,
    paid_until: target.profile.paid_until ?? null,
    note: input.note?.trim() || null,
    had_mollie_subscription: hadMollie,
  }
  store.nextPlanAssignmentId = (store.nextPlanAssignmentId ?? 1) + 1
  store.planAssignmentEvents = [event, ...(store.planAssignmentEvents ?? [])]
  write(store)

  return {
    ok: true,
    profile_id: target.id,
    email: target.email,
    from_plan_slug: fromSlug,
    to_plan_slug: plan.slug,
    plan_kind: plan.kind,
    is_paid: Boolean(target.profile.is_paid),
    paid_until: target.profile.paid_until ?? null,
    export_pack: Boolean(target.profile.export_pack),
    subscription_status: target.profile.subscription_status ?? null,
    had_mollie_subscription: hadMollie,
    mollie_local_cleared: clearMollie && hadMollie && plan.kind !== 'one_time',
  }
}

export function stubAdminListPlanAssignmentEvents(limit = 50): StubPlanAssignmentEvent[] {
  requireStubAdmin()
  const store = read()
  return (store.planAssignmentEvents ?? [])
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, Math.max(1, Math.min(limit, 200)))
}

export type { StubModel }
