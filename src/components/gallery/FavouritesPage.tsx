import { useEffect, useState } from 'react'
import { listFavourites } from '../../lib/social/social'
import type { CloudModel } from '../../lib/models/cloudModels'
import { useAuth } from '../../lib/auth/session'
import { navigate } from '../../lib/routing'
import { AuthModal } from '../auth/AuthModal'
import { MakerMeta } from '../MakerMeta'
import { GalleryModelCard } from './GalleryModelCard'

export function FavouritesPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<CloudModel[]>([])
  const [error, setError] = useState<string | null>(null)
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    if (!user) {
      setAuthOpen(true)
      return
    }
    void listFavourites()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Laden mislukt'))
  }, [user])

  return (
    <main className="app-page">
      <button type="button" className="linkish" onClick={() => navigate({ name: 'app' })}>
        ← Terug
      </button>
      <h1>Favorieten</h1>
      {!user && <p className="muted">Log in om je favorieten te zien.</p>}
      {error && <p className="auth-error">{error}</p>}
      {user && items.length === 0 && <p className="muted">Nog geen favorieten.</p>}
      <ul className="gallery-list">
        {items.map((m) => (
          <GalleryModelCard
            key={m.id}
            model={m}
            meta={
              <p className="muted">
                <MakerMeta ownerId={m.owner_id} displayName={m.owner_display_name} />
              </p>
            }
          />
        ))}
      </ul>
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        reason="Log in om favorieten te beheren."
      />
    </main>
  )
}
