import { useCallback, useState } from 'react'
import { getStoredTheme, setTheme, type Theme } from '../utils/theme'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme())

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }, [theme])

  return { theme, toggle }
}
