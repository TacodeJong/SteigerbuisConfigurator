import type { FittingType, MaterialId } from '../types'
import { FITTINGS, MATERIALS } from '../data/catalog'
import { isSupabaseConfigured } from './auth/supabaseClient'

/** Catalogusversie — verhoog bij camera/mesh-wijzigingen en regenereer assets. */
export const FITTING_PREVIEW_ASSET_VERSION = 'v1'

/** Standaard diameter voor catalogus-thumbs (vorm herkenbaar; Ø niet per variant). */
export const FITTING_PREVIEW_STANDARD_DIAMETER = 33.7 as const

export const FITTING_PREVIEWS_BUCKET = 'fitting-previews'

const viteEnv =
  typeof import.meta !== 'undefined'
    ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    : undefined

/** Negatieve cache na mislukte load (onError). */
const missingStatic = new Set<string>()
const resolvedStatic = new Map<string, string>()

export function fittingPreviewFileName(type: FittingType, materialId: MaterialId): string {
  return `${type}--${materialId}.jpg`
}

export function fittingPreviewObjectPath(type: FittingType, materialId: MaterialId): string {
  return `${FITTING_PREVIEW_ASSET_VERSION}/${fittingPreviewFileName(type, materialId)}`
}

export function fittingPreviewCacheKey(type: FittingType, materialId: MaterialId): string {
  return `${FITTING_PREVIEW_ASSET_VERSION}:${type}:${materialId}`
}

/** Alle catalogus-combinaties (type × materiaal) voor seed/generatie. */
export function allFittingPreviewCombos(): { type: FittingType; materialId: MaterialId }[] {
  const out: { type: FittingType; materialId: MaterialId }[] = []
  for (const f of FITTINGS) {
    for (const m of MATERIALS) {
      out.push({ type: f.type, materialId: m.id })
    }
  }
  return out
}

function supabasePublicObjectUrl(objectPath: string): string | null {
  const base = viteEnv?.VITE_SUPABASE_URL?.trim()
  if (!base || !isSupabaseConfigured()) return null
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${FITTING_PREVIEWS_BUCKET}/${objectPath}`
}

/** Zelfde-origin catalogus-URL (meegeladen in de build). */
export function fittingPreviewLocalUrl(type: FittingType, materialId: MaterialId): string {
  return `/fittings/${fittingPreviewObjectPath(type, materialId)}`
}

/**
 * Kandidaat-URL's voor een standaardweergave.
 * 1) Zelfde-origin `public/fittings/` (snel, betrouwbaar)
 * 2) Supabase Storage bucket (backend)
 */
export function fittingPreviewCandidateUrls(
  type: FittingType,
  materialId: MaterialId,
): string[] {
  const objectPath = fittingPreviewObjectPath(type, materialId)
  const urls: string[] = [fittingPreviewLocalUrl(type, materialId)]
  const storage = supabasePublicObjectUrl(objectPath)
  if (storage) urls.push(storage)
  return urls
}

/**
 * Primaire standaard-preview-URL zonder netwerk-probe.
 * Ontbrekende assets: markeer via `markFittingPreviewMissing` (img onError) → live R3F.
 */
export function resolveFittingPreviewUrlSync(
  type: FittingType,
  materialId: MaterialId,
): string | null {
  const key = fittingPreviewCacheKey(type, materialId)
  if (missingStatic.has(key)) return null
  const hit = resolvedStatic.get(key)
  if (hit) return hit
  const url = fittingPreviewLocalUrl(type, materialId)
  resolvedStatic.set(key, url)
  return url
}

export function markFittingPreviewMissing(type: FittingType, materialId: MaterialId): void {
  const key = fittingPreviewCacheKey(type, materialId)
  missingStatic.add(key)
  resolvedStatic.delete(key)
}

export function markFittingPreviewResolved(
  type: FittingType,
  materialId: MaterialId,
  url: string,
): void {
  const key = fittingPreviewCacheKey(type, materialId)
  missingStatic.delete(key)
  resolvedStatic.set(key, url)
}

/**
 * Async resolve: probe Storage als local ontbreekt (zeldzaam; seed zit in public/).
 */
export async function resolveFittingPreviewUrl(
  type: FittingType,
  materialId: MaterialId,
): Promise<string | null> {
  const sync = resolveFittingPreviewUrlSync(type, materialId)
  if (sync) return sync

  const key = fittingPreviewCacheKey(type, materialId)
  if (missingStatic.has(key)) return null

  const storage = supabasePublicObjectUrl(fittingPreviewObjectPath(type, materialId))
  if (!storage) {
    missingStatic.add(key)
    return null
  }

  const ok = await new Promise<boolean>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = storage
  })
  if (ok) {
    markFittingPreviewResolved(type, materialId, storage)
    return storage
  }
  missingStatic.add(key)
  return null
}

/** Absoluut (of data-) URL voor print-HTML in blob/about:blank vensters. */
export function toPrintableImageSrc(url: string): string {
  if (url.startsWith('data:') || /^https?:\/\//i.test(url)) return url
  if (typeof window === 'undefined') return url
  try {
    return new URL(url, window.location.origin).href
  } catch {
    return url
  }
}

/**
 * Data-URL van een static asset (print-vriendelijk), of null bij ontbreken.
 */
export async function fetchFittingPreviewDataUrl(
  type: FittingType,
  materialId: MaterialId,
): Promise<string | null> {
  const url = await resolveFittingPreviewUrl(type, materialId)
  if (!url) return null
  if (url.startsWith('data:')) return url

  try {
    const abs = toPrintableImageSrc(url)
    const res = await fetch(abs)
    if (!res.ok) {
      markFittingPreviewMissing(type, materialId)
      return null
    }
    const blob = await res.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    markFittingPreviewMissing(type, materialId)
    return null
  }
}
