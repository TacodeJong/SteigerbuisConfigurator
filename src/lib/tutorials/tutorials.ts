import { getSupabase, isSupabaseConfigured } from '../auth/supabaseClient'

export const TUTORIALS_BUCKET = 'tutorials'

export interface Tutorial {
  id: string
  title: string
  description: string | null
  storage_path: string
  public_url: string | null
  mime_type: string | null
  duration_seconds: number | null
  sort_order: number
  is_published: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

const SELECT_COLS =
  'id, title, description, storage_path, public_url, mime_type, duration_seconds, sort_order, is_published, created_at, updated_at, created_by'

function requireSupabase() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase niet geconfigureerd')
  return supabase
}

/** Public URL for a path in the tutorials bucket. */
export function tutorialPublicUrl(storagePath: string): string {
  const supabase = getSupabase()
  if (!supabase) return ''
  const { data } = supabase.storage.from(TUTORIALS_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

/** Playback URL: prefer stored public_url, else derive from storage_path. */
export function tutorialVideoSrc(t: Tutorial): string {
  if (t.public_url?.trim()) return t.public_url.trim()
  return tutorialPublicUrl(t.storage_path)
}

/** Published tutorials for the user-facing Uitleg page. */
export async function listPublishedTutorials(): Promise<Tutorial[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('tutorials')
    .select(SELECT_COLS)
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Tutorial[]
}

/** All tutorials (admin). RLS allows admin to see unpublished. */
export async function adminListTutorials(): Promise<Tutorial[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('tutorials')
    .select(SELECT_COLS)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Tutorial[]
}

export interface TutorialUploadInput {
  file: File
  title: string
  description?: string | null
  sort_order?: number
  is_published?: boolean
  onProgress?: (ratio: number) => void
}

function assertVideoFile(file: File): void {
  const mime = file.type.toLowerCase()
  const okMime = mime === 'video/mp4' || mime === 'video/webm'
  const name = file.name.toLowerCase()
  const okExt = name.endsWith('.mp4') || name.endsWith('.webm')
  if (!okMime && !okExt) {
    throw new Error('Alleen MP4 of WebM video’s zijn toegestaan')
  }
}

function extensionForFile(file: File): string {
  const name = file.name.toLowerCase()
  if (name.endsWith('.webm') || file.type === 'video/webm') return 'webm'
  return 'mp4'
}

/**
 * Upload video to Storage + insert metadata row.
 * Progress is approximate (Storage JS client has no byte-level callback; we pulse 0→0.9→1).
 */
export async function adminUploadTutorial(input: TutorialUploadInput): Promise<Tutorial> {
  const supabase = requireSupabase()
  assertVideoFile(input.file)

  const title = input.title.trim()
  if (!title) throw new Error('Titel is verplicht')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')

  input.onProgress?.(0.05)

  const ext = extensionForFile(input.file)
  const id = crypto.randomUUID()
  const storagePath = `${id}.${ext}`
  const mime =
    input.file.type ||
    (ext === 'webm' ? 'video/webm' : 'video/mp4')

  input.onProgress?.(0.15)

  const { error: uploadError } = await supabase.storage
    .from(TUTORIALS_BUCKET)
    .upload(storagePath, input.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: mime,
    })

  if (uploadError) throw uploadError
  input.onProgress?.(0.85)

  const publicUrl = tutorialPublicUrl(storagePath)

  const { data, error } = await supabase
    .from('tutorials')
    .insert({
      title,
      description: input.description?.trim() || null,
      storage_path: storagePath,
      public_url: publicUrl || null,
      mime_type: mime,
      sort_order: input.sort_order ?? 0,
      is_published: input.is_published ?? false,
      created_by: user.id,
    })
    .select(SELECT_COLS)
    .single()

  if (error) {
    // Best-effort cleanup of orphaned object
    await supabase.storage.from(TUTORIALS_BUCKET).remove([storagePath])
    throw error
  }

  input.onProgress?.(1)
  return data as Tutorial
}

export async function adminUpdateTutorial(
  id: string,
  patch: {
    title?: string
    description?: string | null
    sort_order?: number
    is_published?: boolean
  },
): Promise<Tutorial> {
  const supabase = requireSupabase()
  const updates: Record<string, unknown> = {}
  if (patch.title !== undefined) {
    const t = patch.title.trim()
    if (!t) throw new Error('Titel is verplicht')
    updates.title = t
  }
  if (patch.description !== undefined) {
    updates.description = patch.description?.trim() || null
  }
  if (patch.sort_order !== undefined) updates.sort_order = patch.sort_order
  if (patch.is_published !== undefined) updates.is_published = patch.is_published

  const { data, error } = await supabase
    .from('tutorials')
    .update(updates)
    .eq('id', id)
    .select(SELECT_COLS)
    .single()

  if (error) throw error
  return data as Tutorial
}

export async function adminDeleteTutorial(tutorial: Tutorial): Promise<void> {
  const supabase = requireSupabase()

  const { error: rowError } = await supabase.from('tutorials').delete().eq('id', tutorial.id)
  if (rowError) throw rowError

  if (tutorial.storage_path) {
    const { error: storageError } = await supabase.storage
      .from(TUTORIALS_BUCKET)
      .remove([tutorial.storage_path])
    if (storageError) {
      console.warn('tutorial storage remove', storageError.message)
    }
  }
}
