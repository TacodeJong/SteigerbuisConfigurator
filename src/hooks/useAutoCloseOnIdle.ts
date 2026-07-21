import { useEffect, useRef, type RefObject } from 'react'

/** Activity that keeps an open menu alive. */
const IDLE_EVENTS = [
  'pointerdown',
  'pointermove',
  'pointerenter',
  'focusin',
  'keydown',
  'wheel',
  'scroll',
] as const

/** Default idle timeout before auto-closing open menus (ms). */
export const MENU_IDLE_CLOSE_MS = 4500

/**
 * While `open` is true, closes via `onClose` after `ms` without pointer/focus/keyboard
 * activity on the element attached to the returned ref.
 */
export function useAutoCloseOnIdle(
  open: boolean,
  onClose: () => void,
  ms: number = MENU_IDLE_CLOSE_MS,
): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    const el = ref.current
    if (!el) return

    let timer = window.setTimeout(() => onCloseRef.current(), ms)

    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => onCloseRef.current(), ms)
    }

    for (const event of IDLE_EVENTS) {
      el.addEventListener(event, reset, { passive: true })
    }

    return () => {
      window.clearTimeout(timer)
      for (const event of IDLE_EVENTS) {
        el.removeEventListener(event, reset)
      }
    }
  }, [open, ms])

  return ref
}
