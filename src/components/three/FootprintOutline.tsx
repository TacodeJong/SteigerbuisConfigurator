import { useMemo } from 'react'
import { Line, Text } from '@react-three/drei'
import type { ScenePipe } from '../../types'
import { formatMm } from '../../lib/bom'
import { computeFootprint } from '../../lib/floorplan'

/** Iets boven het gras om z-fighting te voorkomen. */
const LIFT_M = 0.012

interface FootprintOutlineProps {
  pipes: ScenePipe[]
  /**
   * Config-buitenmaten (mm). Wanneer gezet: labels matchen de invoervelden Breedte/Diepte.
   * Weglaten: labels volgen de echte pipe-footprint (L+Ø), bv. bij buislengte-modus.
   */
  labelWidthMm?: number
  labelDepthMm?: number
}

/** Rechthoek op de grond met de benodigde ruimte (lengte × breedte) van het toestel. */
export function FootprintOutline({ pipes, labelWidthMm, labelDepthMm }: FootprintOutlineProps) {
  const rect = useMemo(() => {
    const fp = computeFootprint(pipes)
    if (!fp) return null
    return {
      minX: fp.minX,
      maxX: fp.maxX,
      minZ: fp.minZ,
      maxZ: fp.maxZ,
      w: fp.maxX - fp.minX,
      d: fp.maxZ - fp.minZ,
      widthMm: fp.widthMm,
      depthMm: fp.depthMm,
    }
  }, [pipes])

  if (!rect) return null
  const { minX, maxX, minZ, maxZ, w, d, widthMm, depthMm } = rect
  const y = LIFT_M
  const labelSize = Math.min(Math.max(Math.max(w, d) * 0.055, 0.09), 0.2)
  // Config-overrides alleen voor configurator-preview; editor gebruikt echte envelope.
  const widthLabelMm = labelWidthMm ?? widthMm
  const depthLabelMm = labelDepthMm ?? depthMm

  const labelProps = {
    fontSize: labelSize,
    color: '#ffffff',
    outlineWidth: labelSize * 0.07,
    outlineColor: '#20402c',
    anchorX: 'center' as const,
    anchorY: 'middle' as const,
  }

  return (
    <group renderOrder={1}>
      <Line
        points={[
          [minX, y, minZ],
          [maxX, y, minZ],
          [maxX, y, maxZ],
          [minX, y, maxZ],
          [minX, y, minZ],
        ]}
        color="#f2f6f2"
        lineWidth={2}
        dashed
        dashSize={0.12}
        gapSize={0.07}
      />
      {/* Breedte langs X — label aan de voorzijde */}
      <Text
        position={[(minX + maxX) / 2, y, maxZ + labelSize * 1.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        {...labelProps}
      >
        {formatMm(widthLabelMm)}
      </Text>
      {/* Diepte langs Z — label aan de rechterzijde */}
      <Text
        position={[maxX + labelSize * 1.2, y, (minZ + maxZ) / 2]}
        rotation={[-Math.PI / 2, 0, Math.PI / 2]}
        {...labelProps}
      >
        {formatMm(depthLabelMm)}
      </Text>
    </group>
  )
}
