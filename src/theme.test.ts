import { describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY, getStoredTheme, setTheme } from '../src/utils/theme'

describe('theme', () => {
  it('يرجع الثيم المحفوظ إذا كان صالحًا', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    expect(getStoredTheme()).toBe('dark')
  })

  it('يتجاهل قيمة محفوظة غير صالحة ويرجع إلى light عند غياب تفضيل النظام', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple')
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(getStoredTheme()).toBe('light')
    vi.unstubAllGlobals()
  })

  it('يتبع تفضيل النظام الداكن عند عدم وجود قيمة محفوظة', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(getStoredTheme()).toBe('dark')
    vi.unstubAllGlobals()
  })

  it('setTheme يطبّق الصنف dark ويحفظ القيمة', () => {
    expect(setTheme('dark')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    expect(setTheme('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('setTheme يرجع false ولا يرمي خطأ إذا فشل الحفظ، ويبقى الثيم مطبّقًا', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(setTheme('dark')).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    spy.mockRestore()
  })
})
