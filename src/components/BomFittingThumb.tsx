import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { FittingType, MaterialId, PipeDiameter } from '../types'
import { FITTINGS } from '../data/catalog'
import { FITTING_TYPE_LABELS } from '../lib/fittings'
import { buildFittingPreview } from '../lib/fittingPreviewModel'
import { fittingProductUrl } from '../lib/suppliers/productMap'
import { FittingMesh } from './three/FittingMesh'
import { AccessoryMesh } from './three/AccessoryMesh'

const THUMB_CACHE_VERSION = 'fitting-bom-v1'
const previewCache = new Map<string, string>()

/** Max gelijktijdige WebGL-thumbs in de stuklijst (capture-once, daarna JPEG). */
const MAX_ACTIVE_RENDERERS = 1
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
    const maxFrames = 6

    const tick = () => {
      if (cancelled) return
      invalidate()
      frame += 1
      if (frame < maxFrames) {
        requestAnimationFrame(tick)
        return
      }
      try {
        const url = gl.domElement.toDataURL('image/jpeg', 0.9)
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

function FittingPreviewScene({
  type,
  materialId,
  diameterMm,
}: {
  type: FittingType
  materialId: MaterialId
  diameterMm: number
}) {
  const content = useMemo(() => buildFittingPreview(type, diameterMm), [type, diameterMm])
  const hide = content.kind === 'accessories' ? new Set(content.hideSleeveIds ?? []) : null

  return (
    <>
      <color attach="background" args={['#e8edf2']} />
      <ambientLight intensity={0.95} color="#ffffff" />
      <directionalLight position={[3, 5, 4]} intensity={1.25} color="#ffffff" />
      <directionalLight position={[-4, 2, -2]} intensity={0.5} color="#dbe4f0" />
      {content.kind === 'fitting' ? (
        <FittingMesh fitting={content.fitting} materialId={materialId} pickable={false} />
      ) : (
        content.accessories.map((acc) => (
          <AccessoryMesh
            key={acc.id}
            accessory={acc}
            materialId={materialId}
            pickable={false}
            hideSleeve={hide?.has(acc.id)}
          />
        ))
      )}
    </>
  )
}

interface BomFittingThumbProps {
  type: FittingType
  materialId: MaterialId
  diameter: PipeDiameter
}

/**
 * Compacte 3D-herkenning per koppeling in de stuklijst.
 * Inline: lazy WebGL → één JPEG-capture → cache (max 1 gelijktijdige renderer).
 * Klik: gedeelde detail-popover met orbit (één live Canvas).
 */
export function BomFittingThumb({ type, materialId, diameter }: BomFittingThumbProps) {
  const cacheKey = `${THUMB_CACHE_VERSION}:${type}:${materialId}:${diameter}`
  const wrapRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [src, setSrc] = useState<string | null>(() => previewCache.get(cacheKey) ?? null)
  const [visible, setVisible] = useState(false)
  const [hasSlot, setHasSlot] = useState(false)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)

  const catalog = FITTINGS.find((f) => f.type === type)
  const label = FITTING_TYPE_LABELS[type] ?? catalog?.name ?? type
  const shopUrl = fittingProductUrl(type, materialId, diameter)

  useEffect(() => {
    const cached = previewCache.get(cacheKey)
    if (cached) {
      setSrc(cached)
      setFailed(false)
    } else {
      setSrc(null)
    }
  }, [cacheKey])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '80px', threshold: 0.01 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (src || failed || !visible) return

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
  }, [src, failed, visible])

  const onReady = useCallback((url: string) => {
    if (!url) {
      setFailed(true)
      setHasSlot(false)
      return
    }
    setSrc(url)
    setHasSlot(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (dialogRef.current?.contains(t) || wrapRef.current?.contains(t)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const shouldRender = !src && !failed && visible && hasSlot

  const stopRow = (e: ReactMouseEvent) => {
    e.stopPropagation()
  }

  const popover =
    open &&
    createPortal(
      <div className="bom-fitting-popover-root" role="presentation">
        <div
          ref={dialogRef}
          className="bom-fitting-popover"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="bom-fitting-popover-head">
            <div>
              <h3 id={titleId}>{label}</h3>
              <p className="bom-fitting-type-code">
                Typecode: <code>{type}</code>
              </p>
            </div>
            <button
              type="button"
              className="bom-fitting-popover-close"
              aria-label="Sluiten"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
          {catalog?.description && <p className="bom-fitting-desc">{catalog.description}</p>}
          <div className="bom-fitting-popover-canvas">
            <Canvas
              dpr={[1, 1.5]}
              shadows={false}
              camera={{ position: [0.14, 0.11, 0.16], fov: 40, near: 0.01, far: 10 }}
              gl={{ antialias: true, powerPreference: 'low-power', alpha: false }}
              style={{ width: '100%', height: '100%' }}
              onCreated={({ gl }) => {
                gl.setClearColor('#e8edf2')
              }}
            >
              <Suspense fallback={null}>
                <FittingPreviewScene type={type} materialId={materialId} diameterMm={diameter} />
                <OrbitControls
                  makeDefault
                  enablePan={false}
                  minDistance={0.08}
                  maxDistance={0.35}
                  target={[0, 0, 0]}
                />
              </Suspense>
            </Canvas>
          </div>
          <p className="bom-fitting-popover-hint">Sleep om te draaien — herken de vorm voor je bestelt.</p>
          {shopUrl && (
            <a
              className="bom-fitting-shop-link"
              href={shopUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={stopRow}
            >
              Bekijk in webshop
            </a>
          )}
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      <button
        ref={wrapRef}
        type="button"
        className="bom-fitting-thumb"
        aria-label={`3D-voorbeeld ${label}`}
        title={`${label} — tik voor grotere 3D-weergave`}
        onClick={(e) => {
          stopRow(e)
          setOpen((v) => !v)
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {src ? (
          <img src={src} alt="" className="bom-fitting-thumb-img" draggable={false} />
        ) : failed ? (
          <span className="bom-fitting-thumb-fallback" aria-hidden>
            3D
          </span>
        ) : shouldRender ? (
          <Canvas
            frameloop="demand"
            dpr={1}
            shadows={false}
            camera={{ position: [0.12, 0.09, 0.14], fov: 38, near: 0.01, far: 10 }}
            gl={{
              antialias: true,
              preserveDrawingBuffer: true,
              powerPreference: 'low-power',
              alpha: false,
            }}
            style={{ width: '100%', height: '100%' }}
          >
            <Suspense fallback={null}>
              <FittingPreviewScene type={type} materialId={materialId} diameterMm={diameter} />
              <CaptureOnce cacheKey={cacheKey} onReady={onReady} />
            </Suspense>
          </Canvas>
        ) : (
          <span className="bom-fitting-thumb-fallback bom-fitting-thumb-loading" aria-hidden>
            …
          </span>
        )}
      </button>
      {popover}
    </>
  )
}
