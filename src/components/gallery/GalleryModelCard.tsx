import { lazy, Suspense, type ReactNode, type MouseEvent } from 'react'
import type { CloudModel } from '../../lib/models/types'
import { navigate } from '../../lib/routing'

/** Lazy: WebGL-thumbs niet in de hoofdchunk. */
const GalleryThumb3D = lazy(() =>
  import('./GalleryThumb3D').then((m) => ({ default: m.GalleryThumb3D })),
)

interface GalleryModelCardProps {
  model: CloudModel
  /** Extra meta onder de titel (eigenaar, datum, …). */
  meta?: ReactNode
}

export function GalleryModelCard({ model, meta }: GalleryModelCardProps) {
  const openModel = () => navigate({ name: 'model', id: model.id })

  const onBodyClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    // Laat maker-links (linkish) hun eigen navigatie doen.
    if (target.closest('a, button.linkish, .linkish')) return
    openModel()
  }

  return (
    <li className="gallery-item gallery-card">
      <button
        type="button"
        className="gallery-card-hit"
        onClick={openModel}
        aria-label={`${model.name} in 3D bekijken`}
      >
        <Suspense fallback={<div className="gallery-thumb-placeholder" aria-hidden />}>
          <GalleryThumb3D
            modelId={model.id}
            updatedAt={model.updated_at}
            scene={model.scene}
            config={model.config}
          />
        </Suspense>
      </button>
      <div className="gallery-item-body" onClick={onBodyClick}>
        <strong>{model.name}</strong>
        {meta}
      </div>
      <button type="button" className="bom-action-btn" onClick={openModel}>
        3D bekijken
      </button>
    </li>
  )
}
