import { lazy, Suspense, useEffect, useState } from 'react'
import { MATERIALS } from '../../data/catalog'
import { forkModel, getCloudModel, type CloudModel } from '../../lib/models/cloudModels'
import { ApiError } from '../../lib/apiErrors'
import { useAuth } from '../../lib/auth/session'
import { navigate, modelShareUrl } from '../../lib/routing'
import {
  isFavourite,
  setFavourite,
  isFollowing,
  setFollow,
} from '../../lib/social/social'
import { AuthModal } from '../auth/AuthModal'
import { MakerMeta } from '../MakerMeta'

/** Lazy: WebGL/R3F alleen laden op de model-detailroute; unmount bij sluiten. */
const FramePreview3D = lazy(() =>
  import('../FramePreview3D').then((m) => ({ default: m.FramePreview3D })),
)

interface PublicModelPageProps {
  modelId: string
  onForkLoaded?: (model: CloudModel) => void
}

function formatModelDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function PublicModelPage({ modelId, onForkLoaded }: PublicModelPageProps) {
  const { user, isPaid } = useAuth()
  const [model, setModel] = useState<CloudModel | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fav, setFav] = useState(false)
  const [following, setFollowing] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authReason, setAuthReason] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const m = await getCloudModel(modelId)
        if (!cancelled) {
          setModel(m)
          if (!m) setError('Model niet gevonden of niet openbaar.')
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Laden mislukt')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [modelId])

  useEffect(() => {
    if (!user || !model) return
    void isFavourite(model.id).then(setFav)
    void isFollowing(model.owner_id).then(setFollowing)
  }, [user, model])

  const handleFork = async () => {
    if (!user) {
      setAuthReason('Log in en neem een maandabonnement om dit model voor jezelf te bewerken.')
      setAuthOpen(true)
      return
    }
    if (!isPaid) {
      navigate({ name: 'upgrade' })
      return
    }
    setBusy(true)
    setError(null)
    try {
      const fork = await forkModel(modelId)
      onForkLoaded?.(fork)
      navigate({ name: 'app' })
    } catch (e) {
      if (e instanceof ApiError && e.code === 'paid_required') navigate({ name: 'upgrade' })
      else setError(e instanceof Error ? e.message : 'Overnemen mislukt')
    } finally {
      setBusy(false)
    }
  }

  const toggleFav = async () => {
    if (!user) {
      setAuthReason('Maak een account om favorieten te bewaren.')
      setAuthOpen(true)
      return
    }
    const next = !fav
    await setFavourite(modelId, next)
    setFav(next)
  }

  const toggleFollow = async () => {
    if (!model) return
    if (!user) {
      setAuthReason('Maak een account om ontwerpers te volgen.')
      setAuthOpen(true)
      return
    }
    if (user.id === model.owner_id) return
    const next = !following
    await setFollow(model.owner_id, next)
    setFollowing(next)
  }

  if (loading) {
    return (
      <main className="app-page public-model-page">
        <p>Laden…</p>
      </main>
    )
  }

  if (!model) {
    return (
      <main className="app-page public-model-page">
        <button type="button" className="linkish" onClick={() => navigate({ name: 'gallery' })}>
          ← Galerij
        </button>
        <p className="auth-error">{error ?? 'Niet gevonden'}</p>
      </main>
    )
  }

  const materialId = model.scene.materialId ?? model.config.materialId
  const materialName = MATERIALS.find((m) => m.id === materialId)?.name
  const publishedLabel = formatModelDate(model.published_at ?? model.created_at)
  const metaBits = [
    publishedLabel,
    materialName,
    model.config.diameter ? `Ø ${model.config.diameter} mm` : null,
  ].filter(Boolean)

  return (
    <main className="app-page public-model-page">
      <div className="public-model-layout">
        <div className="preview-panel preview-panel-fill public-model-viewport">
          <Suspense fallback={<div className="canvas-loader">3D laden…</div>}>
            <FramePreview3D
              scene={model.scene}
              config={model.config}
              footprintLabels="scene"
            />
          </Suspense>
        </div>

        <aside className="public-model-info">
          <button type="button" className="linkish public-model-back" onClick={() => navigate({ name: 'gallery' })}>
            ← Galerij
          </button>
          <h1>{model.name}</h1>
          <p className="muted public-model-meta">
            door{' '}
            <MakerMeta
              ownerId={model.owner_id}
              displayName={model.owner_display_name}
              size={24}
              suffix={model.attribution_name ? ` · Gebaseerd op ${model.attribution_name}` : null}
            />
          </p>
          {metaBits.length > 0 && (
            <p className="muted public-model-meta-bits">{metaBits.join(' · ')}</p>
          )}
          {error && <p className="auth-error">{error}</p>}
          <div className="public-model-actions">
            <button type="button" className="bom-action-btn secondary" onClick={() => void toggleFav()}>
              {fav ? '★ Favoriet' : '☆ Favoriet'}
            </button>
            {user?.id !== model.owner_id && (
              <button type="button" className="bom-action-btn secondary" onClick={() => void toggleFollow()}>
                {following ? 'Volgend' : 'Volgen'}
              </button>
            )}
            <button
              type="button"
              className="bom-action-btn secondary"
              onClick={() => void navigator.clipboard.writeText(modelShareUrl(model.id))}
            >
              Deel-link
            </button>
            <button type="button" className="bom-action-btn" disabled={busy} onClick={() => void handleFork()}>
              {busy ? 'Bezig…' : 'Bewerken voor jezelf'}
            </button>
          </div>
          <p className="muted public-model-fork-hint">Je krijgt een eigen kopie om aan te passen.</p>
        </aside>
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} reason={authReason} />
    </main>
  )
}
