import type { KlimrekConfig, SceneModel } from '../../types'

export interface Profile {
  id: string
  display_name: string
  bio: string | null
  is_paid: boolean
  paid_until: string | null
  created_at: string
  updated_at: string
}

export type ModelVisibility = 'private' | 'published'

export interface CloudModel {
  id: string
  owner_id: string
  name: string
  scene: SceneModel
  config: KlimrekConfig
  visibility: ModelVisibility
  forked_from_id: string | null
  attribution_name: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  /** Joined for gallery */
  owner_display_name?: string
}

export interface GalleryItem {
  id: string
  name: string
  owner_id: string
  attribution_name: string | null
  published_at: string | null
  owner_display_name: string
  pipe_count?: number
}
