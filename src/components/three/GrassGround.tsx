import { useEffect, useMemo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

function createGrassTexture(): CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const base = ctx.createLinearGradient(0, 0, size, size)
  base.addColorStop(0, '#3d6b3a')
  base.addColorStop(0.5, '#4a7c47')
  base.addColorStop(1, '#3f7043')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 600; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 6 + Math.random() * 22
    const light = Math.random() > 0.5
    ctx.fillStyle = light
      ? `rgba(120, 170, 90, ${0.08 + Math.random() * 0.12})`
      : `rgba(30, 70, 35, ${0.06 + Math.random() * 0.1})`
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * 0.7, Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const h = 2 + Math.random() * 10
    const lean = (Math.random() - 0.5) * 3
    const g = 90 + Math.random() * 80
    ctx.strokeStyle = `rgba(${25 + Math.random() * 20}, ${g}, ${25 + Math.random() * 25}, ${0.15 + Math.random() * 0.35})`
    ctx.lineWidth = 0.4 + Math.random() * 0.8
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + lean, y - h)
    ctx.stroke()
  }

  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    ctx.fillStyle = `rgba(${40 + Math.random() * 30}, ${110 + Math.random() * 50}, ${40 + Math.random() * 30}, 0.25)`
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 3)
  }

  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(12, 12)
  texture.colorSpace = SRGBColorSpace
  return texture
}

interface GrassGroundProps {
  size?: number
  onClick?: (event: ThreeEvent<MouseEvent>) => void
}

export function GrassGround({ size = 50, onClick }: GrassGroundProps) {
  const texture = useMemo(() => createGrassTexture(), [])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.005, 0]}
      receiveShadow
      onClick={onClick}
    >
      <planeGeometry args={[size, size, 1, 1]} />
      <meshStandardMaterial map={texture} roughness={0.92} metalness={0} envMapIntensity={0.4} />
    </mesh>
  )
}

export const SKY_BACKGROUND = '#c5dce8'
