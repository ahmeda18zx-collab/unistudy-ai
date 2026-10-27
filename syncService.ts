import { db } from '../db/db'
import type { Subject, Unit, Lesson, Question } from '../types'

const STATE_KEY = 'unistudy.shared.state'

interface SharedState {
  version: number
  ids: { subjects: string[]; units: string[]; lessons: string[]; questions: string[] }
}
interface Catalog {
  version: number
  updatedAt: number
  subjects: Subject[]
  units: Unit[]
  lessons: Lesson[]
  questions: Question[]
}
export interface SyncResult {
  status: 'updated' | 'up-to-date' | 'offline' | 'unavailable'
  version?: number
  message: string
}

function readState(): SharedState {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (raw) return JSON.parse(raw) as SharedState
  } catch {
    /* ignore */
  }
  return { version: 0, ids: { subjects: [], units: [], lessons: [], questions: [] } }
}
function writeState(s: SharedState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s))
  } catch {
    /* storage full / blocked: sync still works, just re-downloads next time */
  }
}

export const syncService = {
  getLocalVersion(): number {
    return readState().version
  },

  /** Downloads the shared catalog (only when the server version changed) and merges it into the local DB. */
  async sync(force = false): Promise<SyncResult> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { status: 'offline', message: 'لا يوجد اتصال بالإنترنت. تعمل المنصة بآخر محتوى محفوظ على جهازك.' }
    }
    try {
      const state = readState()
      const metaRes = await fetch('/api/content?meta=1')
      if (!metaRes.ok) return { status: 'unavailable', message: 'المحتوى المشترك غير متاح حالياً.' }
      const meta = (await metaRes.json()) as { version: number }
      if (!force && meta.version === state.version) {
        return { status: 'up-to-date', version: meta.version, message: 'المحتوى محدّث.' }
      }
      const res = await fetch('/api/content')
      if (!res.ok) return { status: 'unavailable', message: 'تعذر تحميل المحتوى المشترك.' }
      const cat = (await res.json()) as Catalog
      if (!Array.isArray(cat.subjects)) return { status: 'unavailable', message: 'استجابة غير صالحة من الخادم.' }

      const next: SharedState['ids'] = {
        subjects: cat.subjects.map((x) => x.id),
        units: cat.units.map((x) => x.id),
        lessons: cat.lessons.map((x) => x.id),
        questions: cat.questions.map((x) => x.id),
      }
      await db.transaction('rw', [db.subjects, db.units, db.lessons, db.questions], async () => {
        // remove items that used to be shared but were removed by the publisher
        await db.questions.bulkDelete(state.ids.questions.filter((id) => !next.questions.includes(id)))
        await db.lessons.bulkDelete(state.ids.lessons.filter((id) => !next.lessons.includes(id)))
        await db.units.bulkDelete(state.ids.units.filter((id) => !next.units.includes(id)))
        await db.subjects.bulkDelete(state.ids.subjects.filter((id) => !next.subjects.includes(id)))
        await db.subjects.bulkPut(cat.subjects)
        await db.units.bulkPut(cat.units)
        await db.lessons.bulkPut(cat.lessons)
        await db.questions.bulkPut(cat.questions)
      })
      writeState({ version: cat.version, ids: next })
      return {
        status: 'updated',
        version: cat.version,
        message: `تم تحديث المحتوى: ${cat.subjects.length} مواد و${cat.questions.length} سؤال.`,
      }
    } catch (e) {
      console.error('[sync]', e)
      return { status: 'unavailable', message: 'تعذرت المزامنة. تعمل المنصة بالمحتوى المحفوظ.' }
    }
  },

  /** Publisher only: pushes the selected local subjects to the shared database. */
  async publish(subjectIds: string[], adminKey: string): Promise<{ ok: boolean; message: string }> {
    const subjects = await db.subjects.where('id').anyOf(subjectIds).toArray()
    const [units, lessons, questions] = await Promise.all([
      db.units.where('subjectId').anyOf(subjectIds).toArray(),
      db.lessons.where('subjectId').anyOf(subjectIds).toArray(),
      db.questions.where('subjectId').anyOf(subjectIds).toArray(),
    ])
    return this.post({ action: 'publish', subjects, units, lessons, questions }, adminKey)
  },

  async unpublish(subjectIds: string[], adminKey: string): Promise<{ ok: boolean; message: string }> {
    return this.post({ action: 'unpublish', subjectIds }, adminKey)
  },

  async post(body: unknown, adminKey: string): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return { ok: false, message: data.error || `فشل الطلب (${res.status})` }
      return { ok: true, message: 'تم النشر. سيصل التحديث لكل المستخدمين عند فتح المنصة.' }
    } catch {
      return { ok: false, message: 'تعذر الاتصال بالخادم.' }
    }
  },
}
