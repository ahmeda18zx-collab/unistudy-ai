import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { db } from '../src/db/db'

afterEach(async () => {
  cleanup()
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  try {
    await Promise.all([
      db.subjects.clear(),
      db.units.clear(),
      db.documents.clear(),
      db.questions.clear(),
      db.exams.clear(),
      db.examAttempts.clear(),
      db.studyProgress.clear(),
    ])
  } catch {
    // Ignore in non-db tests
  }
})
