import type { RouteObject } from 'react-router-dom'
import { Layout } from './Layout'
import { NotFoundPage } from './NotFoundPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { SubjectsPage } from '../features/subjects/SubjectsPage'
import { SubjectDetailPage } from '../features/subjects/SubjectDetailPage'
import { LibraryPage } from '../features/documents/LibraryPage'
import { QuestionsPage } from '../features/questions/QuestionsPage'
import { ExamsPage } from '../features/exams/ExamsPage'
import { HistoryPage } from '../features/results/HistoryPage'
import { SettingsPage } from '../features/settings/SettingsPage'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'subjects', element: <SubjectsPage /> },
      { path: 'subjects/:subjectId', element: <SubjectDetailPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'questions', element: <QuestionsPage /> },
      { path: 'exams', element: <ExamsPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
