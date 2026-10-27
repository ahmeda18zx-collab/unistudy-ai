import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sun, Moon, GraduationCap, Wifi, WifiOff, Sparkles } from 'lucide-react'
import { OfflineBanner } from '../components/OfflineBanner'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useTheme } from '../hooks/useTheme'
import { NAV_ITEMS } from './navigation'
import { subjectService } from '../services/subjectService'
import type { Subject } from '../types'

const linkBase =
  'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-indigo-500'

export function Layout() {
  const { theme, toggle } = useTheme()
  const online = useOnlineStatus()
  const mobileItems = NAV_ITEMS.filter((item) => item.primary)
  const location = useLocation()
  const navigate = useNavigate()
  const [subjects, setSubjects] = useState<Subject[]>([])

  useEffect(() => {
    subjectService.getAll().then(setSubjects)
  }, [location.pathname])

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 md:flex dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-xl focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-white"
      >
        تخطي إلى المحتوى
      </a>

      {/* الشريط الجانبي: تابلت ولابتوب */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-l border-slate-200/80 bg-white p-4 md:flex dark:border-slate-800 dark:bg-slate-900">
        <div>
          {/* Logo Brand */}
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-tr from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-500/20">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <div className="font-black text-slate-900 dark:text-white">UniStudy AI</div>
              <div className="text-[10px] font-medium text-slate-400">منصتك الجامعية المستقلة</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav aria-label="التنقل الرئيسي">
            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        `${linkBase} ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-700 shadow-xs dark:bg-indigo-950/70 dark:text-indigo-300'
                            : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
                        }`
                      }
                    >
                      <Icon className="h-4.5 w-4.5 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>

        {/* Footer info in sidebar */}
        <div className="space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-400 dark:border-slate-800">
          <div className="flex items-center justify-between px-2">
            <span className="flex items-center gap-1.5 text-[11px]">
              {online ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  متصل
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  دون اتصال
                </>
              )}
            </span>
            <span className="text-[10px] font-mono">v0.2.0 (Phase 2)</span>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />

        {/* Top Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="font-black text-indigo-600 dark:text-indigo-400">UniStudy AI</span>
          </div>

          <div className="hidden text-xs font-medium text-slate-500 md:block dark:text-slate-400">
            {online ? 'البيانات مخزنة محلياً بالكامل على جهازك (IndexedDB)' : 'وضع عدم الاتصال: يمكنك تصفح ومذاكرة المواد المخزنة'}
          </div>

          <div className="flex items-center gap-2">
            

            {/* Theme switcher button */}
            <button
              type="button"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'التحويل للوضع الفاتح' : 'التحويل للوضع الداكن'}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-4 w-4 text-amber-400" />
                  <span className="hidden sm:inline">فاتح</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 text-indigo-600" />
                  <span className="hidden sm:inline">داكن</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Content area */}
        <main id="main" className="flex-1 p-4 pb-24 md:p-6 md:pb-8 lg:p-8">
          <Outlet />
        </main>

        {/* Global Import Curriculum Modal */}
        
      </div>

      {/* شريط التنقل السفلي: موبايل */}
      <nav
        aria-label="التنقل السريع"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-md md:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        <ul className="flex items-center justify-around">
          {mobileItems.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.path} className="flex-1">
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition-colors ${
                      isActive
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`
                  }
                >
                  <Icon className="h-4.5 w-4.5" />
                  <span>{item.shortLabel}</span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
