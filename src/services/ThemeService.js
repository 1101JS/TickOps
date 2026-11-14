
const THEME_KEY = 'tickops-theme'

const VALID_THEMES = ['light', 'dark', 'system']

class ThemeService {

  GetSavedTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY)

    return VALID_THEMES.includes(savedTheme)
      ? savedTheme
      : 'system'
  }

  GetSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }

  ApplyTheme(theme) {
    const selectedTheme = VALID_THEMES.includes(theme)
      ? theme
      : 'system'

    const activeTheme = selectedTheme === 'system'
      ? this.GetSystemTheme()
      : selectedTheme

    document.documentElement.setAttribute(
      'data-theme',
      activeTheme
    )

    return activeTheme
  }

  SetTheme(theme) {
    if (!VALID_THEMES.includes(theme)) return

    localStorage.setItem(THEME_KEY, theme)

    return this.ApplyTheme(theme)
  }

  InitializeTheme() {
    const savedTheme = this.GetSavedTheme()

    return this.ApplyTheme(savedTheme)
  }

  GetCurrentPreference() {
    return this.GetSavedTheme()
  }
}

export default new ThemeService()
