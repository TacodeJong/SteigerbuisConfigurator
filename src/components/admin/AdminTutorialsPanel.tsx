import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  adminDeleteTutorial,
  adminListTutorials,
  adminReplaceTutorialThumbnail,
  adminUpdateTutorial,
  adminUploadTutorial,
  tutorialThumbSrc,
  tutorialVideoSrc,
  type Tutorial,
} from '../../lib/tutorials/tutorials'
import { thumbnailBlobToFile } from '../../lib/tutorials/videoThumbnail'
import { isSupabaseConfigured } from '../../lib/auth/supabaseClient'
import { useAuth } from '../../lib/auth/session'
import { TutorialFramePicker } from './TutorialFramePicker'

export function AdminTutorialsPanel() {
  const { isLocalStub } = useAuth()
  const configured = isSupabaseConfigured()
  const fileRef = useRef<HTMLInputElement>(null)
  const thumbRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<Tutorial[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [publish, setPublish] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null)
  const [pickedFrame, setPickedFrame] = useState<Blob | null>(null)
  const [thumbFile, setThumbFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function reload() {
    if (!configured) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setItems(await adminListTutorials())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tutorials laden mislukt')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [configured])

  useEffect(() => {
    if (!file) {
      setVideoObjectUrl(null)
      setPickedFrame(null)
      return
    }
    const url = URL.createObjectURL(file)
    setVideoObjectUrl(url)
    setPickedFrame(null)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function resetUploadForm() {
    setTitle('')
    setDescription('')
    setSortOrder(0)
    setPublish(true)
    setFile(null)
    setPickedFrame(null)
    setThumbFile(null)
    if (fileRef.current) fileRef.current.value = ''
    if (thumbRef.current) thumbRef.current.value = ''
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError('Kies een videobestand (MP4 of WebM)')
      return
    }
    setUploading(true)
    setProgress(0)
    setError(null)
    setInfo(null)
    try {
      const thumbnailFile =
        thumbFile ?? (pickedFrame ? thumbnailBlobToFile(pickedFrame) : null)
      const usedCustomThumb = Boolean(thumbFile)
      await adminUploadTutorial({
        file,
        thumbnailFile,
        title,
        description,
        sort_order: sortOrder,
        is_published: publish,
        onProgress: setProgress,
      })
      resetUploadForm()
      setInfo(
        usedCustomThumb
          ? 'Video geüpload (eigen thumbnail)'
          : 'Video geüpload (thumbnail uit videoframe)',
      )
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload mislukt')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  async function togglePublished(t: Tutorial) {
    setBusyId(t.id)
    setError(null)
    try {
      await adminUpdateTutorial(t.id, { is_published: !t.is_published })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bijwerken mislukt')
    } finally {
      setBusyId(null)
    }
  }

  async function saveMeta(t: Tutorial, patch: { title: string; description: string; sort_order: number }) {
    setBusyId(t.id)
    setError(null)
    try {
      await adminUpdateTutorial(t.id, {
        title: patch.title,
        description: patch.description,
        sort_order: patch.sort_order,
      })
      await reload()
      setInfo('Opgeslagen')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt')
    } finally {
      setBusyId(null)
    }
  }

  async function saveThumbnail(t: Tutorial, fileOrBlob: File) {
    setBusyId(t.id)
    setError(null)
    setInfo(null)
    try {
      await adminReplaceTutorialThumbnail(t, fileOrBlob)
      await reload()
      setInfo('Thumbnail bijgewerkt')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thumbnail opslaan mislukt')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(t: Tutorial) {
    if (
      !window.confirm(
        `Tutorial “${t.title}” verwijderen? Dit wist ook het videobestand en de thumbnail.`,
      )
    ) {
      return
    }
    setBusyId(t.id)
    setError(null)
    setInfo(null)
    try {
      await adminDeleteTutorial(t)
      await reload()
      setInfo('Verwijderd')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verwijderen mislukt')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="admin-section">
      <h2>Tutorials</h2>
      <p className="muted">
        Upload uitlegvideo’s (MP4/WebM). Kies een frame als thumbnail met de schuifregelaar, of
        upload optioneel een eigen afbeelding (JPEG/PNG/WebP). Gepubliceerde video’s verschijnen
        onder <strong>Uitleg</strong> in de navigatie
        {isLocalStub || !configured ? ' · lokale demo (geen upload zonder Supabase)' : ''}.
      </p>

      {error && <p className="auth-error">{error}</p>}
      {info && <p className="auth-info">{info}</p>}

      {!configured ? (
        <p className="muted">Supabase is niet geconfigureerd — tutorials vereisen Storage.</p>
      ) : (
        <form className="admin-tutorial-upload" onSubmit={(e) => void handleUpload(e)}>
          <div className="admin-form-grid">
            <label>
              Titel
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={uploading}
                placeholder="Bijv. Eerste ontwerp maken"
              />
            </label>
            <label>
              Volgorde
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                disabled={uploading}
              />
            </label>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
                disabled={uploading}
              />
              Direct publiceren
            </label>
          </div>
          <label className="admin-textarea-label">
            Beschrijving (optioneel)
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={uploading}
              rows={3}
            />
          </label>
          <label className="admin-textarea-label">
            Videobestand
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/webm,.mp4,.webm"
              disabled={uploading}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setThumbFile(null)
                if (thumbRef.current) thumbRef.current.value = ''
              }}
            />
            {file && (
              <span className="muted admin-field-hint">
                {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
              </span>
            )}
          </label>
          {videoObjectUrl && !thumbFile && (
            <div className="admin-tutorial-thumb-section">
              <span className="admin-tutorial-thumb-section-title">Thumbnail uit video</span>
              <TutorialFramePicker
                videoSrc={videoObjectUrl}
                disabled={uploading}
                onFrameChange={(blob) => setPickedFrame(blob)}
              />
            </div>
          )}
          <label className="admin-textarea-label">
            Eigen thumbnail (optioneel)
            <input
              ref={thumbRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              disabled={uploading || !file}
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null
                setThumbFile(next)
                if (next) setPickedFrame(null)
              }}
            />
            <span className="muted admin-field-hint">
              {thumbFile
                ? `${thumbFile.name} · overschrijft gekozen videoframe`
                : 'Laat leeg om het gekozen videoframe te gebruiken'}
            </span>
          </label>
          <div className="admin-form-actions">
            <button type="submit" className="bom-action-btn" disabled={uploading || !file || !title.trim()}>
              {uploading ? 'Uploaden…' : 'Video uploaden'}
            </button>
            {uploading && (
              <span className="muted" role="status">
                {Math.round(progress * 100)}%
              </span>
            )}
          </div>
          {uploading && (
            <div
              className="admin-upload-progress"
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="admin-upload-progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </form>
      )}

      <h3>Bestaande tutorials</h3>
      {loading && <p className="muted">Laden…</p>}
      {!loading && items.length === 0 && <p className="muted">Nog geen tutorials.</p>}
      <ul className="admin-list admin-tutorial-list">
        {items.map((t) => (
          <TutorialAdminRow
            key={t.id}
            tutorial={t}
            busy={busyId === t.id}
            onTogglePublished={() => void togglePublished(t)}
            onSave={(patch) => void saveMeta(t, patch)}
            onSaveThumbnail={(f) => void saveThumbnail(t, f)}
            onDelete={() => void remove(t)}
          />
        ))}
      </ul>
    </section>
  )
}

function TutorialAdminRow({
  tutorial,
  busy,
  onTogglePublished,
  onSave,
  onSaveThumbnail,
  onDelete,
}: {
  tutorial: Tutorial
  busy: boolean
  onTogglePublished: () => void
  onSave: (patch: { title: string; description: string; sort_order: number }) => void
  onSaveThumbnail: (file: File) => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(tutorial.title)
  const [description, setDescription] = useState(tutorial.description ?? '')
  const [sortOrder, setSortOrder] = useState(tutorial.sort_order)
  const [editThumb, setEditThumb] = useState(false)
  const [editFrame, setEditFrame] = useState<Blob | null>(null)
  const editThumbRef = useRef<HTMLInputElement>(null)
  const [overrideThumb, setOverrideThumb] = useState<File | null>(null)
  const thumb = tutorialThumbSrc(tutorial)
  const videoSrc = tutorialVideoSrc(tutorial)

  useEffect(() => {
    setTitle(tutorial.title)
    setDescription(tutorial.description ?? '')
    setSortOrder(tutorial.sort_order)
    setEditThumb(false)
    setEditFrame(null)
    setOverrideThumb(null)
    if (editThumbRef.current) editThumbRef.current.value = ''
  }, [tutorial])

  return (
    <li className="admin-list-item admin-tutorial-item">
      <div className="admin-tutorial-item-main">
        {thumb ? (
          <img className="admin-tutorial-thumb" src={thumb} alt="" />
        ) : videoSrc ? (
          <video className="admin-tutorial-thumb" src={videoSrc} muted playsInline preload="metadata" />
        ) : (
          <div className="admin-tutorial-thumb admin-tutorial-thumb--empty" aria-hidden />
        )}
        <div className="admin-tutorial-fields">
          <label>
            Titel
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Volgorde
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              disabled={busy}
            />
          </label>
          <label className="admin-textarea-label">
            Beschrijving
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={busy}
              rows={2}
            />
          </label>
          <p className="muted admin-field-hint">
            {tutorial.is_published ? 'Gepubliceerd' : 'Concept'} · {tutorial.mime_type || 'video'} ·{' '}
            {new Date(tutorial.updated_at).toLocaleString('nl-NL')}
          </p>
        </div>
      </div>

      {editThumb && videoSrc && (
        <div className="admin-tutorial-thumb-section">
          <span className="admin-tutorial-thumb-section-title">Thumbnail wijzigen</span>
          {!overrideThumb && (
            <TutorialFramePicker
              videoSrc={videoSrc}
              crossOrigin
              disabled={busy}
              onFrameChange={(blob) => setEditFrame(blob)}
            />
          )}
          <label className="admin-textarea-label">
            Eigen afbeelding (optioneel)
            <input
              ref={editThumbRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              disabled={busy}
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null
                setOverrideThumb(next)
                if (next) setEditFrame(null)
              }}
            />
            <span className="muted admin-field-hint">
              {overrideThumb
                ? `${overrideThumb.name} · overschrijft videoframe`
                : 'Laat leeg om het gekozen videoframe op te slaan'}
            </span>
          </label>
          <div className="admin-form-actions">
            <button
              type="button"
              className="bom-action-btn"
              disabled={busy || (!overrideThumb && !editFrame)}
              onClick={() => {
                if (overrideThumb) {
                  onSaveThumbnail(overrideThumb)
                  return
                }
                if (editFrame) onSaveThumbnail(thumbnailBlobToFile(editFrame))
              }}
            >
              Thumbnail opslaan
            </button>
            <button
              type="button"
              className="bom-action-btn secondary"
              disabled={busy}
              onClick={() => {
                setEditThumb(false)
                setEditFrame(null)
                setOverrideThumb(null)
                if (editThumbRef.current) editThumbRef.current.value = ''
              }}
            >
              Annuleren
            </button>
          </div>
        </div>
      )}

      <div className="admin-tutorial-item-actions">
        <button
          type="button"
          className="bom-action-btn secondary"
          disabled={busy}
          onClick={() => onSave({ title, description, sort_order: sortOrder })}
        >
          Opslaan
        </button>
        <button
          type="button"
          className="bom-action-btn secondary"
          disabled={busy || !videoSrc}
          onClick={() => setEditThumb((v) => !v)}
        >
          {editThumb ? 'Thumbnail verbergen' : 'Thumbnail wijzigen'}
        </button>
        <button type="button" className="bom-action-btn secondary" disabled={busy} onClick={onTogglePublished}>
          {tutorial.is_published ? 'Depubliceren' : 'Publiceren'}
        </button>
        <button type="button" className="bom-action-btn secondary" disabled={busy} onClick={onDelete}>
          Verwijderen
        </button>
      </div>
    </li>
  )
}
