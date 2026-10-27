import type { ComponentType } from 'react'
import {
  LayoutDashboard,
  BookOpen,
  Files,
  HelpCircle,
  Award,
  History,
  Settings,
} from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  shortLabel: string
  primary: boolean
  icon: ComponentType<{ className?: string }>
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    path: '/',
    label: 'لوحة التحكم',
    shortLabel: 'الرئيسية',
    primary: true,
    icon: LayoutDashboard,
  },
  {
    path: '/subjects',
    label: 'المواد الدراسية',
    shortLabel: 'المواد',
    primary: true,
    icon: BookOpen,
  },
  {
    path: '/library',
    label: 'مكتبة الملفات',
    shortLabel: 'الملفات',
    primary: true,
    icon: Files,
  },
  {
    path: '/questions',
    label: 'بنك الأسئلة',
    shortLabel: 'الأسئلة',
    primary: false,
    icon: HelpCircle,
  },
  {
    path: '/exams',
    label: 'الامتحانات',
    shortLabel: 'الامتحانات',
    primary: true,
    icon: Award,
  },
  {
    path: '/history',
    label: 'سجل الأداء',
    shortLabel: 'السجل',
    primary: false,
    icon: History,
  },
  {
    path: '/settings',
    label: 'الإعدادات والنسخ الاحتياطي',
    shortLabel: 'الإعدادات',
    primary: true,
    icon: Settings,
  },
]
