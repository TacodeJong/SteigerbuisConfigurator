import { useEffect, useId, useRef, useState } from 'react'
import {
  captureFrameFromVideoElement,
  seekVideoElement,
} from '../../lib/tutorials/videoThumbnail'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export interface TutorialFramePickerProps {
  /** Object URL or remote video URL. */
  videoSrc: string
  /** Prefer crossOrigin for remote URLs (canvas capture). */
  crossOrigin?: boolean
  disabled?: boolean
  /** Initial scrub position in seconds (default 1). */
  initialSeek?: number
  /** Called when the user confirms a frame (or default frame is ready). */
  onFrameChange: (blob: Blob, seekSeconds: number) => void
}

/**
 * Scrub a video and pick a JPEG frame for the tutorial thumbnail.
 */
export function TutorialFramePicker({
  videoSrc,
  crossOrigin = false,
  disabled = false,
  initialSeek = 1,
  onFrameChange,
}: TutorialFramePickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const sliderId = useId()
  const [duration, setDuration] = useState(0)
  const [seek, setSeek] = useState(initialSeek)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const previewUrlRef = useRef<string | null>(null)
  const onFrameChangeRef = useRef(onFrameChange)
  onFrameChangeRef.current = onFrameChange

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  useEffect(() => {
    setReady(false)
    setDuration(0)
    setSeek(initialSeek)
    setError(null)
    setBusy(false)
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
      setPreviewUrl(null)
    }
  }, [videoSrc, initialSeek])

  async function captureAt(seconds: number, announce: boolean) {
    const video = videoRef.current
    if (!video || !ready) return
    setBusy(true)
    setError(null)
    try {
      await seekVideoElement(video, seconds)
      const blob = await captureFrameFromVideoElement(video)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      const url = URL.createObjectURL(blob)
      previewUrlRef.current = url
      setPreviewUrl(url)
      if (announce) onFrameChangeRef.current(blob, seconds)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Frame vastleggen mislukt')
    } finally {
      setBusy(false)
    }
  }

  function handleLoadedMetadata() {
    const video = videoRef.current
    if (!video) return
    const d = Number.isFinite(video.duration) ? video.duration : 0
    setDuration(d)
    setReady(true)
    const target = d > 0 ? Math.min(initialSeek, Math.max(0, d - 0.05)) : 0
    setSeek(target)
    void (async () => {
      setBusy(true)
      setError(null)
      try {
        await seekVideoElement(video, target)
        const blob = await captureFrameFromVideoElement(video)
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
        const url = URL.createObjectURL(blob)
        previewUrlRef.current = url
        setPreviewUrl(url)
        onFrameChangeRef.current(blob, target)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Frame vastleggen mislukt')
      } finally {
        setBusy(false)
      }
    })()
  }

  const maxSeek = duration > 0 ? Math.max(0, duration - 0.05) : 0

  return (
    <div className="admin-tutorial-frame-picker">
      <div className="admin-tutorial-frame-picker-media">
        <video
          ref={videoRef}
          className="admin-tutorial-frame-video"
          src={videoSrc}
          muted
          playsInline
          preload="metadata"
          crossOrigin={crossOrigin ? 'anonymous' : undefined}
          onLoadedMetadata={handleLoadedMetadata}
        />
        {previewUrl ? (
          <img className="admin-tutorial-thumb" src={previewUrl} alt="Gekozen thumbnail-frame" />
        ) : (
          <div className="admin-tutorial-thumb admin-tutorial-thumb--empty" aria-hidden />
        )}
      </div>
      <label className="admin-tutorial-frame-slider-label" htmlFor={sliderId}>
        Frame kiezen ({formatTime(seek)}
        {duration > 0 ? ` / ${formatTime(duration)}` : ''})
        <input
          id={sliderId}
          type="range"
          min={0}
          max={maxSeek || 0}
          step={0.05}
          value={Math.min(seek, maxSeek || 0)}
          disabled={disabled || busy || !ready || maxSeek <= 0}
          onChange={(e) => {
            const next = Number(e.target.value)
            setSeek(next)
            const video = videoRef.current
            if (video) {
              try {
                video.currentTime = next
              } catch {
                /* ignore */
              }
            }
          }}
          onPointerUp={(e) => {
            const next = Number((e.target as HTMLInputElement).value)
            setSeek(next)
            void captureAt(next, true)
          }}
          onKeyUp={(e) => {
            const next = Number((e.target as HTMLInputElement).value)
            setSeek(next)
            void captureAt(next, true)
          }}
        />
      </label>
      <div className="admin-form-actions">
        <button
          type="button"
          className="bom-action-btn secondary"
          disabled={disabled || busy || !ready}
          onClick={() => void captureAt(seek, true)}
        >
          {busy ? 'Frame laden…' : 'Gebruik dit frame'}
        </button>
      </div>
      <span className="muted admin-field-hint">
        Sleep de schuifregelaar om een frame te kiezen. Standaard rond 1 seconde.
      </span>
      {error && <p className="auth-error">{error}</p>}
    </div>
  )
}
