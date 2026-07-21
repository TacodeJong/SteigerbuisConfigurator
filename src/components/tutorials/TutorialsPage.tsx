import { useEffect, useState } from 'react'
import {
  listPublishedTutorials,
  tutorialThumbSrc,
  tutorialVideoSrc,
  type Tutorial,
} from '../../lib/tutorials/tutorials'
import { navigate } from '../../lib/routing'
import { isSupabaseConfigured } from '../../lib/auth/supabaseClient'

export function TutorialsPage() {
  const [items, setItems] = useState<Tutorial[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const configured = isSupabaseConfigured()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        if (!configured) {
          if (!cancelled) setItems([])
          return
        }
        const list = await listPublishedTutorials()
        if (!cancelled) setItems(list)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Uitleg laden mislukt')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [configured])

  return (
    <main className="app-page tutorials-page">
      <button type="button" className="linkish" onClick={() => navigate({ name: 'app' })}>
        ← Terug naar ontwerpen
      </button>
      <h1>Uitleg</h1>
      <p className="muted">Korte video’s over werken met de Steigerbuis Configurator.</p>
      {loading && <p>Laden…</p>}
      {error && <p className="auth-error">{error}</p>}
      {!configured && !loading && (
        <p className="muted">Tutorials zijn beschikbaar zodra Supabase is geconfigureerd.</p>
      )}
      {!loading && configured && items.length === 0 && !error && (
        <p className="muted">Nog geen uitlegvideo’s gepubliceerd.</p>
      )}
      <ul className="tutorials-grid">
        {items.map((t) => {
          const src = tutorialVideoSrc(t)
          const poster = tutorialThumbSrc(t) || undefined
          return (
            <li key={t.id} className="tutorial-card">
              {src ? (
                <video
                  className="tutorial-video"
                  src={src}
                  poster={poster}
                  controls
                  playsInline
                  preload="metadata"
                  title={t.title}
                >
                  Je browser ondersteunt geen HTML5-video.
                </video>
              ) : (
                <div className="tutorial-video tutorial-video--missing muted">Video niet beschikbaar</div>
              )}
              <div className="tutorial-card-body">
                <h2>{t.title}</h2>
                {t.description && <p className="muted">{t.description}</p>}
              </div>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
