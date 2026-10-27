export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'unistudy.theme'

/** يقرأ الثيم المحفوظ، وإلا يعتمد تفضيل النظام. يتحمل فشل الوصول إلى التخزين. */
export function getStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // التخزين غير متاح (وضع خاص مثلًا): نتجاهل ونكمل بالقيمة الافتراضية
  }
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

/** يطبّق الثيم ويحاول حفظه. يرجع false إذا تعذّر الحفظ. */
export function setTheme(theme: Theme): boolean {
  applyTheme(theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    return true
  } catch {
    return false
  }
}
