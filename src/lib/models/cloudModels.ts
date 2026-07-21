import type { KlimrekConfig, SceneModel } from '../../types'
import { ApiError, parseRpcError, FREE_PRIVATE_MODEL_LIMIT } from '../apiErrors'
import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'
import {
  stubDeleteModel,
  stubFork,
  stubGetModel,
  stubListGallery,
  stubListMine,
  stubPublish,
  stubSaveModel,
  stubUnpublish,
  stubUpdateProfile,
  type StubModel,
} from '../auth/localStubStore'
import type { CloudModel } from './types'

export type { CloudModel } from './types'
export { FREE_PRIVATE_MODEL_LIMIT }

function mapStub(m: StubModel & { owner_display_name?: string }): CloudModel {
  return {
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
  }
}

export async function listMyModels(): Promise<CloudModel[]> {
  if (!isSupabaseConfigured()) {
    return stubListMine().map(mapStub)
  }
  const supabase = getSupabase()!
  const { data, error } = await supabase
    .from('models')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw parseRpcError(error)
  return (data ?? []) as CloudModel[]
}

export async function saveCloudModel(input: {
  id?: string
  name: string
  scene: SceneModel
  config: KlimrekConfig
}): Promise<CloudModel> {
  if (!isSupabaseConfigured()) {
    return mapStub(stubSaveModel(input))
  }
  const supabase = getSupabase()!
  const { data, error } = await supabase.rpc('save_model', {
    p_name: input.name,
    p_scene: input.scene,
    p_config: input.config,
    p_id: input.id ?? null,
  })
  if (error) throw parseRpcError(error)
  return data as CloudModel
}

export async function deleteCloudModel(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    stubDeleteModel(id)
    return
  }
  const supabase = getSupabase()!
  const { error } = await supabase.from('models').delete().eq('id', id)
  if (error) throw parseRpcError(error)
}

export async function publishModel(id: string): Promise<CloudModel> {
  if (!isSupabaseConfigured()) return mapStub(stubPublish(id))
  const supabase = getSupabase()!
  const { data, error } = await supabase.rpc('publish_model', { p_id: id })
  if (error) throw parseRpcError(error)
  return data as CloudModel
}

export async function unpublishModel(id: string): Promise<CloudModel> {
  if (!isSupabaseConfigured()) return mapStub(stubUnpublish(id))
  const supabase = getSupabase()!
  const { data, error } = await supabase.rpc('unpublish_model', { p_id: id })
  if (error) throw parseRpcError(error)
  return data as CloudModel
}

export async function listGallery(): Promise<CloudModel[]> {
  if (!isSupabaseConfigured()) return stubListGallery().map(mapStub)
  const supabase = getSupabase()!
  // gallery_models soft-hides published rows when the owner is not paid-entitled
  const { data, error } = await supabase
    .from('gallery_models')
    .select('*')
    .order('published_at', { ascending: false })
  if (error) throw parseRpcError(error)
  const rows = (data ?? []) as CloudModel[]
  // Attach display names
  const ownerIds = [...new Set(rows.map((r) => r.owner_id))]
  if (ownerIds.length === 0) return rows
  const { data: profiles } = await supabase
    .from('public_profiles')
    .select('id, display_name')
    .in('id', ownerIds)
  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]))
  return rows.map((r) => ({
    ...r,
    owner_display_name: nameById.get(r.owner_id) ?? 'Onbekende ontwerper',
  }))
}

export async function getCloudModel(id: string): Promise<CloudModel | null> {
  if (!isSupabaseConfigured()) {
    const m = stubGetModel(id)
    return m ? mapStub(m) : null
  }
  const supabase = getSupabase()!
  const { data, error } = await supabase.from('models').select('*').eq('id', id).maybeSingle()
  if (error) throw parseRpcError(error)
  if (!data) return null
  const model = data as CloudModel
  const { data: profile } = await supabase
    .from('public_profiles')
    .select('display_name')
    .eq('id', model.owner_id)
    .maybeSingle()
  return {
    ...model,
    owner_display_name: profile?.display_name ?? undefined,
  }
}

export async function forkModel(id: string): Promise<CloudModel> {
  if (!isSupabaseConfigured()) return mapStub(stubFork(id))
  const supabase = getSupabase()!
  const { data, error } = await supabase.rpc('fork_model', { p_id: id })
  if (error) throw parseRpcError(error)
  return data as CloudModel
}

export async function updateDisplayName(displayName: string): Promise<void> {
  const trimmed = displayName.trim()
  if (!trimmed) throw new ApiError('validation', 'Weergavenaam mag niet leeg zijn.')
  if (!isSupabaseConfigured()) {
    stubUpdateProfile({ display_name: trimmed })
    return
  }
  const supabase = getSupabase()!
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new ApiError('unauthorized', 'Je moet ingelogd zijn.')
  const { error } = await supabase.from('profiles').update({ display_name: trimmed }).eq('id', user.id)
  if (error) throw parseRpcError(error)
}
