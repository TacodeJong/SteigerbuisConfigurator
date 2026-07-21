import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../hooks/useMediaQuery'

/** Matches App.css mobile layout breakpoint (3-col → stack). */
export const MOBILE_LAYOUT_MQ = '(max-width: 1100px)'

interface ResponsiveBomSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

/**
 * Desktop: BOM in the right column (`.main-sidebar`).
 * Mobile (≤1100px): sidebar leaves the layout; BOM opens as a bottom sheet
 * (portaled) so the 3D viewport can use the full remaining height.
 */
export function ResponsiveBomSidebar({ open, onOpenChange, children }: ResponsiveBomSidebarProps) {
  const isMobile = useMediaQuery(MOBILE_LAYOUT_MQ)

  useEffect(() => {
    if (!isMobile || !open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMobile, open, onOpenChange])

  useEffect(() => {
    if (!isMobile && open) onOpenChange(false)
  }, [isMobile, open, onOpenChange])

  if (!isMobile) {
    return <aside className="main-sidebar">{children}</aside>
  }

  if (!open) return null

  return createPortal(
    <>
      <button
        type="button"
        className="bom-sheet-backdrop"
        aria-label="Stuklijst sluiten"
        onClick={() => onOpenChange(false)}
      />
      <aside
        className="main-sidebar main-sidebar--sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bom-sheet-title"
      >
        <div className="bom-sheet-chrome">
          <h2 id="bom-sheet-title">Stuklijst</h2>
          <button
            type="button"
            className="md-icon-btn"
            onClick={() => onOpenChange(false)}
            aria-label="Sluiten"
          >
            <span aria-hidden>×</span>
          </button>
        </div>
        <div className="bom-sheet-body">{children}</div>
      </aside>
    </>,
    document.body,
  )
}

interface BomSheetTriggerProps {
  onClick: () => void
  className?: string
}

/** Visible only on mobile layout; opens the BOM bottom sheet. */
export function BomSheetTrigger({ onClick, className = '' }: BomSheetTriggerProps) {
  const isMobile = useMediaQuery(MOBILE_LAYOUT_MQ)
  if (!isMobile) return null
  return (
    <button
      type="button"
      className={`bom-action-btn bom-sheet-trigger${className ? ` ${className}` : ''}`}
      onClick={onClick}
    >
      Stuklijst
    </button>
  )
}
