/** App visual themes. Applied via `data-theme` on <html>. */

export type ThemeId = 'werkplaats' | 'speels'

export interface ThemeMeta {
  id: ThemeId
  label: string
  description: string
  /** Preview swatches for the admin picker */
  swatches: string[]
}

export const THEME_IDS: ThemeId[] = ['werkplaats', 'speels']

export const DEFAULT_THEME: ThemeId = 'werkplaats'

export const THEMES: Record<ThemeId, ThemeMeta> = {
  werkplaats: {
    id: 'werkplaats',
    label: 'Werkplaats',
    description:
      'Rustig staal & hemelblauw — voor vaders en familie die een duidelijke onderdelenlijst willen voor steigerbuisconstructies.',
    swatches: ['#C5DCE8', '#A8B4C0', '#1A6B5C', '#C46A1B', '#1E1E1E'],
  },
  speels: {
    id: 'speels',
    label: 'Speels',
    description: 'Paars/roze/candy — de eerdere speelse stijl.',
    swatches: ['#FEF08A', '#FBCFE8', '#7C3AED', '#EC4899', '#14B8A6'],
  },
}

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return value === 'werkplaats' || value === 'speels'
}
