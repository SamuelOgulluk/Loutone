export const THEME_IDS = [
  'harbor-glow',
  'river-dusk',
  'studio-ink',
  'paper-score',
  'vinyl-night',
] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const THEME_LABELS = {
  'river-dusk': 'Rivière',
  'studio-ink': 'Encre',
  'paper-score': 'Partition',
  'vinyl-night': 'Vinyle',
  'harbor-glow': 'Quai',
} as const

const STORAGE_KEY = 'loutone-theme'
const DEFAULT_THEME = 'harbor-glow'

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value)
}

export function getStoredTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && isThemeId(raw)) return raw
  } catch {
    // ignore
  }
  return DEFAULT_THEME
}

export function applyTheme(themeId: string) {
  const id = isThemeId(themeId) ? themeId : DEFAULT_THEME
  document.documentElement.setAttribute('data-theme', id)
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent('loutone-theme', { detail: id }))
  return id
}

export function initTheme() {
  return applyTheme(getStoredTheme())
}
