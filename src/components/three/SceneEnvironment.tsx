import { useEffect, useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import type { KlimrekEnvironment } from '../../types'
import { GrassGround, SKY_BACKGROUND } from './GrassGround'

const INDOOR_BACKGROUND = '#e9e2d6'
const WALL_COLOR = '#efe9de'
const WALL_HEIGHT = 3.2

/** Procedurele houten-vloertextuur (planken met lichte kleurvariatie en nerf). */
function createWoodFloorTexture(): CanvasTexture {
  const size = 512
  const rows = 8
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const plankColors = ['#c8a878', '#bd9c6c', '#d2b184', '#c2a172', '#cba97a']
  const rowH = size / rows

  for (let row = 0; row < rows; row++) {
    // Plankdelen met verspringende naden per rij
    let x = -Math.random() * 120
    while (x < size) {
      const w = 140 + Math.random() * 160
      ctx.fillStyle = plankColors[Math.floor(Math.random() * plankColors.length)]
      ctx.fillRect(x, row * rowH, w, rowH)

      // Subtiele houtnerf
      for (let i = 0; i < 6; i++) {
        const gy = row * rowH + Math.random() * rowH
        ctx.strokeStyle = `rgba(90, 62, 35, ${0.05 + Math.random() * 0.08})`
        ctx.lineWidth = 0.5 + Math.random()
        ctx.beginPath()
        ctx.moveTo(x + 2, gy)
        ctx.bezierCurveTo(
          x + w * 0.3,
          gy + (Math.random() - 0.5) * 4,
          x + w * 0.7,
          gy + (Math.random() - 0.5) * 4,
          x + w - 2,
          gy,
        )
        ctx.stroke()
      }

      // Kopse naad
      ctx.fillStyle = 'rgba(70, 48, 26, 0.35)'
      ctx.fillRect(x + w - 1, row * rowH, 1.5, rowH)
      x += w
    }

    // Langsnaad tussen de rijen
    ctx.fillStyle = 'rgba(70, 48, 26, 0.4)'
    ctx.fillRect(0, row * rowH, size, 1.5)
  }

  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  return texture
}

interface IndoorFloorProps {
  size: number
  onClick?: (event: ThreeEvent<MouseEvent>) => void
}

function IndoorFloor({ size, onClick }: IndoorFloorProps) {
  const texture = useMemo(() => createWoodFloorTexture(), [])

  useEffect(() => () => texture.dispose(), [texture])

  // Eén textuurtegel ≈ 2,4 m zodat de planken op ware grootte ogen (~30 cm breed).
  const repeat = Math.max(1, Math.round(size / 2.4))
  texture.repeat.set(repeat, repeat)

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.005, 0]}
      receiveShadow
      onClick={onClick}
    >
      <planeGeometry args={[size, size, 1, 1]} />
      <meshStandardMaterial map={texture} roughness={0.6} metalness={0} envMapIntensity={0.5} />
    </mesh>
  )
}

/**
 * Vier enkelzijdige wanden aan de rand van de vloer, naar binnen gericht.
 * Van buitenaf zijn ze onzichtbaar (backface culling), dus de camera wordt
 * nooit geblokkeerd — je kijkt er gewoon doorheen de kamer in.
 */
function IndoorWalls({ size }: { size: number }) {
  const half = size / 2
  const walls: { position: [number, number, number]; rotationY: number }[] = [
    { position: [0, WALL_HEIGHT / 2, -half], rotationY: 0 },
    { position: [0, WALL_HEIGHT / 2, half], rotationY: Math.PI },
    { position: [-half, WALL_HEIGHT / 2, 0], rotationY: Math.PI / 2 },
    { position: [half, WALL_HEIGHT / 2, 0], rotationY: -Math.PI / 2 },
  ]
  return (
    <group>
      {walls.map((w, i) => (
        <mesh key={i} position={w.position} rotation={[0, w.rotationY, 0]}>
          <planeGeometry args={[size, WALL_HEIGHT, 1, 1]} />
          <meshStandardMaterial color={WALL_COLOR} roughness={0.95} metalness={0} />
        </mesh>
      ))}
      {/* Plint langs de wanden voor wat extra kamer-gevoel */}
      {walls.map((w, i) => (
        <mesh key={`plint-${i}`} position={[w.position[0], 0.04, w.position[2]]} rotation={[0, w.rotationY, 0]}>
          <planeGeometry args={[size, 0.08, 1, 1]} />
          <meshStandardMaterial color="#d8d0c2" roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}

/** Neutrale studio-vloer/lucht voor galerij-thumbnails (hoog contrast t.o.v. buizen). */
const STUDIO_BACKGROUND = '#e8edf2'
const STUDIO_FLOOR = '#c5ced8'

interface SceneEnvironmentProps {
  environment: KlimrekEnvironment
  size?: number
  onClick?: (event: ThreeEvent<MouseEvent>) => void
  /**
   * Galerij-thumbnail: vlakke studio i.p.v. gras/kamer —
   * beter contrast, minder “klein in het landschap”.
   */
  studio?: boolean
}

/**
 * Achtergrond, belichting en grond voor de 3D-scène, afhankelijk van de
 * omgeving: buiten (gras, lucht, zonlicht) of binnen (houten vloer, wanden,
 * warme binnenverlichting).
 *
 * Let op: de lichten staan bewust in één vaste boomstructuur (met wisselende
 * props) in plaats van twee aparte JSX-takken, zodat ze bij het wisselen van
 * omgeving nooit ontkoppeld/opnieuw opgebouwd worden — anders kan de scène na
 * een switch zonder belichting (zwart) achterblijven.
 */
export function SceneEnvironment({
  environment,
  size = 50,
  onClick,
  studio = false,
}: SceneEnvironmentProps) {
  const indoor = environment === 'binnen'

  if (studio) {
    return (
      <>
        <color attach="background" args={[STUDIO_BACKGROUND]} />
        <ambientLight intensity={0.95} color="#ffffff" />
        <directionalLight position={[4, 9, 5]} intensity={1.35} color="#ffffff" />
        <directionalLight position={[-5, 4, -2]} intensity={0.55} color="#dbe4f0" />
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.005, 0]}
          receiveShadow
          onClick={onClick}
        >
          <planeGeometry args={[size, size, 1, 1]} />
          <meshStandardMaterial color={STUDIO_FLOOR} roughness={0.92} metalness={0} />
        </mesh>
      </>
    )
  }

  return (
    <>
      <color attach="background" args={[indoor ? INDOOR_BACKGROUND : SKY_BACKGROUND]} />
      <ambientLight intensity={indoor ? 0.75 : 0.65} color={indoor ? '#fff1e0' : '#ffffff'} />
      <directionalLight
        position={indoor ? [3, 6, 2] : [5, 8, 4]}
        intensity={indoor ? 0.9 : 1.1}
        color={indoor ? '#fff6ea' : '#ffffff'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0002}
      />
      <directionalLight
        position={indoor ? [-4, 4, -3] : [-4, 3, -3]}
        intensity={0.35}
        color={indoor ? '#e9edf5' : '#ffffff'}
      />
      {indoor ? (
        <IndoorFloor size={size} onClick={onClick} />
      ) : (
        <GrassGround size={size} onClick={onClick} />
      )}
      {indoor && <IndoorWalls size={size} />}
    </>
  )
}
