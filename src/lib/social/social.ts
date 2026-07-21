import { parseRpcError } from '../apiErrors'
import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'
import {
  stubIsFavourite,
  stubListFavourites,
  stubToggleFavourite,
  stubFollow,
  stubIsFollowing,
  stubListFollowingFeed,
  stubGetProfile,
} from '../auth/localStubStore'
import type { CloudModel } from '../models/cloudModels'
import type { Profile } from '../auth/types'

/** Public profile fields only (no is_paid / is_admin / subscription). */
export type PublicProfile = Pick<Profile, 'id' | 'display_name' | 'bio'>

export async function setFavourite(modelId: string, on: boolean): Promise<void> {
  if (!isSupabaseConfigured()) {
    stubToggleFavourite(modelId, on)
    return
  }
  const supabase = getSupabase()!
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw parseRpcError(new Error('unauthorized'))

  if (on) {
    const { error } = await supabase.from('favourites').insert({ user_id: user.id, model_id: modelId })
    if (error) throw parseRpcError(error)
  } else {
    const { error } = await supabase
      .from('favourites')
      .delete()
      .eq('user_id', user.id)
      .eq('model_id', modelId)
    if (error) throw parseRpcError(error)
  }
}

export async function isFavourite(modelId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return stubIsFavourite(modelId)
  const supabase = getSupabase()!
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('favourites')
    .select('model_id')
    .eq('user_id', user.id)
    .eq('model_id', modelId)
    .maybeSingle()
  return Boolean(data)
}

export async function listFavourites(): Promise<CloudModel[]> {
  if (!isSupabaseConfigured()) {
    return stubListFavourites().map((m) => ({
      id: m.id,
      owner_id: m.owner_id,
      name: m.name,
      scene: m.scene,
      config: m.config,
      visibility: m.visibility,
      forked_from_id: m.forked_from_id,
      attribution_name: m.attribution_name,
      published_at: m.published_at,
      created_at: m.created_at,
      updated_at: m.updated_at,
      owner_display_name: m.owner_display_name,
    }))
  }
  const supabase = getSupabase()!
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw parseRpcError(new Error('unauthorized'))

  const { data: favRows, error: favErr } = await supabase
    .from('favourites')
    .select('model_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (favErr) throw parseRpcError(favErr)
  const ids = (favRows ?? []).map((r) => r.model_id as string)
  if (ids.length === 0) return []

  // Soft-hide: only models still in the entitlement-gated gallery surface
  const { data, error } = await supabase.from('gallery_models').select('*').in('id', ids)
  if (error) throw parseRpcError(error)
  const byId = new Map((data ?? []).map((m) => [m.id as string, m as CloudModel]))
  return ids.map((id) => byId.get(id)).filter((m): m is CloudModel => Boolean(m))
}

export async function setFollow(followeeId: string, on: boolean): Promise<void> {
  if (!isSupabaseConfigured()) {
    stubFollow(followeeId, on)
    return
  }
  const supabase = getSupabase()!
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw parseRpcError(new Error('unauthorized'))

  if (on) {
    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: user.id, followee_id: followeeId })
    if (error) throw parseRpcError(error)
  } else {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('followee_id', followeeId)
    if (error) throw parseRpcError(error)
  }
}

export async function isFollowing(followeeId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return stubIsFollowing(followeeId)
  const supabase = getSupabase()!
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('follows')
    .select('followee_id')
    .eq('follower_id', user.id)
    .eq('followee_id', followeeId)
    .maybeSingle()
  return Boolean(data)
}

export async function listFollowingFeed(): Promise<CloudModel[]> {
  if (!isSupabaseConfigured()) {
    return stubListFollowingFeed().map((m) => ({
      id: m.id,
      owner_id: m.owner_id,
      name: m.name,
      scene: m.scene,
      config: m.config,
      visibility: m.visibility,
      forked_from_id: m.forked_from_id,
      attribution_name: m.attribution_name,
      published_at: m.published_at,
      created_at: m.created_at,
      updated_at: m.updated_at,
      owner_display_name: m.owner_display_name,
    }))
  }
  const supabase = getSupabase()!
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw parseRpcError(new Error('unauthorized'))

  const { data: follows, error: fErr } = await supabase
    .from('follows')
    .select('followee_id')
    .eq('follower_id', user.id)
  if (fErr) throw parseRpcError(fErr)
  const ids = (follows ?? []).map((f) => f.followee_id as string)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('gallery_models')
    .select('*')
    .in('owner_id', ids)
    .order('published_at', { ascending: false })
  if (error) throw parseRpcError(error)
  return (data ?? []) as CloudModel[]
}

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  if (!isSupabaseConfigured()) {
    const stub = stubGetProfile(userId)
    if (!stub) return null
    return { id: stub.id, display_name: stub.display_name, bio: stub.bio }
  }
  const supabase = getSupabase()!
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, display_name, bio')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw parseRpcError(error)
  return data as PublicProfile | null
}
