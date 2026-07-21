import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError } from '../apiErrors'
import { isEntitledPaid } from '../billing/entitlements'
import { getSupabase, isSupabaseConfigured } from './supabaseClient'
import {
  stubGetSession,
  stubSetAdmin,
  stubSetExportPack,
  stubSetPaid,
  stubSignIn,
  stubSignOut,
  stubSignUp,
  stubUpdateProfile,
} from './localStubStore'
import type { AuthUser, Profile, SessionState } from './types'
import { profileIsAdmin } from './types'

interface AuthContextValue extends SessionState {
  /** Convenience: current profile is Paid and not expired. */
  isPaid: boolean
  /** Site admin (profiles.is_admin) — not unlockable via URL. */
  isAdmin: boolean
  /** True when Supabase env is set (false = local stub). */
  configured: boolean
  refreshProfile: () => Promise<void>
  signUp: (
    email: string,
    password: string,
    displayName: string,
    options?: { preferredPlanSlug?: string | null },
  ) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  updateProfile: (patch: { display_name?: string; bio?: string | null }) => Promise<void>
  /** Local stub only — simulates Mollie webhook. */
  demoSetPaid: (paid: boolean) => Promise<void>
  demoSetExportPack: (on: boolean) => Promise<void>
  /** Local stub only — toggle admin for testing. */
  demoSetAdmin: (on: boolean) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) {
    console.warn('profile fetch', error.message)
    return null
  }
  return data as Profile | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isLocalStub = !isSupabaseConfigured()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    if (isLocalStub) {
      const session = stubGetSession()
      setUser(session?.user ?? null)
      setProfile(session?.profile ?? null)
      return
    }
    const supabase = getSupabase()
    if (!supabase || !user) return
    const next = await fetchProfile(user.id)
    setProfile(next)
  }, [isLocalStub, user])

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (isLocalStub) {
        const session = stubGetSession()
        if (!cancelled) {
          setUser(session?.user ?? null)
          setProfile(session?.profile ?? null)
          setLoading(false)
        }
        return
      }

      const supabase = getSupabase()
      if (!supabase) {
        setLoading(false)
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email ?? '' })
        setProfile(await fetchProfile(session.user.id))
      }
      setLoading(false)

      const { data: sub } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
        if (nextSession?.user) {
          setUser({ id: nextSession.user.id, email: nextSession.user.email ?? '' })
          setProfile(await fetchProfile(nextSession.user.id))
        } else {
          setUser(null)
          setProfile(null)
        }
      })

      return () => sub.subscription.unsubscribe()
    }

    let cleanup: (() => void) | undefined
    void init().then((fn) => {
      cleanup = fn
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [isLocalStub])

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      options?: { preferredPlanSlug?: string | null },
    ) => {
      const preferred = options?.preferredPlanSlug?.trim() || null
      if (isLocalStub) {
        const result = stubSignUp(email, password, displayName, {
          preferredPlanSlug: preferred,
        })
        setUser(result.user)
        setProfile(result.profile)
        return
      }
      const supabase = getSupabase()
      if (!supabase) throw new ApiError('not_configured', 'Supabase is niet geconfigureerd.')
      const meta: Record<string, string> = { display_name: displayName.trim() }
      if (preferred && preferred !== '__free__' && preferred !== 'free' && preferred !== 'gratis') {
        meta.preferred_plan_slug = preferred
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: meta },
      })
      if (error) throw new ApiError('validation', error.message)
      if (data.user) {
        setUser({ id: data.user.id, email: data.user.email ?? email })
        setProfile(await fetchProfile(data.user.id))
      }
    },
    [isLocalStub],
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (isLocalStub) {
        const result = stubSignIn(email, password)
        setUser(result.user)
        setProfile(result.profile)
        return
      }
      const supabase = getSupabase()
      if (!supabase) throw new ApiError('not_configured', 'Supabase is niet geconfigureerd.')
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) throw new ApiError('unauthorized', error.message)
      if (data.user) {
        setUser({ id: data.user.id, email: data.user.email ?? email })
        setProfile(await fetchProfile(data.user.id))
      }
    },
    [isLocalStub],
  )

  const signOut = useCallback(async () => {
    if (isLocalStub) {
      stubSignOut()
      setUser(null)
      setProfile(null)
      return
    }
    const supabase = getSupabase()
    await supabase?.auth.signOut()
    setUser(null)
    setProfile(null)
  }, [isLocalStub])

  const updateProfile = useCallback(
    async (patch: { display_name?: string; bio?: string | null }) => {
      if (isLocalStub) {
        setProfile(stubUpdateProfile(patch))
        return
      }
      if (!user) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
      const supabase = getSupabase()
      if (!supabase) throw new ApiError('not_configured', 'Supabase is niet geconfigureerd.')
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select('*')
        .single()
      if (error) throw new ApiError('validation', error.message)
      setProfile(data as Profile)
    },
    [isLocalStub, user],
  )

  const demoSetPaid = useCallback(
    async (paid: boolean) => {
      if (!isLocalStub) {
        throw new ApiError(
          'not_configured',
          'Demo maandabonnement-toggle werkt alleen zonder Supabase. Met Supabase: gebruik Mollie-checkout.',
        )
      }
      setProfile(stubSetPaid(paid))
    },
    [isLocalStub],
  )

  const demoSetExportPack = useCallback(
    async (on: boolean) => {
      if (!isLocalStub) {
        throw new ApiError(
          'not_configured',
          'Demo Betaal-per-keer-toggle werkt alleen zonder Supabase. Met Supabase: gebruik Mollie-checkout.',
        )
      }
      setProfile(stubSetExportPack(on))
    },
    [isLocalStub],
  )

  const demoSetAdmin = useCallback(
    async (on: boolean) => {
      if (!isLocalStub) {
        throw new ApiError(
          'not_configured',
          'Demo admin-toggle werkt alleen zonder Supabase. Met Supabase: zet is_admin via SQL.',
        )
      }
      setProfile(stubSetAdmin(on))
    },
    [isLocalStub],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      isLocalStub,
      isPaid: isEntitledPaid(profile),
      isAdmin: profileIsAdmin(profile),
      configured: isSupabaseConfigured(),
      refreshProfile,
      signUp,
      signIn,
      signOut,
      updateProfile,
      demoSetPaid,
      demoSetExportPack,
      demoSetAdmin,
    }),
    [
      user,
      profile,
      loading,
      isLocalStub,
      refreshProfile,
      signUp,
      signIn,
      signOut,
      updateProfile,
      demoSetPaid,
      demoSetExportPack,
      demoSetAdmin,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
