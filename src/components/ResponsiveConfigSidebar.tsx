import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { MOBILE_LAYOUT_MQ } from './ResponsiveBomSidebar'

interface ResponsiveConfigSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  /** Sheet title on mobile. */
  title?: string
}

/**
 * Desktop: config/editor controls in the left column (`.main-left`).
 * Mobile (≤1100px): panel leaves the layout; opens as a bottom sheet
 * (portaled) so the 3D viewport can use the full remaining height.
 */
export function ResponsiveConfigSidebar({
  open,
  onOpenChange,
  children,
  title = 'Aanpassen',
}: ResponsiveConfigSidebarProps) {
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
    return <div className="main-left">{children}</div>
  }

  if (!open) return null

  return createPortal(
    <>
      <button
        type="button"
        className="bom-sheet-backdrop"
        aria-label={`${title} sluiten`}
        onClick={() => onOpenChange(false)}
      />
      <aside
        className="main-left main-left--sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="config-sheet-title"
      >
        <div className="bom-sheet-chrome">
          <h2 id="config-sheet-title">{title}</h2>
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

interface ConfigSheetTriggerProps {
  onClick: () => void
  className?: string
  label?: string
}

/** Visible only on mobile layout; opens the config/editor bottom sheet. */
export function ConfigSheetTrigger({
  onClick,
  className = '',
  label = 'Aanpassen',
}: ConfigSheetTriggerProps) {
  const isMobile = useMediaQuery(MOBILE_LAYOUT_MQ)
  if (!isMobile) return null
  return (
    <button
      type="button"
      className={`bom-action-btn bom-sheet-trigger${className ? ` ${className}` : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
