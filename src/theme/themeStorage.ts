import { DEFAULT_THEME, isThemeId, type ThemeId } from './themes'

const THEME_KEY = 'steigerbuis-theme'

export function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (isThemeId(raw)) return raw
  } catch {
    /* private mode */
  }
  return DEFAULT_THEME
}

export function writeStoredTheme(theme: ThemeId): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* ignore */
  }
}

export function applyThemeToDocument(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
}
