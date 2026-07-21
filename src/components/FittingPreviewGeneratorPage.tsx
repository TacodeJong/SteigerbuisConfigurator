/**
 * Dev-tool: rendert alle FittingType × MaterialId standaardweergaven en
 * exporteert JPEG data-URLs via window.__FITTING_PREVIEWS__ voor het seed-script.
 */
import { Suspense, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useThree } from '@react-three/fiber'
import type { FittingType, MaterialId } from '../types'
import {
  allFittingPreviewCombos,
  FITTING_PREVIEW_ASSET_VERSION,
  FITTING_PREVIEW_STANDARD_DIAMETER,
  fittingPreviewFileName,
} from '../lib/fittingPreviewAssets'
import { FittingPreviewScene } from './BomFittingThumb'

const THUMB_SIZE_PX = 128
const JPEG_QUALITY = 0.88

declare global {
  interface Window {
    __FITTING_PREVIEWS__?: Record<string, string>
    __FITTING_PREVIEWS_META__?: {
      version: string
      diameterMm: number
      count: number
      ready: boolean
      error?: string
    }
  }
}

function CaptureFrame({
  onReady,
}: {
  onReady: (dataUrl: string) => void
}) {
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    let cancelled = false
    let frame = 0
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
        onReady(gl.domElement.toDataURL('image/jpeg', JPEG_QUALITY))
      } catch {
        onReady('')
      }
    }

    const id = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [gl, invalidate, onReady])

  return null
}

async function captureOne(type: FittingType, materialId: MaterialId): Promise<string> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${THUMB_SIZE_PX}px;height:${THUMB_SIZE_PX}px;pointer-events:none;opacity:0;`
    document.body.appendChild(host)
    const root = createRoot(host)
    let settled = false

    const finish = (url: string) => {
      if (settled) return
      settled = true
      queueMicrotask(() => {
        root.unmount()
        host.remove()
      })
      resolve(url)
    }

    const timeout = window.setTimeout(() => finish(''), 8000)

    root.render(
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
        style={{ width: THUMB_SIZE_PX, height: THUMB_SIZE_PX }}
      >
        <Suspense fallback={null}>
          <FittingPreviewScene
            type={type}
            materialId={materialId}
            diameterMm={FITTING_PREVIEW_STANDARD_DIAMETER}
          />
          <CaptureFrame
            onReady={(url) => {
              window.clearTimeout(timeout)
              finish(url)
            }}
          />
        </Suspense>
      </Canvas>,
    )
  })
}

export function FittingPreviewGeneratorPage() {
  const [progress, setProgress] = useState('Starten…')
  const [done, setDone] = useState(0)
  const total = allFittingPreviewCombos().length

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const combos = allFittingPreviewCombos()
      const out: Record<string, string> = {}
      window.__FITTING_PREVIEWS_META__ = {
        version: FITTING_PREVIEW_ASSET_VERSION,
        diameterMm: FITTING_PREVIEW_STANDARD_DIAMETER,
        count: 0,
        ready: false,
      }

      try {
        for (let i = 0; i < combos.length; i++) {
          if (cancelled) return
          const { type, materialId } = combos[i]!
          const file = fittingPreviewFileName(type, materialId)
          setProgress(`${i + 1}/${combos.length}: ${file}`)
          const dataUrl = await captureOne(type, materialId)
          if (dataUrl) out[file] = dataUrl
          setDone(i + 1)
        }

        window.__FITTING_PREVIEWS__ = out
        window.__FITTING_PREVIEWS_META__ = {
          version: FITTING_PREVIEW_ASSET_VERSION,
          diameterMm: FITTING_PREVIEW_STANDARD_DIAMETER,
          count: Object.keys(out).length,
          ready: true,
        }
        setProgress(`Klaar: ${Object.keys(out).length} previews`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        window.__FITTING_PREVIEWS_META__ = {
          version: FITTING_PREVIEW_ASSET_VERSION,
          diameterMm: FITTING_PREVIEW_STANDARD_DIAMETER,
          count: Object.keys(out).length,
          ready: false,
          error: message,
        }
        setProgress(`Fout: ${message}`)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1>Fitting preview generator</h1>
      <p>
        Versie <code>{FITTING_PREVIEW_ASSET_VERSION}</code> · Ø{' '}
        {FITTING_PREVIEW_STANDARD_DIAMETER} mm · {done}/{total}
      </p>
      <p>{progress}</p>
      <p style={{ color: '#666', fontSize: '0.9rem' }}>
        Dit scherm wordt aangestuurd door <code>npm run generate-fitting-previews</code>.
      </p>
    </main>
  )
}
