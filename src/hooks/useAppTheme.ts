import { useCallback, useState } from 'react'
import { applyThemeToDocument, readStoredTheme, writeStoredTheme } from '../theme/themeStorage'
import { DEFAULT_THEME, type ThemeId } from '../theme/themes'

/** Call once before React render so first paint matches stored theme. */
export function bootstrapTheme(): ThemeId {
  const theme = readStoredTheme()
  applyThemeToDocument(theme)
  return theme
}

export function useAppTheme() {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof document === 'undefined') return DEFAULT_THEME
    const stored = readStoredTheme()
    applyThemeToDocument(stored)
    return stored
  })

  const setTheme = useCallback((next: ThemeId) => {
    writeStoredTheme(next)
    applyThemeToDocument(next)
    setThemeState(next)
  }, [])

  return { theme, setTheme }
}
