import { useEffect, useRef, useState } from 'react'

export function useContainerSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      // Rond af zodat subpixel-jitter geen overbodige Canvas-resizes triggert.
      const next = { width: Math.round(width), height: Math.round(height) }
      setSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      )
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, width: size.width, height: size.height }
}
