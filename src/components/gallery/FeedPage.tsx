import { useEffect, useState } from 'react'
import { listFollowingFeed } from '../../lib/social/social'
import type { CloudModel } from '../../lib/models/cloudModels'
import { useAuth } from '../../lib/auth/session'
import { navigate } from '../../lib/routing'
import { AuthModal } from '../auth/AuthModal'
import { MakerMeta } from '../MakerMeta'
import { GalleryModelCard } from './GalleryModelCard'

export function FeedPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<CloudModel[]>([])
  const [error, setError] = useState<string | null>(null)
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    if (!user) {
      setAuthOpen(true)
      return
    }
    void listFollowingFeed()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Laden mislukt'))
  }, [user])

  return (
    <main className="app-page">
      <button type="button" className="linkish" onClick={() => navigate({ name: 'app' })}>
        ← Terug
      </button>
      <h1>Volg-feed</h1>
      <p className="muted">Nieuwe publicaties van mensen die je volgt.</p>
      {!user && <p className="muted">Log in om je feed te zien.</p>}
      {error && <p className="auth-error">{error}</p>}
      {user && items.length === 0 && (
        <p className="muted">Nog geen items. Volg ontwerpers via hun publieke model.</p>
      )}
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
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} reason="Log in om de volg-feed te zien." />
    </main>
  )
}
