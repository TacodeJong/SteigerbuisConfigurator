import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function listFocusable(container: HTMLElement, opts?: { skipInitialSkip?: boolean }): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter((el) => {
    if (el.hasAttribute('disabled')) return false
    if (opts?.skipInitialSkip && el.hasAttribute('data-modal-initial-skip')) return false
    // Verborgen / display:none
    if (el.getClientRects().length === 0) return false
    return true
  })
}

interface UseModalA11yOptions {
  open: boolean
  onClose: () => void
  containerRef: RefObject<HTMLElement | null>
  /** Optioneel: expliciet eerste focus-doel. Anders eerste focusable (sluitknop overslaan). */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Escape sluit het dialoog. Zet false bij geneste dialogen of busy-state. */
  closeOnEscape?: boolean
}

/**
 * Escape om te sluiten, initiële focus, eenvoudige focus-trap, en return-focus
 * naar het element dat open was vóór het dialoog.
 */
export function useModalA11y({
  open,
  onClose,
  containerRef,
  initialFocusRef,
  closeOnEscape = true,
}: UseModalA11yOptions) {
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusInitial = () => {
      const container = containerRef.current
      const explicit = initialFocusRef?.current
      if (explicit) {
        explicit.focus()
        return
      }
      if (!container) return
      const candidates = listFocusable(container, { skipInitialSkip: true })
      const fallback = listFocusable(container)
      ;(candidates[0] ?? fallback[0] ?? container).focus()
    }

    const t = window.setTimeout(focusInitial, 0)

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const container = containerRef.current
      if (!container) return
      const focusables = listFocusable(container)
      if (focusables.length === 0) {
        e.preventDefault()
        container.focus()
        return
      }
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !container.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', onKeyDown, true)
      const prev = previousFocusRef.current
      previousFocusRef.current = null
      if (prev && document.contains(prev)) {
        prev.focus()
      }
    }
  }, [open, containerRef, initialFocusRef, closeOnEscape])
}
