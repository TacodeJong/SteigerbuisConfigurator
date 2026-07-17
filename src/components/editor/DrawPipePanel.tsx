import type { FormEvent } from 'react'
import type { SnapKind } from '../../lib/snap'
import { MIN_PIPE_LEN_MM } from '../../lib/snap'

interface DrawPipePanelProps {
  lengthMm: number
  directionLabel: string
  startLabel: string
  endFree: boolean
  onLengthChange: (mm: number) => void
  onPlace: () => void
  onCancel: () => void
}

export function DrawPipePanel({
  lengthMm,
  directionLabel,
  startLabel,
  endFree,
  onLengthChange,
  onPlace,
  onCancel,
}: DrawPipePanelProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onPlace()
  }

  return (
    <form className="draw-pipe-panel" onSubmit={submit}>
      <div className="draw-pipe-panel-head">
        <strong>Nieuwe buis</strong>
        <button type="button" className="draw-pipe-close" onClick={onCancel} aria-label="Annuleren">
          ✕
        </button>
      </div>
      <p className="draw-pipe-meta">
        Start: {startLabel} · Richting: {directionLabel}
        {endFree ? ' · Eind vrij' : ' · Eind op buis'}
      </p>
      <label className="draw-pipe-length">
        Lengte (mm)
        <input
          type="number"
          min={MIN_PIPE_LEN_MM}
          max={12000}
          step={50}
          value={lengthMm}
          onChange={(e) => onLengthChange(Math.max(MIN_PIPE_LEN_MM, Number(e.target.value) || MIN_PIPE_LEN_MM))}
        />
      </label>
      <div className="draw-pipe-actions">
        <button type="submit" className="draw-pipe-place">
          Plaatsen
        </button>
        <button type="button" className="draw-pipe-cancel" onClick={onCancel}>
          Annuleren
        </button>
      </div>
    </form>
  )
}

export function drawStartLabel(kind: SnapKind): string {
  if (kind === 'ground') return 'Grond'
  if (kind === 'segment') return 'Op buis'
  return 'Buis'
}
