import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { registerViewportCapture } from '../../lib/viewportCapture'

/**
 * Registreert de actieve R3F-canvas zodat Stuklijst een JPEG kan maken
 * van de huidige camerastand (met omgeving, geen studio-thumb).
 */
export function ViewportCaptureBridge() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    return registerViewportCapture(() => {
      gl.render(scene, camera)
      return gl.domElement.toDataURL('image/jpeg', 0.92)
    })
  }, [gl, scene, camera])

  return null
}
