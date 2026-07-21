import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { KlimrekConfig, SceneModel } from '../../types'
import { KlimrekScene } from '../three/KlimrekScene'

/** Bump bij thumb-styling/camera-wijzigingen zodat oude JPEG-cache vernieuwt. */
const THUMB_CACHE_VERSION = 'studio-v2'
const previewCache = new Map<string, string>()

/** Max gelijktijdige WebGL-thumbnails — daarna wachten tot een slot vrij is. */
const MAX_ACTIVE_RENDERERS = 2
let activeRenderers = 0
const waitQueue: Array<() => void> = []

function acquireSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const grant = () => {
      activeRenderers += 1
      let released = false
      resolve(() => {
        if (released) return
        released = true
        activeRenderers -= 1
        waitQueue.shift()?.()
      })
    }
    if (activeRenderers < MAX_ACTIVE_RENDERERS) grant()
    else waitQueue.push(grant)
  })
}

function CaptureOnce({
  cacheKey,
  onReady,
}: {
  cacheKey: string
  onReady: (dataUrl: string) => void
}) {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    let cancelled = false
    let frame = 0
    // Iets meer frames zodat FrameCameraToBounds + belichting stabiel zijn
    const maxFrames = 8

    const tick = () => {
      if (cancelled) return
      invalidate()
      frame += 1
      if (frame < maxFrames) {
        requestAnimationFrame(tick)
        return
      }
      try {
        const url = gl.domElement.toDataURL('image/jpeg', 0.88)
        previewCache.set(cacheKey, url)
        onReady(url)
      } catch {
        onReady('')
      }
    }

    const id = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [cacheKey, gl, invalidate, onReady])

  return null
}

interface GalleryThumb3DProps {
  modelId: string
  updatedAt?: string | null
  scene: SceneModel
  config?: KlimrekConfig
}

/**
 * Lazy 3D-thumbnail: mount Canvas alleen in viewport + met een vrije WebGL-slot,
 * capture één JPEG, unmount Canvas. Daarna: cached image.
 * Studio-variant: neutraal grijs i.p.v. gras voor beter contrast.
 */
export function GalleryThumb3D({ modelId, updatedAt, scene, config }: GalleryThumb3DProps) {
  const cacheKey = `${THUMB_CACHE_VERSION}:${modelId}:${updatedAt ?? ''}`
  const wrapRef = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string | null>(() => previewCache.get(cacheKey) ?? null)
  const [visible, setVisible] = useState(false)
  const [hasSlot, setHasSlot] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const cached = previewCache.get(cacheKey)
    if (cached) setSrc(cached)
  }, [cacheKey])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '160px', threshold: 0.01 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (src || failed || !visible || scene.pipes.length === 0) return

    let cancelled = false
    let release: (() => void) | null = null

    void acquireSlot().then((r) => {
      if (cancelled) {
        r()
        return
      }
      release = r
      setHasSlot(true)
    })

    return () => {
      cancelled = true
      setHasSlot(false)
      release?.()
    }
  }, [src, failed, visible, scene.pipes.length])

  const onReady = useCallback((url: string) => {
    if (!url) {
      setFailed(true)
      setHasSlot(false)
      return
    }
    setSrc(url)
    setHasSlot(false)
  }, [])

  const shouldRender = !src && !failed && visible && hasSlot
  const empty = scene.pipes.length === 0

  return (
    <div className="gallery-thumb gallery-thumb--studio" ref={wrapRef} aria-hidden>
      {src ? (
        <img src={src} alt="" className="gallery-thumb-img" draggable={false} />
      ) : empty || failed ? (
        <div className="gallery-thumb-placeholder">
          <span>{empty ? 'Leeg model' : 'Geen preview'}</span>
        </div>
      ) : shouldRender ? (
        <Canvas
          frameloop="demand"
          dpr={[1, 1.5]}
          shadows={false}
          camera={{ position: [2.4, 2, 3.2], fov: 36, near: 0.1, far: 100 }}
          gl={{
            antialias: true,
            preserveDrawingBuffer: true,
            powerPreference: 'low-power',
            alpha: false,
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <Suspense fallback={null}>
            <KlimrekScene
              scene={scene}
              config={config}
              selectedId={null}
              interactive={false}
              onSelect={() => {}}
              compact
              studioThumb
              showContactShadows={false}
            />
            <CaptureOnce cacheKey={cacheKey} onReady={onReady} />
          </Suspense>
        </Canvas>
      ) : (
        <div className="gallery-thumb-placeholder gallery-thumb-loading">
          <span>Preview…</span>
        </div>
      )}
    </div>
  )
}
