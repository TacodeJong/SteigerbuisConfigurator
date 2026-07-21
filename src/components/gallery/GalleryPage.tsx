import { useEffect, useState } from 'react'
import { listGallery, type CloudModel } from '../../lib/models/cloudModels'
import { navigate } from '../../lib/routing'
import { MakerMeta } from '../MakerMeta'
import { GalleryModelCard } from './GalleryModelCard'

export function GalleryPage() {
  const [items, setItems] = useState<CloudModel[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const list = await listGallery()
        if (!cancelled) setItems(list)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Galerij laden mislukt')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="app-page gallery-page">
      <button type="button" className="linkish" onClick={() => navigate({ name: 'app' })}>
        ← Terug naar ontwerpen
      </button>
      <h1>Galerij</h1>
      <p className="muted">Gepubliceerde ontwerpen van de community. Openen is view-only.</p>
      {loading && <p>Laden…</p>}
      {error && <p className="auth-error">{error}</p>}
      {!loading && items.length === 0 && <p className="muted">Nog geen gepubliceerde modellen.</p>}
      <ul className="gallery-list">
        {items.map((m) => (
          <GalleryModelCard
            key={m.id}
            model={m}
            meta={
              <p className="muted">
                door{' '}
                <MakerMeta
                  ownerId={m.owner_id}
                  displayName={m.owner_display_name}
                  suffix={
                    <>
                      {m.published_at
                        ? ` · ${new Date(m.published_at).toLocaleDateString('nl-NL')}`
                        : ''}
                      {` · ${m.scene.pipes.length} buizen`}
                    </>
                  }
                />
              </p>
            }
          />
        ))}
      </ul>
    </main>
  )
}
