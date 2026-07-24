export const THEME_IDS = [
  'studio-amber',
  'studio-graphite',
  'tape-warm',
  'night-steel',
  'ink-lime',
] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const THEME_LABELS = {
  'studio-amber': 'Studio Ambre',
  'studio-graphite': 'Studio Turquoise',
  'tape-warm': 'Tape Warm',
  'night-steel': 'Night Steel',
  'ink-lime': 'Encre & citron',
} as const

const STORAGE_KEY = 'soft-theme'
const DEFAULT_THEME = 'studio-amber'

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
